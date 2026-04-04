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
  validateResponse, 
  getEmergencyResponse 
} from './guardrails';
import { redactPHI } from './phi-redaction';
import type { MemoryTag, TagExtractionResult } from '@/types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const model = genAI.getGenerativeModel({ 
  model: 'gemini-2.5-flash',
  generationConfig: {
    temperature: 0.7,
    topP: 0.8,
    topK: 40,
    maxOutputTokens: 1024,
  },
});

export interface ChatResponse {
  content: string;
  language: string;
  isEmergency: boolean;
  extractedTags: TagExtractionResult[];
}

export async function generateChatResponse(
  userMessage: string,
  conversationHistory: Array<{ role: 'user' | 'model'; content: string }>,
  memoryTags: MemoryTag[]
): Promise<ChatResponse> {
  const inputCheck = checkInputSafety(userMessage);
  
  if (!inputCheck.safe) {
    return {
      content: "I'm not able to help with that request. If you have health-related questions, I'm here to assist.",
      language: 'en',
      isEmergency: false,
      extractedTags: [],
    };
  }

  const isEmergency = inputCheck.reason === 'emergency_detected';
  if (isEmergency) {
    return {
      content: getEmergencyResponse(),
      language: 'en',
      isEmergency: true,
      extractedTags: [],
    };
  }

  const language = detectLanguage(userMessage);
  const contextPrompt = buildContextPrompt(memoryTags);
  
  const languageInstruction = language !== 'en' 
    ? `\n\nIMPORTANT: The patient is writing in ${language}. Respond in the same language.`
    : '';

  const fullSystemPrompt = SYSTEM_PROMPT + contextPrompt + languageInstruction;

  try {
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

    const validatedResponse = validateResponse(responseText);

    const extractedTags = await extractTags(userMessage);

    return {
      content: validatedResponse,
      language,
      isEmergency: false,
      extractedTags,
    };
  } catch (error) {
    console.error('Gemini API error:', error);
    return {
      content: "I'm having trouble processing your message right now. Please try again in a moment.",
      language: 'en',
      isEmergency: false,
      extractedTags: [],
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

    return result.response.text();
  } catch (error) {
    console.error('Triage summary error:', error);
    return 'Unable to generate summary. Please review the conversation directly.';
  }
}

export async function generateClinicianDraft(
  question: string,
  contextSnapshot: MemoryTag[]
): Promise<string> {
  try {
    const contextText = contextSnapshot.length > 0
      ? '\n\nPatient context:\n' + contextSnapshot.map(t => `- ${t.value} (${t.status})`).join('\n')
      : '';

    const result = await model.generateContent([
      CLINICIAN_DRAFT_PROMPT,
      `Patient question: "${question}"${contextText}`,
    ]);

    return result.response.text();
  } catch (error) {
    console.error('Clinician draft error:', error);
    return '';
  }
}
