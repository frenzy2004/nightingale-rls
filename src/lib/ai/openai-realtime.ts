import {
  SYSTEM_PROMPT,
  buildContextPrompt,
  CLINICIAN_DRAFT_OPENING,
  CLINICIAN_DRAFT_PROMPT,
  TAG_EXTRACTION_PROMPT,
  TRIAGE_SUMMARY_PROMPT,
  detectLanguage,
} from './prompts';
import {
  assessMedicalRisk,
  checkInputSafety,
  getEmergencyResponse,
  validateResponse,
} from './guardrails';
import { redactPHI } from './phi-redaction';
import { buildWebGroundingPrompt, getTrustedWebGrounding } from './web-grounding';
import { DEMO_PROVIDER } from '@/lib/demo';
import type { MemoryTag, RiskAssessment, SourceReference, TagExtractionResult } from '@/types';

const azureRealtimeKey = process.env.AZURE_OPENAI_API_KEY || '';
const azureRealtimeEndpoints = [
  process.env.AZURE_OPENAI_REALTIME_ENDPOINT,
  process.env.AZURE_OPENAI_REALTIME_FALLBACK_ENDPOINT,
].filter(Boolean) as string[];

const hasRealtimeConfig = Boolean(azureRealtimeKey && azureRealtimeEndpoints.length > 0);

type ConversationRole = 'user' | 'model';

interface ConversationEntry {
  role: ConversationRole;
  content: string;
}

interface ChatResponseBase {
  content: string;
  language: string;
  isEmergency: boolean;
  extractedTags: TagExtractionResult[];
  riskAssessment: RiskAssessment;
  shouldEscalate: boolean;
}

export interface ChatResponse extends ChatResponseBase {
  transcript?: string;
  sources?: SourceReference[];
}

interface RealtimeSessionOptions {
  instructions: string;
  conversationHistory?: ConversationEntry[];
  userText?: string;
  userImageUrl?: string;
  audioBase64?: string;
  transcriptHint?: string;
  maxOutputTokens?: number;
}

interface RealtimeSessionResult {
  text: string;
  transcript: string;
}

function buildLowRiskAssessment(): RiskAssessment {
  return {
    level: 'low',
    matchedSignals: [],
    summary: 'No deterministic high-risk signals detected.',
    emergency: false,
    escalationRecommended: false,
  };
}

function isDataSummaryRequest(message: string): boolean {
  return /\b(what (data|info|information).*(got|have) on me|what do you know about me|what do you have on me|what's in my record|summari[sz]e what you know)\b/i.test(
    message
  );
}

function buildKnownDataResponse(memoryTags: MemoryTag[]): string {
  const relevantTags = memoryTags
    .filter((tag) => tag.status === 'active' || tag.status === 'flagged')
    .slice(0, 4);

  if (relevantTags.length === 0) {
    return 'From this chat, I only know what you have shared in the conversation so far. If you want, I can help summarize your recent questions or concerns.';
  }

  const summary = relevantTags
    .map((tag) => tag.value)
    .join('; ');

  return `From our chat, I have notes like: ${summary}. If you want, I can turn that into a short summary for you or help check if anything looks outdated.`;
}

function shouldReplaceWithConversationalFallback(
  responseText: string,
  userMessage: string,
  riskAssessment: RiskAssessment
): boolean {
  if (riskAssessment.emergency || riskAssessment.level === 'high') {
    return false;
  }

  const normalizedResponse = responseText.toLowerCase();
  const normalizedUserMessage = userMessage.toLowerCase();
  const hasReferral =
    /\b(care team|clinic|clinician|hospital|sjmc|dr alan)\b/i.test(normalizedResponse);
  const hasPracticalAdvice =
    /\b(try|use|avoid|drink|rest|track|watch|moistur|wash|hydr|common|summar|from our chat|i know|you shared|paracetamol|acetaminophen)\b/i.test(
      normalizedResponse
    );
  const isContextQuestion = isDataSummaryRequest(normalizedUserMessage);

  return hasReferral && !hasPracticalAdvice && !isContextQuestion;
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

  if (normalized.includes('fever')) {
    return 'Rest, drink plenty of fluids, and monitor your temperature closely. Many people use paracetamol or acetaminophen for fever if they normally tolerate it, but if the fever is very high, not settling, or comes with trouble breathing, confusion, severe pain, or dehydration, get urgent medical help.';
  }

  if (
    normalized.includes('hair') ||
    normalized.includes('skin') ||
    normalized.includes('moistur') ||
    normalized.includes('shampoo') ||
    normalized.includes('conditioner') ||
    normalized.includes('ingredient')
  ) {
    return 'Try a gentle, fragrance-free moisturizer or conditioner, use lukewarm rather than hot water, and cut back on harsh or strongly scented products for a week or two. If you tell me the body area or product you are worried about, I can be more specific.';
  }

  if (normalized.includes('breath') || normalized.includes('lump')) {
    return `This deserves a clinician review soon. Please send it to ${DEMO_PROVIDER.clinicianName} or the ${DEMO_PROVIDER.hospitalName} care team so they can guide the next step.`;
  }

  if (riskAssessment.level === 'high') {
    return `This sounds important enough for a clinician review. Please send it to ${DEMO_PROVIDER.clinicianName} or the ${DEMO_PROVIDER.hospitalName} care team for a verified answer.`;
  }

  return 'Tell me a bit more about the symptom, product, or body area you mean, and I can give a more specific answer. If it is worsening quickly or causing more serious symptoms, contact your care team.';
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
  return ensureClinicianDraftStructure('', question, contextSnapshot);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function trimToSentenceCount(text: string, maxSentences: number): string {
  const sentences =
    text
      .match(/[^.!?]+[.!?]?/g)
      ?.map((sentence) => sentence.trim())
      .filter(Boolean) || [];

  return sentences.slice(0, maxSentences).join(' ').trim();
}

function buildClinicianAttemptedResponse(
  question: string,
  contextSnapshot: MemoryTag[]
): string {
  const normalizedQuestion = question.toLowerCase();
  const primaryContext = contextSnapshot[0]?.value?.toLowerCase() || '';

  if (/\bdrive|driving\b/i.test(normalizedQuestion)) {
    return 'Please avoid driving until the symptom has settled, especially if you feel unsteady, drowsy, or unwell.';
  }

  if (/\bheadache|migraine\b/i.test(normalizedQuestion) || /\bheadache|migraine\b/i.test(primaryContext)) {
    return 'Please arrange review this week if the headaches keep recurring, and seek urgent help sooner if you develop vomiting, weakness, or vision changes.';
  }

  if (/\bbiopsy|procedure\b/i.test(normalizedQuestion) || /\bbiopsy|procedure\b/i.test(primaryContext)) {
    return 'Please keep following the procedure instructions you were given, and let us know before the appointment if you are unsure about medicines, fasting, or new bleeding.';
  }

  if (/\bpanadol|paracetamol|acetaminophen|medication|medicine|tablet\b/i.test(normalizedQuestion)) {
    return 'Please avoid changing your medicines on your own for now, and send us the exact medication and timing if you want the team to confirm the safest plan.';
  }

  if (/\bnausea|vomit\b/i.test(normalizedQuestion) || /\bnausea|vomit\b/i.test(primaryContext)) {
    return 'Please note when the nausea starts relative to your tablets, and let us know the same day if you cannot keep fluids down or it lasts most of the day.';
  }

  if (/\bfever|temperature\b/i.test(normalizedQuestion)) {
    return 'Please monitor your temperature, drink fluids, and arrange same-day review if the fever is high, persistent, or comes with breathlessness, confusion, or dehydration.';
  }

  if (/\bbreath|breathless|shortness of breath\b/i.test(normalizedQuestion) || /\bbreath|breathless\b/i.test(primaryContext)) {
    return 'Please let the team know the same day if the breathlessness is worsening or limiting simple activity, especially after treatment.';
  }

  if (/\blump|swelling\b/i.test(normalizedQuestion) || /\blump|swelling\b/i.test(primaryContext)) {
    return 'We would usually want to examine a new lump soon, so please let us know if it is growing quickly, painful, or causing trouble swallowing or breathing.';
  }

  if (/\bappointment|review|book\b/i.test(normalizedQuestion)) {
    return 'We can help arrange the soonest suitable review, and the team can confirm the exact timing once they see the full context.';
  }

  if (primaryContext) {
    return `From the context so far, please keep monitoring ${primaryContext} and let us know if it is worsening, not settling, or affecting daily activity.`;
  }

  return 'Please keep monitoring the symptom and let us know if it is worsening, not settling, or creating any new safety concern.';
}

function ensureClinicianDraftStructure(
  draft: string,
  question: string,
  contextSnapshot: MemoryTag[]
): string {
  const cleanedDraft = trimToSentenceCount(
    draft
      .replace(new RegExp(`^${escapeRegExp(CLINICIAN_DRAFT_OPENING)}\\s*`, 'i'), '')
      .trim(),
    2
  );
  const attemptedResponse = buildClinicianAttemptedResponse(question, contextSnapshot);
  const soundsActionable =
    /\b(please|avoid|arrange|monitor|track|keep|drink|rest|review|come|go|seek|book|send|let us know|follow)\b/i.test(
      cleanedDraft
    );
  const body = cleanedDraft
    ? soundsActionable
      ? cleanedDraft
      : `${cleanedDraft} ${attemptedResponse}`.trim()
    : attemptedResponse;

  return validateResponse(`${CLINICIAN_DRAFT_OPENING} ${body}`);
}

function buildRealtimeUrl(endpoint: string): string {
  return endpoint.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:');
}

function extractTextFromResponsePayload(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const response = payload as {
    response?: {
      output?: Array<{
        content?: Array<{
          text?: string;
        }>;
      }>;
    };
  };

  return (
    response.response?.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => content.text ?? '')
      .join(' ')
      .trim() || ''
  );
}

function extractErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return 'Azure Realtime request failed.';
  }

  const event = payload as {
    error?: {
      message?: string;
      code?: string;
    };
    message?: string;
  };

  return event.error?.message || event.message || 'Azure Realtime request failed.';
}

function buildHistoryEvents(conversationHistory: ConversationEntry[]) {
  return conversationHistory.map((entry) => {
    const { redactedText } = redactPHI(entry.content);

    if (entry.role === 'user') {
      return {
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: redactedText,
            },
          ],
        },
      };
    }

    return {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: redactedText,
          },
        ],
      },
    };
  });
}

async function runRealtimeSessionAtEndpoint(
  endpoint: string,
  options: RealtimeSessionOptions
): Promise<RealtimeSessionResult> {
  const { default: WebSocketImpl } = await import('ws');
  const WebSocketClient = WebSocketImpl as unknown as {
    new (
      url: string,
      options: {
        headers: Record<string, string>;
      }
    ): {
      on: (event: string, listener: (...args: unknown[]) => void) => void;
      send: (data: string) => void;
      close: () => void;
      terminate: () => void;
    };
  };

  return new Promise((resolve, reject) => {
    const socket = new WebSocketClient(buildRealtimeUrl(endpoint), {
      headers: {
        'api-key': azureRealtimeKey,
      },
    });

    const timeout = setTimeout(() => {
      socket.terminate();
      reject(new Error('Azure Realtime request timed out.'));
    }, 30000);

    let responseText = '';
    let transcript = options.transcriptHint?.trim() || '';
    let finished = false;

    const finish = (result: RealtimeSessionResult) => {
      if (finished) {
        return;
      }

      finished = true;
      clearTimeout(timeout);
      socket.close();
      resolve(result);
    };

    const fail = (error: Error) => {
      if (finished) {
        return;
      }

      finished = true;
      clearTimeout(timeout);
      socket.terminate();
      reject(error);
    };

    socket.on('open', () => {
      const sessionPayload: Record<string, unknown> = {
        type: 'session.update',
        session: {
          modalities: ['text'],
          instructions: options.instructions,
          temperature: 0.6,
          max_response_output_tokens: options.maxOutputTokens ?? 256,
          ...(options.audioBase64
            ? {
                input_audio_format: 'pcm16',
                input_audio_transcription: {
                  model: 'whisper-1',
                },
              }
            : {}),
        },
      };

      socket.send(JSON.stringify(sessionPayload));
    });

    socket.on('message', (rawEvent: unknown) => {
      let parsedEvent: Record<string, unknown>;

      try {
        const eventText =
          typeof rawEvent === 'string'
            ? rawEvent
            : Buffer.isBuffer(rawEvent)
            ? rawEvent.toString('utf8')
            : String(rawEvent);

        parsedEvent = JSON.parse(eventText) as Record<string, unknown>;
      } catch {
        return;
      }

      switch (parsedEvent.type) {
        case 'session.updated': {
          const historyEvents = buildHistoryEvents(options.conversationHistory || []);
          for (const event of historyEvents) {
            socket.send(JSON.stringify(event));
          }

          if (options.audioBase64) {
            socket.send(
              JSON.stringify({
                type: 'conversation.item.create',
                item: {
                  type: 'message',
                  role: 'user',
                  content: [
                    {
                      type: 'input_audio',
                      audio: options.audioBase64,
                      ...(options.transcriptHint?.trim()
                        ? { transcript: options.transcriptHint.trim() }
                        : {}),
                    },
                  ],
                },
              })
            );
          } else if (options.userText || options.userImageUrl) {
            const content: Array<Record<string, string>> = [];

            if (options.userText) {
              const { redactedText } = redactPHI(options.userText);
              content.push({
                type: 'input_text',
                text: redactedText,
              });
            }

            if (options.userImageUrl) {
              content.push({
                type: 'input_image',
                image_url: options.userImageUrl,
              });
            }

            socket.send(
              JSON.stringify({
                type: 'conversation.item.create',
                item: {
                  type: 'message',
                  role: 'user',
                  content,
                },
              })
            );
          }

          socket.send(
            JSON.stringify({
              type: 'response.create',
              response: {
                modalities: ['text'],
              },
            })
          );
          break;
        }

        case 'response.text.delta': {
          const delta = typeof parsedEvent.delta === 'string' ? parsedEvent.delta : '';
          responseText += delta;
          break;
        }

        case 'response.output_text.delta': {
          const delta = typeof parsedEvent.delta === 'string' ? parsedEvent.delta : '';
          responseText += delta;
          break;
        }

        case 'response.text.done': {
          if (!responseText && typeof parsedEvent.text === 'string') {
            responseText = parsedEvent.text;
          }
          break;
        }

        case 'response.output_text.done': {
          if (!responseText && typeof parsedEvent.text === 'string') {
            responseText = parsedEvent.text;
          }
          break;
        }

        case 'conversation.item.input_audio_transcription.completed': {
          if (typeof parsedEvent.transcript === 'string' && parsedEvent.transcript.trim()) {
            transcript = parsedEvent.transcript.trim();
          }
          break;
        }

        case 'response.done': {
          const finalText = responseText.trim() || extractTextFromResponsePayload(parsedEvent);
          if (!finalText) {
            fail(new Error('Azure Realtime returned an empty response.'));
            return;
          }

          finish({
            text: finalText,
            transcript,
          });
          break;
        }

        case 'error': {
          fail(new Error(extractErrorMessage(parsedEvent)));
          break;
        }

        default:
          break;
      }
    });

    socket.on('error', (event: unknown) => {
      const message =
        event instanceof Error ? event.message : 'Azure Realtime connection failed.';
      fail(new Error(message));
    });

    socket.on('close', () => {
      if (!finished && !responseText.trim()) {
        fail(new Error('Azure Realtime closed before completing the response.'));
      }
    });
  });
}

async function runRealtimeSession(options: RealtimeSessionOptions): Promise<RealtimeSessionResult> {
  if (!hasRealtimeConfig) {
    throw new Error('Missing Azure Realtime configuration.');
  }

  let lastError: Error | null = null;

  for (const endpoint of azureRealtimeEndpoints) {
    try {
      return await runRealtimeSessionAtEndpoint(endpoint, options);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Azure Realtime request failed.');
      console.error(`Azure Realtime error for ${endpoint}:`, lastError);
    }
  }

  throw lastError || new Error('Azure Realtime request failed.');
}

export async function generateChatResponse(
  userMessage: string,
  conversationHistory: ConversationEntry[],
  memoryTags: MemoryTag[]
): Promise<ChatResponse> {
  if (isDataSummaryRequest(userMessage)) {
    const riskAssessment = buildLowRiskAssessment();

    return {
      content: buildKnownDataResponse(memoryTags),
      language: detectLanguage(userMessage),
      isEmergency: false,
      extractedTags: [],
      riskAssessment,
      shouldEscalate: false,
    };
  }

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
  const languageInstruction =
    language !== 'en'
      ? `\n\nIMPORTANT: The patient is writing in ${language}. Respond in the same language.`
      : '';
  let groundingResult = null;

  try {
    groundingResult = await getTrustedWebGrounding(userMessage, riskAssessment);
  } catch (error) {
    console.error('Trusted web grounding error:', error);
  }

  const fullSystemPrompt =
    SYSTEM_PROMPT +
    contextPrompt +
    buildWebGroundingPrompt(groundingResult) +
    languageInstruction;

  try {
    const realtimeResponse = await runRealtimeSession({
      instructions: fullSystemPrompt,
      conversationHistory,
      userText: userMessage,
      maxOutputTokens: 256,
    });

    const responseWithEscalationHint =
      riskAssessment.level === 'high' &&
      !/care team|clinic|dr alan|sjmc/i.test(realtimeResponse.text)
        ? `${realtimeResponse.text} Please send this to ${DEMO_PROVIDER.clinicianName} or the ${DEMO_PROVIDER.hospitalName} care team today.`
        : realtimeResponse.text;

    const preferredResponse = shouldReplaceWithConversationalFallback(
      responseWithEscalationHint,
      userMessage,
      riskAssessment
    )
      ? buildFallbackChatResponse(userMessage, riskAssessment)
      : responseWithEscalationHint;

    const validatedResponse = validateResponse(preferredResponse);
    const extractedTags = await extractTags(userMessage);
    const sources =
      groundingResult?.sources.map(({ excerpt: _excerpt, ...source }) => source) ?? [];

    return {
      content: validatedResponse,
      language,
      isEmergency: false,
      extractedTags,
      riskAssessment,
      shouldEscalate: riskAssessment.escalationRecommended,
      sources,
    };
  } catch (error) {
    console.error('Azure Realtime chat error:', error);
    return {
      content: buildFallbackChatResponse(userMessage, riskAssessment),
      language,
      isEmergency: false,
      extractedTags: [],
      riskAssessment,
      shouldEscalate: riskAssessment.escalationRecommended,
    };
  }
}

export async function generateVoiceChatResponse(
  audioBase64: string,
  conversationHistory: ConversationEntry[],
  memoryTags: MemoryTag[],
  transcriptHint = ''
): Promise<ChatResponse> {
  const preliminaryTranscript = transcriptHint.trim();

  if (preliminaryTranscript && isDataSummaryRequest(preliminaryTranscript)) {
    const riskAssessment = buildLowRiskAssessment();

    return {
      content: buildKnownDataResponse(memoryTags),
      language: detectLanguage(preliminaryTranscript),
      isEmergency: false,
      extractedTags: [],
      riskAssessment,
      shouldEscalate: false,
      transcript: preliminaryTranscript,
    };
  }

  const preliminarySafety = preliminaryTranscript
    ? checkInputSafety(preliminaryTranscript)
    : { safe: true };

  if (!preliminarySafety.safe) {
    return {
      content: "I'm not able to help with that request. If you have health-related questions, I'm here to assist.",
      language: 'en',
      isEmergency: false,
      extractedTags: [],
      riskAssessment: buildLowRiskAssessment(),
      shouldEscalate: false,
      transcript: preliminaryTranscript,
    };
  }

  if (preliminarySafety.reason === 'emergency_detected') {
    const emergencyRisk = assessMedicalRisk(preliminaryTranscript);
    return {
      content: getEmergencyResponse(),
      language: detectLanguage(preliminaryTranscript || 'en'),
      isEmergency: true,
      extractedTags: [],
      riskAssessment: emergencyRisk,
      shouldEscalate: true,
      transcript: preliminaryTranscript,
    };
  }

  const contextPrompt = buildContextPrompt(memoryTags);
  const language = preliminaryTranscript ? detectLanguage(preliminaryTranscript) : 'en';
  const languageInstruction =
    language !== 'en'
      ? `\n\nIMPORTANT: The patient is speaking in ${language}. Respond in the same language.`
      : '';
  let groundingResult = null;

  if (preliminaryTranscript) {
    try {
      groundingResult = await getTrustedWebGrounding(
        preliminaryTranscript,
        assessMedicalRisk(preliminaryTranscript)
      );
    } catch (error) {
      console.error('Trusted web grounding error:', error);
    }
  }

  try {
    const realtimeResponse = await runRealtimeSession({
      instructions:
        SYSTEM_PROMPT +
        contextPrompt +
        buildWebGroundingPrompt(groundingResult) +
        languageInstruction,
      conversationHistory,
      audioBase64,
      transcriptHint: preliminaryTranscript,
      maxOutputTokens: 256,
    });

    const transcript = (realtimeResponse.transcript || preliminaryTranscript).trim();
    const riskAssessment = transcript
      ? assessMedicalRisk(transcript)
      : buildLowRiskAssessment();
    const transcriptLanguage = transcript ? detectLanguage(transcript) : language;

    if (checkInputSafety(transcript).reason === 'emergency_detected') {
      return {
        content: getEmergencyResponse(),
        language: transcriptLanguage,
        isEmergency: true,
        extractedTags: transcript ? await extractTags(transcript) : [],
        riskAssessment,
        shouldEscalate: true,
        transcript,
      };
    }

    const responseWithEscalationHint =
      riskAssessment.level === 'high' &&
      !/care team|clinic|dr alan|sjmc/i.test(realtimeResponse.text)
        ? `${realtimeResponse.text} Please send this to ${DEMO_PROVIDER.clinicianName} or the ${DEMO_PROVIDER.hospitalName} care team today.`
        : realtimeResponse.text;

    const preferredResponse = shouldReplaceWithConversationalFallback(
      responseWithEscalationHint,
      transcript,
      riskAssessment
    )
      ? buildFallbackChatResponse(transcript, riskAssessment)
      : responseWithEscalationHint;

    return {
      content: validateResponse(preferredResponse),
      language: transcriptLanguage,
      isEmergency: false,
      extractedTags: transcript ? await extractTags(transcript) : [],
      riskAssessment,
      shouldEscalate: riskAssessment.escalationRecommended,
      transcript,
      sources:
        groundingResult?.sources.map(({ excerpt: _excerpt, ...source }) => source) ?? [],
    };
  } catch (error) {
    console.error('Azure Realtime voice error:', error);
    const fallbackText = preliminaryTranscript || 'Voice message';
    const riskAssessment = preliminaryTranscript
      ? assessMedicalRisk(preliminaryTranscript)
      : buildLowRiskAssessment();

    return {
      content: buildFallbackChatResponse(fallbackText, riskAssessment),
      language,
      isEmergency: false,
      extractedTags: preliminaryTranscript ? await extractTags(preliminaryTranscript) : [],
      riskAssessment,
      shouldEscalate: riskAssessment.escalationRecommended,
      transcript: preliminaryTranscript,
    };
  }
}

export async function generateImageChatResponse(
  imageDataUrl: string,
  userMessage: string,
  conversationHistory: ConversationEntry[],
  memoryTags: MemoryTag[]
): Promise<ChatResponse> {
  const normalizedMessage = userMessage.trim();
  const language = normalizedMessage ? detectLanguage(normalizedMessage) : 'en';
  const contextPrompt = buildContextPrompt(memoryTags);
  const riskAssessment = normalizedMessage
    ? assessMedicalRisk(normalizedMessage)
    : buildLowRiskAssessment();
  const languageInstruction =
    language !== 'en'
      ? `\n\nIMPORTANT: The patient is writing in ${language}. Respond in the same language.`
      : '';
  let groundingResult = null;

  if (normalizedMessage) {
    try {
      groundingResult = await getTrustedWebGrounding(normalizedMessage, riskAssessment);
    } catch (error) {
      console.error('Trusted web grounding error:', error);
    }
  }

  try {
    const realtimeResponse = await runRealtimeSession({
      instructions:
        SYSTEM_PROMPT +
        contextPrompt +
        buildWebGroundingPrompt(groundingResult) +
        languageInstruction +
        '\n\nIf the image is unclear or not enough on its own, say what detail is missing and ask one short follow-up question.',
      conversationHistory,
      userText:
        normalizedMessage ||
        'Please help me understand what might be important in this image.',
      userImageUrl: imageDataUrl,
      maxOutputTokens: 256,
    });

    const extractedTags = normalizedMessage ? await extractTags(normalizedMessage) : [];

    return {
      content: validateResponse(realtimeResponse.text),
      language,
      isEmergency: false,
      extractedTags,
      riskAssessment,
      shouldEscalate: riskAssessment.escalationRecommended,
      sources:
        groundingResult?.sources.map(({ excerpt: _excerpt, ...source }) => source) ?? [],
    };
  } catch (error) {
    console.error('Azure Realtime image error:', error);

    if (normalizedMessage) {
      const textOnlyResponse = await generateChatResponse(
        normalizedMessage,
        conversationHistory,
        memoryTags
      );

      return {
        ...textOnlyResponse,
        content: validateResponse(
          `I could not inspect the image itself just now. ${textOnlyResponse.content}`
        ),
      };
    }

    return {
      content:
        'I could not inspect the image itself just now. Tell me what you are seeing or what worries you about it, and I will help from there.',
      language,
      isEmergency: false,
      extractedTags: [],
      riskAssessment: buildLowRiskAssessment(),
      shouldEscalate: false,
    };
  }
}

export async function extractTags(message: string): Promise<TagExtractionResult[]> {
  try {
    if (!message.trim()) {
      return [];
    }

    const { redactedText } = redactPHI(message);
    const realtimeResponse = await runRealtimeSession({
      instructions: TAG_EXTRACTION_PROMPT,
      userText: `Patient message: "${redactedText}"`,
      maxOutputTokens: 300,
    });

    const jsonMatch = realtimeResponse.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]) as TagExtractionResult[];
    return parsed.filter((tag) => tag.confidence >= 0.7);
  } catch (error) {
    console.error('Realtime tag extraction error:', error);
    return [];
  }
}

export async function generateTriageSummary(
  messages: Array<{ sender: string; content: string }>,
  memoryTags: MemoryTag[]
): Promise<string> {
  try {
    const conversationText = messages.map((message) => `${message.sender}: ${message.content}`).join('\n');
    const contextText = memoryTags.length > 0
      ? '\n\nPatient context:\n' + memoryTags.map((tag) => `- ${tag.value} (${tag.status})`).join('\n')
      : '';

    const realtimeResponse = await runRealtimeSession({
      instructions: TRIAGE_SUMMARY_PROMPT,
      userText: `Conversation:\n${conversationText}${contextText}`,
      maxOutputTokens: 220,
    });

    return validateResponse(realtimeResponse.text);
  } catch (error) {
    console.error('Realtime triage summary error:', error);
    return buildDeterministicTriageSummary(messages, memoryTags);
  }
}

export async function generateClinicianDraft(
  question: string,
  contextSnapshot: MemoryTag[]
): Promise<string> {
  try {
    const contextText = contextSnapshot.length > 0
      ? '\n\nPatient context:\n' + contextSnapshot.map((tag) => `- ${tag.value} (${tag.status})`).join('\n')
      : '';

    const realtimeResponse = await runRealtimeSession({
      instructions: CLINICIAN_DRAFT_PROMPT,
      userText: `Patient question: "${question}"${contextText}`,
      maxOutputTokens: 220,
    });

    return ensureClinicianDraftStructure(realtimeResponse.text, question, contextSnapshot);
  } catch (error) {
    console.error('Realtime clinician draft error:', error);
    return buildDeterministicClinicianDraft(question, contextSnapshot);
  }
}
