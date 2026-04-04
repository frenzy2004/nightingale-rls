import type { MemoryTag } from '@/types';

export const SYSTEM_PROMPT = `You are Nightingale, a friendly and empathetic health assistant. Your role is to help patients understand their health concerns while being careful not to diagnose or prescribe.

CORE PRINCIPLES:
1. Be conversational and warm - you're texting, not writing a medical report
2. Keep responses SHORT (2-4 sentences max unless the patient asks for more detail)
3. Always acknowledge uncertainty - if you're not sure, say so clearly
4. Be non-diagnostic and non-prescriptive - suggest they consult a healthcare provider when appropriate
5. Detect and respond in the patient's language

WHEN YOU DON'T KNOW:
- Say something like "I'm not sure about that" or "That's beyond what I can help with"
- Suggest they might want to ask their clinic about this
- Never make up medical information

IMPORTANT:
- Don't start responses with greetings unless it's the first message
- Don't repeat what the patient said back to them
- Don't use medical jargon unless explaining it
- Be supportive but honest about limitations

If the patient seems distressed or mentions emergency symptoms, encourage them to seek immediate medical attention.`;

export function buildContextPrompt(memoryTags: MemoryTag[]): string {
  if (memoryTags.length === 0) return '';

  const relevantTags = memoryTags
    .filter(tag => tag.status === 'active' || tag.status === 'flagged')
    .slice(0, 10);

  if (relevantTags.length === 0) return '';

  const contextLines = relevantTags.map(tag => {
    const statusNote = tag.status === 'flagged' ? ' (needs clarification)' : '';
    const verifiedNote = tag.authority === 'clinician_verified' ? ' [verified by clinician]' : '';
    return `- ${tag.value}${statusNote}${verifiedNote}`;
  });

  return `\n\nPATIENT CONTEXT (from previous conversations):
${contextLines.join('\n')}

Use this context to provide more personalized responses, but don't reference it explicitly unless relevant to the current question.`;
}

export const TAG_EXTRACTION_PROMPT = `Extract medical information from the patient's message. Return a JSON array of extracted facts.

For each fact, provide:
- value: the specific information (e.g., "takes Panadol daily", "headaches for 2 weeks")
- tags: array of categories (use: #medication, #symptom, #condition, #procedure, #allergy, #lifestyle, #timeline)
- status: "active" for current states, "stopped" for discontinued things
- confidence: 0-1 score of how confident you are in this extraction

Only extract concrete medical facts. Skip vague statements.

Example input: "I've been taking Panadol for my headaches but I stopped last week"
Example output:
[
  {"value": "takes Panadol", "tags": ["#medication"], "status": "stopped", "confidence": 0.95},
  {"value": "headaches", "tags": ["#symptom"], "status": "active", "confidence": 0.9}
]

If no medical facts are present, return an empty array: []`;

export const TRIAGE_SUMMARY_PROMPT = `Summarize this patient conversation for a healthcare provider. Be concise (3-4 sentences max).

Include:
1. Main concern/question
2. Relevant context from the conversation
3. Any mentioned symptoms, medications, or timeline

Keep it clinical but readable. This helps the provider quickly understand what the patient needs.`;

export const CLINICIAN_DRAFT_PROMPT = `Based on this patient question and context, draft a brief response that a clinician might send.

Guidelines:
- Be professional but warm
- Address the specific question
- Include relevant medical guidance
- Keep it concise (2-4 sentences)
- The clinician will edit this before sending

Remember: This is a draft that will be reviewed and edited by the actual clinician.`;

export function detectLanguage(text: string): string {
  const languagePatterns: Record<string, RegExp[]> = {
    es: [/\b(hola|gracias|por favor|tengo|dolor|médico)\b/i],
    fr: [/\b(bonjour|merci|s'il vous plaît|j'ai|douleur|médecin)\b/i],
    de: [/\b(hallo|danke|bitte|ich habe|schmerz|arzt)\b/i],
    pt: [/\b(olá|obrigado|por favor|tenho|dor|médico)\b/i],
    zh: [/[\u4e00-\u9fff]/],
    ja: [/[\u3040-\u309f\u30a0-\u30ff]/],
    ko: [/[\uac00-\ud7af]/],
    ar: [/[\u0600-\u06ff]/],
    hi: [/[\u0900-\u097f]/],
  };

  for (const [lang, patterns] of Object.entries(languagePatterns)) {
    if (patterns.some(pattern => pattern.test(text))) {
      return lang;
    }
  }

  return 'en';
}
