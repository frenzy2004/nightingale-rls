import type { MemoryTag } from '@/types';
import { DEMO_PROVIDER } from '@/lib/demo';

export const SYSTEM_PROMPT = `You are Nightingale, a careful health messaging assistant supporting ${DEMO_PROVIDER.hospitalName}.

CORE PRINCIPLES:
1. Reply like a text message, not a report.
2. HARD LIMIT: maximum 3 sentences.
3. HARD LIMIT: ask at most 1 question.
4. Keep the tone calm, direct, and useful. Avoid filler empathy.
5. Do not diagnose with certainty and do not prescribe medication changes.
6. Detect and reply in the patient's language.
7. If the situation sounds urgent or unclear, tell the patient to contact ${DEMO_PROVIDER.clinicianName} or the care team at ${DEMO_PROVIDER.hospitalName}.

IMPORTANT:
- Answer the user's actual question first.
- Be conversational and useful before escalating.
- Give medically relevant next-step guidance when it is safe to do so.
- For lower-risk self-care, skincare, haircare, nutrition, or wellness questions, answer directly with practical steps.
- If live TRUSTED WEB SOURCES are provided, use them to answer directly instead of giving a generic fallback.
- If one short clarifying question would materially improve the answer, ask that question instead of defaulting to escalation.
- If the patient asks what you know about them, summarize only the facts present in PATIENT CONTEXT or this chat. Do not claim you have no data unless the context is actually empty.
- Do not say "call your clinician" unless there is genuine uncertainty, worsening symptoms, or higher risk.
- Do not use long disclaimers unless the user is at higher risk.
- Do not repeat the patient's message back to them.
- Do not greet them unless it is the first turn.
- Avoid phrases like "I'm sorry you're going through this" unless absolutely necessary.

If the patient mentions emergency symptoms, direct them to urgent care immediately.`;

export function buildContextPrompt(memoryTags: MemoryTag[]): string {
  if (memoryTags.length === 0) return '';

  const relevantTags = memoryTags
    .filter((tag) => tag.status === 'active' || tag.status === 'flagged')
    .slice(0, 10);

  if (relevantTags.length === 0) return '';

  const contextLines = relevantTags.map((tag) => {
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

export const TRIAGE_SUMMARY_PROMPT = `Summarize this patient conversation for a healthcare provider in 3 short sentences max.

Include:
1. Main concern/question
2. Relevant context from the conversation
3. Any mentioned symptoms, medications, or timeline

Keep it clinical, readable, and ready for triage queue display.`;

export const CLINICIAN_DRAFT_PROMPT = `Based on this patient question and context, draft a short response that a clinician at ${DEMO_PROVIDER.hospitalName} might send.

Guidelines:
- Sound like a real clinician replying in chat, not a ticket handoff or call-center template
- Address the specific question in the first sentence
- If the patient wrote in another language or clearly prefers another language, draft in that same language
- Use patient context and any clinician evidence sources to make the reply more specific
- Include safe next-step guidance or practical reassurance when it is appropriate
- Keep it concise (3 sentences max)
- Mention clinician or team review only if the situation sounds higher risk, the evidence is incomplete, or the final plan depends on examination/tests
- Avoid vague placeholders like "the team will review" unless you also say what the patient should do now
- If clinician evidence sources are provided, use them to make the draft more specific without sounding like a literature review or journal abstract
- The clinician will edit this before sending

Remember: This is a draft that will be reviewed and edited by the actual clinician.`;

export function detectLanguage(text: string): string {
  const languagePatterns: Record<string, RegExp[]> = {
    id: [
      /\b(halo|hai|terima kasih|tolong|saya|aku|tidak|tak|apa(kah)?|bagaimana|kenapa|kapan|sudah|belum|demam|nyeri|sakit|obat|ubat|dokter|rumah sakit|bahasa|besok|malam|sendiri|sesak|napas|batuk|minum|makan|perlu|boleh(kah)?|gimana|gak|nggak|darah|dada)\b/i,
    ],
    es: [/\b(hola|gracias|por favor|tengo|dolor|medico)\b/i],
    fr: [/\b(bonjour|merci|s'il vous plait|j'ai|douleur|medecin)\b/i],
    de: [/\b(hallo|danke|bitte|ich habe|schmerz|arzt)\b/i],
    pt: [/\b(ola|obrigado|por favor|tenho|dor|medico)\b/i],
    zh: [/[\u4e00-\u9fff]/],
    ja: [/[\u3040-\u309f\u30a0-\u30ff]/],
    ko: [/[\uac00-\ud7af]/],
    ar: [/[\u0600-\u06ff]/],
    hi: [/[\u0900-\u097f]/],
  };

  for (const [lang, patterns] of Object.entries(languagePatterns)) {
    if (patterns.some((pattern) => pattern.test(text))) {
      return lang;
    }
  }

  return 'en';
}
