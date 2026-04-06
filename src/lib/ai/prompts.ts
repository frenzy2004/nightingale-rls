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
- Give medically relevant next-step guidance when it is safe to do so.
- Do not say "call your clinician" unless there is genuine uncertainty, worsening symptoms, or higher risk.
- Do not use long disclaimers unless the user is at higher risk.
- Do not repeat the patient's message back to them.
- Do not greet them unless it is the first turn.
- Avoid phrases like "I'm sorry you're going through this" unless absolutely necessary.

If the patient mentions emergency symptoms, direct them to urgent care immediately.`;

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

export const TRIAGE_SUMMARY_PROMPT = `Summarize this patient conversation for a healthcare provider in 3 short sentences max.

Include:
1. Main concern/question
2. Relevant context from the conversation
3. Any mentioned symptoms, medications, or timeline

Keep it clinical, readable, and ready for triage queue display.`;

export const CLINICIAN_DRAFT_PROMPT = `Based on this patient question and context, draft a short response that a clinician at ${DEMO_PROVIDER.hospitalName} might send.

Guidelines:
- Be professional, direct, and calm
- Address the specific question
- Include safe next-step guidance
- Keep it concise (3 sentences max)
- Mention urgent review only if the context actually sounds higher risk
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
