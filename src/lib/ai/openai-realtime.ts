import {
  SYSTEM_PROMPT,
  buildContextPrompt,
  CLINICIAN_DRAFT_PROMPT,
  TAG_EXTRACTION_PROMPT,
  TRIAGE_SUMMARY_PROMPT,
  detectLanguage,
} from './prompts';
import {
  assessMedicalRisk,
  checkInputSafety,
  getEmergencyResponseForLanguage,
  getSafetyLimitResponse,
  validateResponse,
} from './guardrails';
import { redactPHI } from './phi-redaction';
import {
  buildClinicianGroundingPrompt,
  buildWebGroundingPrompt,
  getClinicianDraftGrounding,
  getTrustedWebGrounding,
} from './web-grounding';
import { DEMO_PROVIDER } from '@/lib/demo';
import type {
  GroundingSource,
  MemoryTag,
  RiskAssessment,
  SourceReference,
  TagExtractionResult,
} from '@/types';

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
  deferEscalationPrompt?: boolean;
  escalationQuestionDraft?: string;
  escalationSummary?: string;
}

export interface ChatResponse extends ChatResponseBase {
  transcript?: string;
  sources?: SourceReference[];
}

export interface ClinicianDraftResult {
  draft: string;
  groundedBySearch: boolean;
  sources: GroundingSource[];
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

function normalizeLanguageCode(language?: string | null): string | null {
  if (!language) {
    return null;
  }

  const normalized = language.trim().toLowerCase();

  switch (normalized) {
    case 'bahasa':
    case 'bahasa indonesia':
    case 'indonesian':
    case 'id-id':
      return 'id';
    case 'english':
    case 'inggris':
    case 'en-us':
    case 'en-gb':
      return 'en';
    default:
      return normalized.split('-')[0] || null;
  }
}

function isBahasaLanguage(language?: string | null): boolean {
  return normalizeLanguageCode(language) === 'id';
}

function getPreferredLanguageFromMemoryTags(memoryTags: MemoryTag[]): string | null {
  for (const tag of memoryTags) {
    const normalizedValue = tag.value.trim().toLowerCase();

    if (!tag.tags.includes('#language') && !/\b(preferred language|prefers|language)\b/i.test(tag.value)) {
      continue;
    }

    if (/\b(bahasa indonesia|bahasa|indonesia|id)\b/i.test(normalizedValue)) {
      return 'id';
    }

    if (/\b(english|inggris|en)\b/i.test(normalizedValue)) {
      return 'en';
    }
  }

  return null;
}

export function resolveResponseLanguage(
  currentInput: string,
  conversationHistory: ConversationEntry[] = [],
  memoryTags: MemoryTag[] = [],
  preferredLanguage?: string | null
): string {
  const currentLanguage = currentInput.trim()
    ? normalizeLanguageCode(detectLanguage(currentInput))
    : null;
  const tagPreference = getPreferredLanguageFromMemoryTags(memoryTags);
  const normalizedPreference = normalizeLanguageCode(preferredLanguage) || tagPreference;
  const recentUserLanguages = [...conversationHistory]
    .reverse()
    .filter((entry) => entry.role === 'user')
    .slice(0, 3)
    .map((entry) => normalizeLanguageCode(detectLanguage(entry.content)))
    .filter(Boolean) as string[];
  const recentNonEnglish = recentUserLanguages.find((language) => language !== 'en') || null;

  if (currentLanguage && currentLanguage !== 'en') {
    return currentLanguage;
  }

  if (!currentInput.trim() && normalizedPreference) {
    return normalizedPreference;
  }

  if (
    currentLanguage === 'en' &&
    normalizedPreference &&
    normalizedPreference !== 'en' &&
    recentUserLanguages.includes(normalizedPreference)
  ) {
    return normalizedPreference;
  }

  if (
    currentLanguage === 'en' &&
    recentNonEnglish &&
    (normalizedPreference === recentNonEnglish ||
      recentUserLanguages.filter((language) => language === recentNonEnglish).length >= 2)
  ) {
    return recentNonEnglish;
  }

  return currentLanguage || normalizedPreference || recentNonEnglish || 'en';
}

interface FeverTriageState {
  chestPain: boolean | null;
  breathingDifficulty: boolean | null;
  feverStart: string | null;
  temperature: string | null;
  unableToKeepFluids: boolean | null;
}

function extractTemperatureValue(text: string): string | null {
  const match = text.match(/\b(\d{2}(?:\.\d)?)\s*[CF]?\b/i);
  return match?.[1] || null;
}

function hasUpcomingProcedureContext(userMessage: string, memoryTags: MemoryTag[]): boolean {
  if (/\b(biopsy|biopsi|procedure|prosedur)\b/i.test(userMessage)) {
    return true;
  }

  return memoryTags.some(
    (tag) =>
      tag.tags.includes('#procedure') &&
      /\b(biopsy|biopsi|procedure|prosedur)\b/i.test(tag.value)
  );
}

function hasFeverLanguage(text: string): boolean {
  return /\b(fever|temperature|demam|suhu)\b/i.test(text);
}

function detectAffirmedSymptom(text: string, patterns: RegExp[], negatedPatterns: RegExp[]): boolean | null {
  if (!patterns.some((pattern) => pattern.test(text))) {
    return null;
  }

  if (negatedPatterns.some((pattern) => pattern.test(text))) {
    return false;
  }

  return true;
}

function extractFeverStart(text: string): string | null {
  const normalized = text.trim();
  const explicitMatch =
    normalized.match(/\b(?:started|begin|began|since)\s+([^.!?]+)/i) ||
    normalized.match(/\b(?:mulai|sejak)\s+([^.!?]+)/i);

  if (explicitMatch?.[1]) {
    return explicitMatch[1].trim();
  }

  if (/\b(tonight|this evening|this afternoon|this morning|last night)\b/i.test(normalized)) {
    const timing =
      normalized.match(/\b(tonight|this evening|this afternoon|this morning|last night)\b/i)?.[1];
    return timing || null;
  }

  if (/\b(malam ini|tadi malam|pagi ini|sore ini|siang ini)\b/i.test(normalized)) {
    const timing =
      normalized.match(/\b(malam ini|tadi malam|pagi ini|sore ini|siang ini)\b/i)?.[1];
    return timing || null;
  }

  return null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function extractTemperature(text: string): string | null {
  const match = text.match(/\b(\d{2}(?:\.\d)?)\s*°?\s*[CF]?\b/i);
  return match?.[1] || null;
}

function extractFeverTriageState(
  userMessage: string,
  conversationHistory: ConversationEntry[]
): FeverTriageState {
  const recentContext = [...conversationHistory, { role: 'user' as const, content: userMessage }]
    .slice(-6)
    .map((entry) => entry.content)
    .join(' ');

  return {
    chestPain: detectAffirmedSymptom(
      recentContext,
      [/\bchest pain\b/i, /\bnyeri dada\b/i],
      [/\b(no|not|without)\s+(any\s+)?chest pain\b/i, /\b(tidak|tak)\s+ada\s+nyeri\s+dada\b/i]
    ),
    breathingDifficulty: detectAffirmedSymptom(
      recentContext,
      [/\b(difficulty breathing|shortness of breath|breathless|trouble breathing)\b/i, /\b(sesak napas|sukar bernapas)\b/i],
      [
        /\b(no|not|without)\s+(any\s+)?(difficulty breathing|shortness of breath|breathless|trouble breathing)\b/i,
        /\b(tidak|tak)\s+ada\s+(sesak napas|sukar bernapas)\b/i,
      ]
    ),
    feverStart: extractFeverStart(recentContext),
    temperature: extractTemperatureValue(recentContext),
    unableToKeepFluids: detectAffirmedSymptom(
      recentContext,
      [
        /\b(can(?:not|'t)? keep (?:fluids?|water|drinks?) down|unable to keep (?:fluids?|water|drinks?) down|vomiting everything|throwing up everything|dehydrated)\b/i,
        /\b(tidak bisa (?:menahan|masuk) cairan|tidak bisa minum|muntah terus|semua dimuntahkan|dehidrasi)\b/i,
      ],
      [
        /\b(can keep (?:fluids?|water|drinks?) down|able to drink|drinking okay|keeping fluids down)\b/i,
        /\b(bisa minum|masih bisa minum|cairan masih masuk)\b/i,
      ]
    ),
  };
}

function buildFeverFollowUpQuestions(language: string, triageState: FeverTriageState): string {
  if (isBahasaLanguage(language)) {
    const prompts: string[] = [];

    if (!triageState.temperature) {
      prompts.push('berapa suhu yang Anda ukur');
    }
    if (!triageState.feverStart) {
      prompts.push('kapan demamnya mulai');
    }
    if (triageState.chestPain == null || triageState.breathingDifficulty == null) {
      prompts.push('apakah ada nyeri dada atau sesak napas');
    }
    if (triageState.unableToKeepFluids == null) {
      prompts.push('apakah Anda masih bisa minum dan menahan cairan');
    }

    return `Sebelum saya bantu tentukan langkah berikutnya untuk biopsi besok, tolong beri tahu ${prompts.join(', ')}?`;
  }

  const prompts: string[] = [];

  if (!triageState.temperature) {
    prompts.push('what temperature you are getting');
  }
  if (!triageState.feverStart) {
    prompts.push('when the fever started');
  }
  if (triageState.chestPain == null || triageState.breathingDifficulty == null) {
    prompts.push('whether you have chest pain or shortness of breath');
  }
  if (triageState.unableToKeepFluids == null) {
    prompts.push('whether you can keep fluids down');
  }

  return `Before I guide next steps for tomorrow's biopsy, tell me ${prompts.join(', ')}?`;
}

function buildUrgentFeverRiskAssessment(baseRisk: RiskAssessment, triageState: FeverTriageState): RiskAssessment {
  const persistentDangerSignals = [
    triageState.chestPain ? 'chest pain' : null,
    triageState.breathingDifficulty ? 'shortness of breath' : null,
    triageState.unableToKeepFluids ? 'unable to keep fluids down' : null,
  ].filter(Boolean) as string[];

  if (persistentDangerSignals.length === 0) {
    return baseRisk;
  }

  return {
    level: 'high',
    matchedSignals: persistentDangerSignals,
    summary:
      'Urgent follow-up answers suggest the patient still has red-flag symptoms that need emergency guidance.',
    emergency: true,
    escalationRecommended: true,
  };
}

function buildReadyToEscalateResponse(
  language: string,
  riskAssessment: RiskAssessment
): string {
  const needsEmergencyGuidance = riskAssessment.emergency;

  if (isBahasaLanguage(language)) {
    if (needsEmergencyGuidance) {
      return `Karena masih ada tanda bahaya seperti nyeri dada, sesak napas, atau sulit menahan cairan, mohon segera hubungi ${DEMO_PROVIDER.emergencyPhone} atau pergi ke unit gawat darurat terdekat sekarang. Jika Anda mau, saya tetap bisa kirimkan pembaruan ini ke tim ${DEMO_PROVIDER.hospitalName} setelah itu.`;
    }

    return `Karena demam sebelum biopsi besok bisa mengubah rencana tindakan, pertanyaan ini perlu ditinjau tim ${DEMO_PROVIDER.hospitalName} daripada ditebak di chat biasa. Saya bisa kirimkan pertanyaan Anda sekarang beserta suhu, waktu mulai demam, dan jawaban keselamatan Anda.`;
  }

  if (needsEmergencyGuidance) {
    return `Because you still have red-flag symptoms like chest pain, shortness of breath, or trouble keeping fluids down, please dial ${DEMO_PROVIDER.emergencyPhone} now or go to the nearest emergency department. If you want, I can still send this update to the ${DEMO_PROVIDER.hospitalName} care team after that.`;
  }

  return `Because a fever before tomorrow's biopsy can change the plan, this needs a ${DEMO_PROVIDER.hospitalName} care-team review rather than a general chat reply. I can send your question now with your temperature, timing, and symptom answers attached.`;
}

function getPostProcedureSportsFollowUp(
  userMessage: string,
  conversationHistory: ConversationEntry[],
  memoryTags: MemoryTag[],
  preferredLanguage?: string | null
): Pick<ChatResponse, 'content' | 'language' | 'riskAssessment' | 'shouldEscalate'> | null {
  const asksAboutSport = /\b(badminton|sport|exercise|play again|return to play|work out|training)\b/i.test(
    userMessage
  );
  const hasBiopsyContext =
    /\bbiopsy\b/i.test(userMessage) ||
    memoryTags.some(
      (tag) =>
        tag.tags.includes('#procedure') && /\b(biopsy|biopsi|procedure|prosedur)\b/i.test(tag.value)
    );

  if (!asksAboutSport || !hasBiopsyContext) {
    return null;
  }

  const language = resolveResponseLanguage(
    userMessage,
    conversationHistory,
    memoryTags,
    preferredLanguage
  );

  return {
    content:
      language === 'id'
        ? 'Sebelum saya jawab soal kembali bermain badminton setelah biopsi: apakah ada gejala baru sejak prosedur itu?'
        : 'Before I answer about getting back to badminton after the biopsy: have you had any new symptoms since the procedure?',
    language,
    riskAssessment: buildLowRiskAssessment(),
    shouldEscalate: false,
  };
}

function buildFeverEscalationQuestionDraft(
  language: string,
  triageState: FeverTriageState
): string {
  const temperature = triageState.temperature ? `${triageState.temperature}C` : null;
  const chestPainText =
    triageState.chestPain === false ? 'I do not have chest pain' : 'I may have chest pain';
  const breathingText =
    triageState.breathingDifficulty === false
      ? 'I do not have difficulty breathing'
      : 'I may have difficulty breathing';
  const fluidsText =
    triageState.unableToKeepFluids === true
      ? 'I am struggling to keep fluids down'
      : triageState.unableToKeepFluids === false
        ? 'I can still keep fluids down'
        : 'I am not sure whether I am becoming dehydrated';
  const feverStartText = triageState.feverStart
    ? `The fever started ${triageState.feverStart}`
    : 'The fever started tonight';

  if (isBahasaLanguage(language)) {
    return `${temperature ? `Saya demam ${temperature}` : 'Saya demam ringan'} malam ini menjelang biopsi besok. ${chestPainText.replace('I do not have chest pain', 'Saya tidak mengalami nyeri dada').replace('I may have chest pain', 'Saya mungkin mengalami nyeri dada')}. ${breathingText.replace('I do not have difficulty breathing', 'Saya tidak mengalami sesak napas').replace('I may have difficulty breathing', 'Saya mungkin mengalami sesak napas')}. ${fluidsText.replace('I am struggling to keep fluids down', 'Saya sulit menahan cairan').replace('I can still keep fluids down', 'Saya masih bisa minum dan menahan cairan').replace('I am not sure whether I am becoming dehydrated', 'Saya belum yakin apakah saya mulai dehidrasi')}. ${feverStartText.replace('The fever started', 'Demam mulai')}. Apakah saya perlu ke IGD sekarang atau masih bisa datang besok?`;
  }

  return `${temperature ? `I have a fever of ${temperature}` : 'I have a mild fever'} tonight before tomorrow's biopsy. ${chestPainText}. ${breathingText}. ${fluidsText}. ${feverStartText}. Should I still come in tomorrow, or do I need emergency review tonight?`;
}

function buildFeverEscalationSummary(
  language: string,
  userMessage: string,
  triageState: FeverTriageState,
  memoryTags: MemoryTag[]
): string {
  const prefersBahasa = memoryTags.some(
    (tag) =>
      /\b(preferred language|prefers)\b/i.test(tag.value) &&
      /\b(id|bahasa indonesia|indonesia)\b/i.test(tag.value)
  );
  const procedureLabel =
    /\b(tomorrow|besok)\b/i.test(userMessage)
      ? 'Biopsy scheduled tomorrow'
      : memoryTags.find((tag) => tag.tags.includes('#procedure'))?.value || 'Biopsy planned';
  const temperature = triageState.temperature ? `${triageState.temperature}C` : 'mild fever';
  const chestPainText = triageState.chestPain === false ? 'No chest pain reported.' : '';
  const breathingText =
    triageState.breathingDifficulty === false ? 'No breathing difficulty reported.' : '';
  const fluidsText =
    triageState.unableToKeepFluids === true ? 'Trouble keeping fluids down.' : '';
  const languageNote = prefersBahasa ? 'Prefers Bahasa Indonesia.' : '';

  if (isBahasaLanguage(language)) {
    return `${procedureLabel}. Demam ${temperature}. ${chestPainText.replace('No chest pain reported.', 'Tidak ada nyeri dada.')}${breathingText.replace('No breathing difficulty reported.', ' Tidak ada sesak napas.')}${fluidsText.replace('Trouble keeping fluids down.', ' Sulit menahan cairan.')}${languageNote.replace('Prefers Bahasa Indonesia.', ' Lebih nyaman dalam Bahasa Indonesia.')} Perlu panduan klinis tentang apakah prosedur besok masih bisa dilanjutkan.`
      .replace(/\s+/g, ' ')
      .trim();
  }

  return `${procedureLabel}. Fever ${temperature}. ${chestPainText} ${breathingText} ${fluidsText} ${languageNote} Needs clinician guidance on whether tomorrow's procedure should still proceed.`
    .replace(/\s+/g, ' ')
    .trim();
}

function getPreProcedureFeverFlow(
  userMessage: string,
  conversationHistory: ConversationEntry[],
  memoryTags: MemoryTag[],
  riskAssessment: RiskAssessment,
  preferredLanguage?: string | null
): Pick<
  ChatResponse,
  'content' | 'language' | 'riskAssessment' | 'shouldEscalate' | 'deferEscalationPrompt' | 'escalationQuestionDraft' | 'escalationSummary'
> | null {
  if (!hasFeverLanguage(userMessage) || !hasUpcomingProcedureContext(userMessage, memoryTags)) {
    return null;
  }

  const language = resolveResponseLanguage(
    userMessage,
    conversationHistory,
    memoryTags,
    preferredLanguage
  );
  const triageState = extractFeverTriageState(userMessage, conversationHistory);
  const refinedRiskAssessment = buildUrgentFeverRiskAssessment(riskAssessment, triageState);
  const missingAnswers = [
    triageState.chestPain == null,
    triageState.breathingDifficulty == null,
    triageState.feverStart == null,
    triageState.temperature == null,
    triageState.unableToKeepFluids == null,
  ].filter(Boolean).length;

  if (refinedRiskAssessment.emergency) {
    return {
      content: buildReadyToEscalateResponse(language, refinedRiskAssessment),
      language,
      riskAssessment: refinedRiskAssessment,
      shouldEscalate: true,
      escalationQuestionDraft: buildFeverEscalationQuestionDraft(language, triageState),
      escalationSummary: buildFeverEscalationSummary(language, userMessage, triageState, memoryTags),
    };
  }

  if (missingAnswers > 0) {
    return {
      content: buildFeverFollowUpQuestions(language, triageState),
      language,
      riskAssessment: refinedRiskAssessment,
      shouldEscalate: false,
      deferEscalationPrompt: true,
    };
  }

  return {
    content: buildReadyToEscalateResponse(language, refinedRiskAssessment),
    language,
    riskAssessment: refinedRiskAssessment,
    shouldEscalate: true,
    escalationQuestionDraft: buildFeverEscalationQuestionDraft(language, triageState),
    escalationSummary: buildFeverEscalationSummary(language, userMessage, triageState, memoryTags),
  };
}

function isDataSummaryRequest(message: string): boolean {
  return /\b(what (data|info|information).*(got|have) on me|what do you know about me|what do you have on me|what's in my record|summari[sz]e what you know|apa yang kamu tahu tentang saya|apa yang anda tahu tentang saya|data apa yang kamu punya tentang saya|ringkas apa yang kamu tahu)\b/i.test(
    message
  );
}

function buildKnownDataResponse(memoryTags: MemoryTag[], language: string): string {
  const relevantTags = memoryTags
    .filter((tag) => tag.status === 'active' || tag.status === 'flagged')
    .slice(0, 4);

  if (relevantTags.length === 0) {
    if (isBahasaLanguage(language)) {
      return 'Dari chat ini, saya hanya tahu apa yang sudah Anda bagikan sejauh ini. Kalau Anda mau, saya bisa bantu merangkum pertanyaan atau kekhawatiran terbaru Anda.';
    }

    return 'From this chat, I only know what you have shared in the conversation so far. If you want, I can help summarize your recent questions or concerns.';
  }

  const summary = relevantTags
    .map((tag) => tag.value)
    .join('; ');

  if (isBahasaLanguage(language)) {
    return `Dari chat kita, saya punya catatan seperti: ${summary}. Kalau Anda mau, saya bisa bantu merangkum ini dengan singkat atau cek apakah ada yang perlu diperbarui.`;
  }

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
    /\b(care team|clinic|clinician|hospital|sjmc|dr alan|tim|dokter|rumah sakit|klinik)\b/i.test(
      normalizedResponse
    );
  const hasPracticalAdvice =
    /\b(try|use|avoid|drink|rest|track|watch|moistur|wash|hydr|common|summar|from our chat|i know|you shared|paracetamol|acetaminophen|coba|gunakan|hindari|minum|istirahat|pantau|catat|ringkas|parasetamol|dari chat kita|anda berbagi)\b/i.test(
      normalizedResponse
    );
  const isContextQuestion = isDataSummaryRequest(normalizedUserMessage);

  return hasReferral && !hasPracticalAdvice && !isContextQuestion;
}

function buildFallbackChatResponse(
  userMessage: string,
  riskAssessment: RiskAssessment,
  language: string
): string {
  const normalized = userMessage.toLowerCase();

  if (riskAssessment.emergency) {
    return getEmergencyResponseForLanguage(language);
  }

  if (/\b(biopsy|biopsi)\b/i.test(normalized)) {
    if (isBahasaLanguage(language)) {
      return `Silakan tetap ikuti instruksi persiapan tindakan yang sudah diberikan. Jika Anda masih ragu soal obat, puasa, atau ada perdarahan baru, kirimkan detailnya ke ${DEMO_PROVIDER.clinicianName} atau tim ${DEMO_PROVIDER.hospitalName} hari ini.`;
    }

    return `Bring your medication list and follow the prep instructions your care team already gave you. If you still need medication clarification, send this to ${DEMO_PROVIDER.clinicianName} or the ${DEMO_PROVIDER.hospitalName} care team.`;
  }

  if (/\b(headache|migraine|sakit kepala|pusing)\b/i.test(normalized)) {
    if (isBahasaLanguage(language)) {
      return 'Catat kapan sakit kepala muncul dan apakah ada muntah, lemah, atau gangguan penglihatan. Jika ada tanda bahaya itu, segera cari bantuan gawat darurat atau minta tim perawatan menilai Anda minggu ini.';
    }

    return 'Keep track of when the headache happens and whether you notice vomiting, weakness, or vision changes. If any of those warning signs appear, seek urgent care or ask the care team for a same-week review.';
  }

  if (/\b(nausea|vomit|mual|muntah)\b/i.test(normalized)) {
    if (isBahasaLanguage(language)) {
      return 'Coba catat jam minum obat, apa yang Anda makan, dan kapan mual mulai muncul. Jika Anda tidak bisa menahan cairan atau keluhan berlangsung hampir sepanjang hari, kirimkan ke tim perawatan hari ini.';
    }

    return 'Try noting what time you take the tablets, what you ate, and when the nausea starts. If it keeps lasting through the morning or you cannot keep fluids down, send it to the care team today.';
  }

  if (/\b(fever|temperature|demam|suhu)\b/i.test(normalized)) {
    if (isBahasaLanguage(language)) {
      return 'Istirahat, banyak minum, dan pantau suhu Anda dengan cermat. Banyak orang memakai parasetamol untuk demam bila biasanya cocok, tetapi jika demam tinggi, tidak turun, atau disertai sesak napas, bingung, nyeri hebat, atau dehidrasi, segera cari bantuan gawat darurat.';
    }

    return 'Rest, drink plenty of fluids, and monitor your temperature closely. Many people use paracetamol or acetaminophen for fever if they normally tolerate it, but if the fever is very high, not settling, or comes with trouble breathing, confusion, severe pain, or dehydration, get urgent medical help.';
  }

  if (
    /\b(hair|skin|moistur|shampoo|conditioner|ingredient|rambut|kulit|pelembap|bahan)\b/i.test(
      normalized
    )
  ) {
    if (isBahasaLanguage(language)) {
      return 'Coba gunakan pelembap atau kondisioner yang lembut dan tanpa pewangi, mandi dengan air suam-suam kuku, dan kurangi produk yang keras atau beraroma kuat selama satu sampai dua minggu. Kalau Anda beri tahu area tubuh atau produknya, saya bisa jawab lebih spesifik.';
    }

    return 'Try a gentle, fragrance-free moisturizer or conditioner, use lukewarm rather than hot water, and cut back on harsh or strongly scented products for a week or two. If you tell me the body area or product you are worried about, I can be more specific.';
  }

  if (/\b(breath|breathless|lump|sesak|napas|benjolan)\b/i.test(normalized)) {
    if (isBahasaLanguage(language)) {
      return `Ini perlu dinilai klinisi secepatnya. Silakan kirim ke ${DEMO_PROVIDER.clinicianName} atau tim ${DEMO_PROVIDER.hospitalName} agar langkah berikutnya bisa dipastikan dengan aman.`;
    }

    return `This deserves a clinician review soon. Please send it to ${DEMO_PROVIDER.clinicianName} or the ${DEMO_PROVIDER.hospitalName} care team so they can guide the next step.`;
  }

  if (riskAssessment.level === 'high') {
    if (isBahasaLanguage(language)) {
      return `Keluhan ini cukup penting untuk ditinjau klinisi. Silakan kirim ke ${DEMO_PROVIDER.clinicianName} atau tim ${DEMO_PROVIDER.hospitalName} agar Anda mendapat jawaban yang sudah diverifikasi.`;
    }

    return `This sounds important enough for a clinician review. Please send it to ${DEMO_PROVIDER.clinicianName} or the ${DEMO_PROVIDER.hospitalName} care team for a verified answer.`;
  }

  if (isBahasaLanguage(language)) {
    return 'Ceritakan sedikit lebih spesifik gejala, produk, atau area tubuh yang Anda maksud, dan saya bisa bantu jawab lebih terarah. Jika keluhan cepat memburuk atau menimbulkan gejala yang lebih serius, segera hubungi tim perawatan Anda.';
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
  contextSnapshot: MemoryTag[],
  language: string
): string {
  return ensureClinicianDraftStructure('', question, contextSnapshot, language);
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
  contextSnapshot: MemoryTag[],
  language: string
): string {
  const normalizedQuestion = question.toLowerCase();
  const primaryContext = contextSnapshot[0]?.value?.toLowerCase() || '';
  const procedureContext = contextSnapshot.some((tag) =>
    /\b(biopsy|biopsi|procedure|prosedur)\b/i.test(tag.value)
  );

  if (/\bdrive|driving\b/i.test(normalizedQuestion)) {
    if (isBahasaLanguage(language)) {
      return 'Sebaiknya jangan menyetir dulu sampai keluhannya benar-benar reda, terutama kalau Anda masih terasa goyah, mengantuk, atau tidak enak badan.';
    }

    return 'Please avoid driving until the symptom has settled, especially if you feel unsteady, drowsy, or unwell.';
  }

  if (/\b(headache|migraine|sakit kepala|pusing)\b/i.test(normalizedQuestion) || /\b(headache|migraine|sakit kepala|pusing)\b/i.test(primaryContext)) {
    if (isBahasaLanguage(language)) {
      return 'Kalau sakit kepalanya terus berulang, mohon atur penilaian minggu ini, dan segera ke layanan gawat darurat bila muncul muntah, lemah, atau gangguan penglihatan.';
    }

    return 'Please arrange review this week if the headaches keep recurring, and seek urgent help sooner if you develop vomiting, weakness, or vision changes.';
  }

  if (/\b(biopsy|biopsi|procedure|prosedur)\b/i.test(normalizedQuestion) || /\b(biopsy|biopsi|procedure|prosedur)\b/i.test(primaryContext)) {
    if (isBahasaLanguage(language)) {
      return 'Mohon tetap ikuti instruksi tindakan yang sudah diberikan, dan beri tahu kami sebelum jadwal besok bila masih ragu soal obat, puasa, atau ada perdarahan baru.';
    }

    return 'Please keep following the procedure instructions you were given, and let us know before the appointment if you are unsure about medicines, fasting, or new bleeding.';
  }

  if (/\b(panadol|paracetamol|acetaminophen|medication|medicine|tablet|obat|ubat)\b/i.test(normalizedQuestion)) {
    if (isBahasaLanguage(language)) {
      return 'Jangan ubah obat Anda sendiri dulu, dan kirimkan nama obat serta waktunya bila Anda ingin tim memastikan rencana yang paling aman.';
    }

    return 'Please avoid changing your medicines on your own for now, and send us the exact medication and timing if you want the team to confirm the safest plan.';
  }

  if (/\b(nausea|vomit|mual|muntah)\b/i.test(normalizedQuestion) || /\b(nausea|vomit|mual|muntah)\b/i.test(primaryContext)) {
    if (isBahasaLanguage(language)) {
      return 'Coba catat kapan mual mulai dibanding waktu minum obat, dan beri tahu kami di hari yang sama bila Anda tidak bisa menahan cairan atau keluhannya berlangsung hampir sepanjang hari.';
    }

    return 'Please note when the nausea starts relative to your tablets, and let us know the same day if you cannot keep fluids down or it lasts most of the day.';
  }

  if (/\b(fever|temperature|demam|suhu)\b/i.test(normalizedQuestion) && procedureContext) {
    if (isBahasaLanguage(language)) {
      return 'Demam sebelum prosedur bisa mengubah rencana, jadi mohon istirahat, banyak minum, dan gunakan parasetamol hanya bila biasanya cocok untuk Anda. Bila demam naik, muncul nyeri dada, sesak napas, atau Anda sulit menahan cairan, segera ke unit gawat darurat malam ini.';
    }

    return 'Mild fever before a procedure can happen with travel fatigue or anxiety. Please rest, drink water, and you may use paracetamol if you normally tolerate it, then arrive 30 minutes early so we can check your vitals before making the final decision.';
  }

  if (/\b(fever|temperature|demam|suhu)\b/i.test(normalizedQuestion)) {
    if (isBahasaLanguage(language)) {
      return 'Mohon pantau suhu Anda, banyak minum, dan atur penilaian hari yang sama bila demam tinggi, menetap, atau disertai sesak, bingung, atau dehidrasi.';
    }

    return 'Please monitor your temperature, drink fluids, and arrange same-day review if the fever is high, persistent, or comes with breathlessness, confusion, or dehydration.';
  }

  if (/\b(breath|breathless|shortness of breath|sesak|napas)\b/i.test(normalizedQuestion) || /\b(breath|breathless|sesak|napas)\b/i.test(primaryContext)) {
    if (isBahasaLanguage(language)) {
      return 'Mohon beri tahu tim di hari yang sama bila sesaknya makin berat atau mulai membatasi aktivitas ringan, terutama setelah terapi.';
    }

    return 'Please let the team know the same day if the breathlessness is worsening or limiting simple activity, especially after treatment.';
  }

  if (/\b(lump|swelling|benjolan|bengkak)\b/i.test(normalizedQuestion) || /\b(lump|swelling|benjolan|bengkak)\b/i.test(primaryContext)) {
    if (isBahasaLanguage(language)) {
      return 'Benjolan baru biasanya perlu diperiksa langsung, jadi beri tahu kami bila ukurannya cepat membesar, terasa nyeri, atau mengganggu menelan maupun bernapas.';
    }

    return 'We would usually want to examine a new lump soon, so please let us know if it is growing quickly, painful, or causing trouble swallowing or breathing.';
  }

  if (/\b(appointment|review|book|janji|kontrol)\b/i.test(normalizedQuestion)) {
    if (isBahasaLanguage(language)) {
      return 'Kami bisa bantu atur tindak lanjut yang paling sesuai, lalu tim akan mengonfirmasi jadwal pastinya setelah meninjau konteks lengkapnya.';
    }

    return 'We can help arrange the soonest suitable review, and the team can confirm the exact timing once they see the full context.';
  }

  if (primaryContext) {
    if (isBahasaLanguage(language)) {
      return `Dari konteks yang ada sejauh ini, mohon pantau ${primaryContext} dan beri tahu kami bila keluhannya makin berat, tidak membaik, atau mulai mengganggu aktivitas harian.`;
    }

    return `From the context so far, please keep monitoring ${primaryContext} and let us know if it is worsening, not settling, or affecting daily activity.`;
  }

  if (isBahasaLanguage(language)) {
    return 'Untuk sementara, mohon pantau keluhannya dan beri tahu kami bila makin berat, tidak membaik, atau menimbulkan kekhawatiran baru soal keselamatan.';
  }

  return 'Please keep monitoring the symptom and let us know if it is worsening, not settling, or creating any new safety concern.';
}

function ensureClinicianDraftStructure(
  draft: string,
  question: string,
  contextSnapshot: MemoryTag[],
  language: string
): string {
  const cleanedDraft = trimToSentenceCount(
    draft.trim(),
    3
  );
  const attemptedResponse = buildClinicianAttemptedResponse(question, contextSnapshot, language);
  const soundsActionable =
    /\b(please|avoid|arrange|monitor|track|keep|drink|rest|review|come|go|seek|book|send|let us know|follow|pantau|hindari|minum|istirahat|atur|beri tahu|segera|gunakan)\b/i.test(
      cleanedDraft
    );
  const soundsLikeBareHandoff =
    /\b(team|care team|review|confirm the safest plan)\b/i.test(cleanedDraft) && !soundsActionable;
  const body = cleanedDraft
    ? soundsActionable && !soundsLikeBareHandoff
      ? cleanedDraft
      : `${cleanedDraft} ${attemptedResponse}`.trim()
    : attemptedResponse;

  return validateResponse(body);
}

function buildCareTeamEscalationHint(language: string): string {
  if (isBahasaLanguage(language)) {
    return `Silakan kirim ini ke ${DEMO_PROVIDER.clinicianName} atau tim ${DEMO_PROVIDER.hospitalName} hari ini.`;
  }

  return `Please send this to ${DEMO_PROVIDER.clinicianName} or the ${DEMO_PROVIDER.hospitalName} care team today.`;
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
  memoryTags: MemoryTag[],
  preferredLanguage?: string | null
): Promise<ChatResponse> {
  const language = resolveResponseLanguage(
    userMessage,
    conversationHistory,
    memoryTags,
    preferredLanguage
  );

  if (isDataSummaryRequest(userMessage)) {
    const riskAssessment = buildLowRiskAssessment();

    return {
      content: buildKnownDataResponse(memoryTags, language),
      language,
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
      content: getSafetyLimitResponse(language),
      language,
      isEmergency: false,
      extractedTags: [],
      riskAssessment,
      shouldEscalate: riskAssessment.escalationRecommended,
    };
  }

  const isEmergency = inputCheck.reason === 'emergency_detected';
  if (isEmergency) {
    return {
      content: getEmergencyResponseForLanguage(language),
      language,
      isEmergency: true,
      extractedTags: [],
      riskAssessment,
      shouldEscalate: true,
    };
  }

  const contextPrompt = buildContextPrompt(memoryTags);
  const languageInstruction =
    language !== 'en'
      ? `\n\nIMPORTANT: The patient is writing in ${language}. Respond in the same language.`
      : '';
  const feverTriageFlow = getPreProcedureFeverFlow(
    userMessage,
    conversationHistory,
    memoryTags,
    riskAssessment,
    preferredLanguage
  );

  if (feverTriageFlow) {
    const extractedTags = await extractTags(userMessage);

    return {
      content: validateResponse(feverTriageFlow.content),
      language: feverTriageFlow.language,
      isEmergency: false,
      extractedTags,
      riskAssessment: feverTriageFlow.riskAssessment,
      shouldEscalate: feverTriageFlow.shouldEscalate,
      deferEscalationPrompt: feverTriageFlow.deferEscalationPrompt,
      escalationQuestionDraft: feverTriageFlow.escalationQuestionDraft,
      escalationSummary: feverTriageFlow.escalationSummary,
    };
  }

  const sportsFollowUp = getPostProcedureSportsFollowUp(
    userMessage,
    conversationHistory,
    memoryTags,
    preferredLanguage
  );

  if (sportsFollowUp) {
    const extractedTags = await extractTags(userMessage);

    return {
      content: validateResponse(sportsFollowUp.content),
      language: sportsFollowUp.language,
      isEmergency: false,
      extractedTags,
      riskAssessment: sportsFollowUp.riskAssessment,
      shouldEscalate: false,
    };
  }
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
      !/care team|clinic|dr alan|sjmc|tim|dokter|rumah sakit|klinik/i.test(realtimeResponse.text)
        ? `${realtimeResponse.text} ${buildCareTeamEscalationHint(language)}`
        : realtimeResponse.text;

    const preferredResponse = shouldReplaceWithConversationalFallback(
      responseWithEscalationHint,
      userMessage,
      riskAssessment
    )
      ? buildFallbackChatResponse(userMessage, riskAssessment, language)
      : responseWithEscalationHint;

    const validatedResponse = validateResponse(preferredResponse);
    const extractedTags = await extractTags(userMessage);
    const sources =
      groundingResult?.sources.map((source) => ({
        title: source.title,
        url: source.url,
        publisher: source.publisher,
        domain: source.domain,
      })) ?? [];

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
      content: buildFallbackChatResponse(userMessage, riskAssessment, language),
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
  transcriptHint = '',
  preferredLanguage?: string | null
): Promise<ChatResponse> {
  const preliminaryTranscript = transcriptHint.trim();
  const preliminaryLanguage = resolveResponseLanguage(
    preliminaryTranscript,
    conversationHistory,
    memoryTags,
    preferredLanguage
  );

  if (preliminaryTranscript && isDataSummaryRequest(preliminaryTranscript)) {
    const riskAssessment = buildLowRiskAssessment();

    return {
      content: buildKnownDataResponse(memoryTags, preliminaryLanguage),
      language: preliminaryLanguage,
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
      content: getSafetyLimitResponse(preliminaryLanguage),
      language: preliminaryLanguage,
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
      content: getEmergencyResponseForLanguage(preliminaryLanguage),
      language: preliminaryLanguage,
      isEmergency: true,
      extractedTags: [],
      riskAssessment: emergencyRisk,
      shouldEscalate: true,
      transcript: preliminaryTranscript,
    };
  }

  const contextPrompt = buildContextPrompt(memoryTags);
  const language = preliminaryLanguage;
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
    const transcriptLanguage = resolveResponseLanguage(
      transcript,
      conversationHistory,
      memoryTags,
      preferredLanguage || language
    );

    if (checkInputSafety(transcript).reason === 'emergency_detected') {
      return {
        content: getEmergencyResponseForLanguage(transcriptLanguage),
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
      !/care team|clinic|dr alan|sjmc|tim|dokter|rumah sakit|klinik/i.test(realtimeResponse.text)
        ? `${realtimeResponse.text} ${buildCareTeamEscalationHint(transcriptLanguage)}`
        : realtimeResponse.text;

    const preferredResponse = shouldReplaceWithConversationalFallback(
      responseWithEscalationHint,
      transcript,
      riskAssessment
    )
      ? buildFallbackChatResponse(transcript, riskAssessment, transcriptLanguage)
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
        groundingResult?.sources.map((source) => ({
          title: source.title,
          url: source.url,
          publisher: source.publisher,
          domain: source.domain,
        })) ?? [],
    };
  } catch (error) {
    console.error('Azure Realtime voice error:', error);
    const fallbackText = preliminaryTranscript || 'Voice message';
    const riskAssessment = preliminaryTranscript
      ? assessMedicalRisk(preliminaryTranscript)
      : buildLowRiskAssessment();

    return {
      content: buildFallbackChatResponse(fallbackText, riskAssessment, language),
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
  memoryTags: MemoryTag[],
  preferredLanguage?: string | null
): Promise<ChatResponse> {
  const normalizedMessage = userMessage.trim();
  const language = resolveResponseLanguage(
    normalizedMessage,
    conversationHistory,
    memoryTags,
    preferredLanguage
  );
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
        groundingResult?.sources.map((source) => ({
          title: source.title,
          url: source.url,
          publisher: source.publisher,
          domain: source.domain,
        })) ?? [],
    };
  } catch (error) {
    console.error('Azure Realtime image error:', error);

    if (normalizedMessage) {
      const textOnlyResponse = await generateChatResponse(
        normalizedMessage,
        conversationHistory,
        memoryTags,
        preferredLanguage
      );

      return {
        ...textOnlyResponse,
        content: validateResponse(
          isBahasaLanguage(textOnlyResponse.language)
            ? `Saya belum bisa memeriksa gambarnya dengan baik saat ini. ${textOnlyResponse.content}`
            : `I could not inspect the image itself just now. ${textOnlyResponse.content}`
        ),
      };
    }

    return {
      content: isBahasaLanguage(language)
        ? 'Saya belum bisa memeriksa gambarnya dengan baik saat ini. Ceritakan apa yang Anda lihat atau apa yang membuat Anda khawatir, lalu saya akan bantu dari sana.'
        : 'I could not inspect the image itself just now. Tell me what you are seeing or what worries you about it, and I will help from there.',
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
  contextSnapshot: MemoryTag[],
  preferredLanguage?: string | null
): Promise<ClinicianDraftResult> {
  const language = resolveResponseLanguage(question, [], contextSnapshot, preferredLanguage);
  const languageInstruction =
    language !== 'en'
      ? `\n\nIMPORTANT: The patient is writing in ${language}. Draft the reply in the same language.`
      : '';
  let groundingResult = null;

  try {
    groundingResult = await getClinicianDraftGrounding(question, contextSnapshot);
  } catch (error) {
    console.error('Clinician draft grounding error:', error);
  }

  try {
    const contextText = contextSnapshot.length > 0
      ? '\n\nPatient context:\n' + contextSnapshot.map((tag) => `- ${tag.value} (${tag.status})`).join('\n')
      : '';

    const realtimeResponse = await runRealtimeSession({
      instructions:
        CLINICIAN_DRAFT_PROMPT +
        buildClinicianGroundingPrompt(groundingResult) +
        languageInstruction,
      userText: `Patient question: "${question}"${contextText}`,
      maxOutputTokens: 220,
    });

    return {
      draft: ensureClinicianDraftStructure(realtimeResponse.text, question, contextSnapshot, language),
      groundedBySearch: Boolean(groundingResult?.sources.length),
      sources: groundingResult?.sources || [],
    };
  } catch (error) {
    console.error('Realtime clinician draft error:', error);
    return {
      draft: buildDeterministicClinicianDraft(question, contextSnapshot, language),
      groundedBySearch: Boolean(groundingResult?.sources.length),
      sources: groundingResult?.sources || [],
    };
  }
}
