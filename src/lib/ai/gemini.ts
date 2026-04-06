import { GoogleGenerativeAI } from '@google/generative-ai';
import { 
  SYSTEM_PROMPT, 
  buildContextPrompt, 
  TAG_EXTRACTION_PROMPT,
  TRIAGE_SUMMARY_PROMPT,
  CLINICIAN_DRAFT_PROMPT,
  detectLanguage,
} from './prompts';
import { 
  checkInputSafety, 
  assessMedicalRisk,
  validateResponse, 
  getEmergencyResponse 
} from './guardrails';
import { redactPHI } from './phi-redaction';
import { DEMO_PROVIDER } from '@/lib/demo';
import type { MemoryTag, RiskAssessment, TagExtractionResult } from '@/types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY);

const model = genAI.getGenerativeModel({ 
  model: 'gemini-2.5-flash',
  generationConfig: {
    temperature: 0.4,
    topP: 0.8,
    topK: 40,
    maxOutputTokens: 256,
  },
});

export interface ChatResponse {
  content: string;
  language: string;
  isEmergency: boolean;
  extractedTags: TagExtractionResult[];
  riskAssessment: RiskAssessment;
  shouldEscalate: boolean;
}

function buildFallbackChatResponse(userMessage: string, riskAssessment: RiskAssessment): string {
  const normalized = userMessage.toLowerCase();

  if (riskAssessment.emergency) {
    return getEmergencyResponse();
  }

  if (normalized.includes('biopsy')) {
    return `Bring your medication list and follow the prep instructions your care team already gave you. If you still need medication clarification, send this to ${DEMO_PROVIDER.clinicianName} or the ${DEMO_PROVIDER.hospitalName} care team.`;
  }

  if (normalized.includes('headache')) {
    return 'Keep track of when the headache happens and whether you notice vomiting, weakness, or vision changes. If any of those warning signs appear, seek urgent care or ask the care team for a same-week review.';
  }

  if (normalized.includes('nausea')) {
    return 'Try noting what time you take the tablets, what you ate, and when the nausea starts. If it keeps lasting through the morning or you cannot keep fluids down, send it to the care team today.';
  }

  if (normalized.includes('breath') || normalized.includes('lump')) {
    return `This deserves a clinician review soon. Please send it to ${DEMO_PROVIDER.clinicianName} or the ${DEMO_PROVIDER.hospitalName} care team so they can guide the next step.`;
  }

  if (riskAssessment.level === 'high') {
    return `This sounds important enough for a clinician review. Please send it to ${DEMO_PROVIDER.clinicianName} or the ${DEMO_PROVIDER.hospitalName} care team for a verified answer.`;
  }

  return 'I can help with general information here. If the symptoms are getting worse or you want more certainty, send this to your care team for a verified reply.';
}

function buildDeterministicTriageSummary(
  messages: Array<{ sender: string; content: string }>,
  memoryTags: MemoryTag[]
): string {
  const latestPatientMessage =
    [...messages].reverse().find((message) => message.sender === 'patient')?.content ||
    'Patient follow-up question.';
  const context = memoryTags
    .slice(0, 2)
    .map((tag) => `${tag.value} (${tag.status})`)
    .join('; ');
  const contextSentence = context
    ? `Context: ${context}.`
    : 'Context: no prior structured tags were attached.';

  return `Patient asks: ${latestPatientMessage}. ${contextSentence} Needs queue review from ${DEMO_PROVIDER.hospitalName}.`;
}

function buildDeterministicClinicianDraft(
  question: string,
  contextSnapshot: MemoryTag[]
): string {
  const contextLine = contextSnapshot[0]?.value
    ? ` Noted context: ${contextSnapshot[0].value}.`
    : '';

  return validateResponse(
    `Thanks for checking in. Based on what you've shared, I would like our team to review this and confirm the safest next step.${contextLine}`
  );
}

export async function generateChatResponse(
  userMessage: string,
  conversationHistory: Array<{ role: 'user' | 'model'; content: string }>,
  memoryTags: MemoryTag[]
): Promise<ChatResponse> {
  const inputCheck = checkInputSafety(userMessage);
  const riskAssessment = assessMedicalRisk(userMessage);
  
  if (!inputCheck.safe) {
    return {
      content: "I'm not able to help with that request. If you have health-related questions, I'm here to assist.",
      language: 'en',
      isEmergency: false,
      extractedTags: [],
      riskAssessment,
      shouldEscalate: riskAssessment.escalationRecommended,
    };
  }

  const isEmergency = inputCheck.reason === 'emergency_detected';
  if (isEmergency) {
    return {
      content: getEmergencyResponse(),
      language: 'en',
      isEmergency: true,
      extractedTags: [],
      riskAssessment,
      shouldEscalate: true,
    };
  }

  const language = detectLanguage(userMessage);
  const contextPrompt = buildContextPrompt(memoryTags);
  
  const languageInstruction = language !== 'en' 
    ? `\n\nIMPORTANT: The patient is writing in ${language}. Respond in the same language.`
    : '';

  const fullSystemPrompt = SYSTEM_PROMPT + contextPrompt + languageInstruction;

  try {
    if (!hasGeminiKey) {
      throw new Error('Missing Gemini API key');
    }

    const chat = model.startChat({
      history: [
        { role: 'user', parts: [{ text: 'System instructions: ' + fullSystemPrompt }] },
        { role: 'model', parts: [{ text: 'Understood. I will follow these guidelines.' }] },
        ...conversationHistory.map(msg => ({
          role: msg.role as 'user' | 'model',
          parts: [{ text: msg.content }],
        })),
      ],
    });

    const { redactedText } = redactPHI(userMessage);
    
    const result = await chat.sendMessage(redactedText);
    const responseText = result.response.text();

    const responseWithEscalationHint =
      riskAssessment.level === 'high' && !/care team|clinic|dr alan|sjmc/i.test(responseText)
        ? `${responseText} Please send this to ${DEMO_PROVIDER.clinicianName} or the ${DEMO_PROVIDER.hospitalName} care team today.`
        : responseText;

    const validatedResponse = validateResponse(responseWithEscalationHint);

    const extractedTags = await extractTags(userMessage);

    return {
      content: validatedResponse,
      language,
      isEmergency: false,
      extractedTags,
      riskAssessment,
      shouldEscalate: riskAssessment.escalationRecommended,
    };
  } catch (error) {
    console.error('Gemini API error:', error);
    return {
      content: buildFallbackChatResponse(userMessage, riskAssessment),
      language: 'en',
      isEmergency: false,
      extractedTags: [],
      riskAssessment,
      shouldEscalate: riskAssessment.escalationRecommended,
    };
  }
}

export async function extractTags(message: string): Promise<TagExtractionResult[]> {
  try {
    const { redactedText } = redactPHI(message);
    
    const result = await model.generateContent([
      TAG_EXTRACTION_PROMPT,
      `Patient message: "${redactedText}"`,
    ]);

    const responseText = result.response.text();
    
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]) as TagExtractionResult[];
    return parsed.filter(tag => tag.confidence >= 0.7);
  } catch (error) {
    console.error('Tag extraction error:', error);
    return [];
  }
}

export async function generateTriageSummary(
  messages: Array<{ sender: string; content: string }>,
  memoryTags: MemoryTag[]
): Promise<string> {
  try {
    if (!hasGeminiKey) {
      throw new Error('Missing Gemini API key');
    }

    const conversationText = messages
      .map(m => `${m.sender}: ${m.content}`)
      .join('\n');

    const contextText = memoryTags.length > 0
      ? '\n\nPatient context:\n' + memoryTags.map(t => `- ${t.value} (${t.status})`).join('\n')
      : '';

    const result = await model.generateContent([
      TRIAGE_SUMMARY_PROMPT,
      `Conversation:\n${conversationText}${contextText}`,
    ]);

    return validateResponse(result.response.text());
  } catch (error) {
    console.error('Triage summary error:', error);
    return buildDeterministicTriageSummary(messages, memoryTags);
  }
}

export async function generateClinicianDraft(
  question: string,
  contextSnapshot: MemoryTag[]
): Promise<string> {
  try {
    if (!hasGeminiKey) {
      throw new Error('Missing Gemini API key');
    }

    const contextText = contextSnapshot.length > 0
      ? '\n\nPatient context:\n' + contextSnapshot.map(t => `- ${t.value} (${t.status})`).join('\n')
      : '';

    const result = await model.generateContent([
      CLINICIAN_DRAFT_PROMPT,
      `Patient question: "${question}"${contextText}`,
    ]);

    return validateResponse(result.response.text());
  } catch (error) {
    console.error('Clinician draft error:', error);
    return buildDeterministicClinicianDraft(question, contextSnapshot);
  }
}
