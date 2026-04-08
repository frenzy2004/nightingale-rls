import type { RiskAssessment } from '@/types';
import { DEMO_PROVIDER } from '@/lib/demo';

interface GuardrailResult {
  safe: boolean;
  reason?: string;
  modifiedContent?: string;
}

const UNSAFE_PATTERNS = [
  /\b(how to (make|create|synthesize) (drugs?|meth|cocaine|heroin))\b/i,
  /\b(overdose on purpose)\b/i,
];

const MEDICAL_ADVICE_PATTERNS = [
  /\b(you (should|must|need to) (take|stop taking))\b/i,
  /\b(i (diagnose|prescribe))\b/i,
  /\b(definitely (have|is|are) [a-z]+ (disease|syndrome|disorder))\b/i,
];

const EMERGENCY_KEYWORDS = [
  'chest pain',
  'can\'t breathe',
  'severe bleeding',
  'stroke',
  'heart attack',
  'unconscious',
  'seizure',
  'overdose',
  'suicidal',
  'self-harm',
  'end my life',
  'want to die',
];

const HIGH_RISK_KEYWORDS = [
  'shortness of breath',
  'breathless',
  'lump',
  'faint',
  'fainted',
  'vomiting',
  'vision loss',
  'weakness',
  'bleeding',
  'coughing blood',
  'black stool',
  'severe headache',
  'confused',
  'seizure',
];

const MODERATE_RISK_KEYWORDS = [
  'biopsy',
  'chemotherapy',
  'infusion',
  'nausea',
  'dizzy',
  'swelling',
  'pain getting worse',
  'worsening',
  'fever',
  'infection',
];

const PROACTIVE_ESCALATION_KEYWORDS = ['fever', 'infection'];

const FILLER_PHRASES = [
  /^i'?m sorry[^.?!]*[.?!]\s*/i,
  /^that sounds really hard[^.?!]*[.?!]\s*/i,
  /^i understand[^.?!]*[.?!]\s*/i,
];

export function checkInputSafety(content: string): GuardrailResult {
  for (const pattern of UNSAFE_PATTERNS) {
    if (pattern.test(content)) {
      return {
        safe: false,
        reason: 'Content flagged for safety review',
      };
    }
  }

  const hasEmergencyKeyword = EMERGENCY_KEYWORDS.some(
    keyword => content.toLowerCase().includes(keyword)
  );

  if (hasEmergencyKeyword) {
    return {
      safe: true,
      reason: 'emergency_detected',
    };
  }

  return { safe: true };
}

export function assessMedicalRisk(content: string): RiskAssessment {
  const normalized = content.toLowerCase();
  const emergencySignals = EMERGENCY_KEYWORDS.filter((keyword) =>
    normalized.includes(keyword)
  );
  const highSignals = HIGH_RISK_KEYWORDS.filter((keyword) =>
    normalized.includes(keyword)
  );
  const moderateSignals = MODERATE_RISK_KEYWORDS.filter((keyword) =>
    normalized.includes(keyword)
  );

  if (emergencySignals.length > 0) {
    return {
      level: 'high',
      matchedSignals: emergencySignals,
      summary: 'Urgent symptom language detected. The patient needs immediate safety guidance.',
      emergency: true,
      escalationRecommended: true,
    };
  }

  if (highSignals.length > 0 || moderateSignals.length >= 2) {
    return {
      level: 'high',
      matchedSignals: [...highSignals, ...moderateSignals],
      summary: 'Higher-risk symptom or oncology follow-up language detected. Escalation is recommended.',
      emergency: false,
      escalationRecommended: true,
    };
  }

  if (moderateSignals.length > 0) {
    const escalationRecommended = moderateSignals.some((signal) =>
      PROACTIVE_ESCALATION_KEYWORDS.includes(signal)
    );

    return {
      level: 'medium',
      matchedSignals: moderateSignals,
      summary: escalationRecommended
        ? 'Clinically relevant follow-up signs detected. A clinician review is recommended.'
        : 'Clinically relevant follow-up signs detected. A clinician review may help if symptoms continue.',
      emergency: false,
      escalationRecommended,
    };
  }

  return {
    level: 'low',
    matchedSignals: [],
    summary: 'No deterministic high-risk signals detected.',
    emergency: false,
    escalationRecommended: false,
  };
}

export function checkOutputSafety(content: string): GuardrailResult {
  for (const pattern of MEDICAL_ADVICE_PATTERNS) {
    if (pattern.test(content)) {
      const modifiedContent = content
        .replace(/you (should|must|need to)/gi, 'you might consider')
        .replace(/i (diagnose|prescribe)/gi, 'this could be related to')
        .replace(/definitely (have|is|are)/gi, 'might have');
      
      return {
        safe: true,
        modifiedContent,
        reason: 'Modified to remove prescriptive language',
      };
    }
  }

  return { safe: true };
}

export function addUncertaintyMarkers(content: string): string {
  const certaintyPhrases = [
    { pattern: /\bthis is\b/gi, replacement: 'this might be' },
    { pattern: /\byou have\b/gi, replacement: 'you might have' },
    { pattern: /\bit\'s definitely\b/gi, replacement: 'it could be' },
    { pattern: /\balways\b/gi, replacement: 'often' },
    { pattern: /\bnever\b/gi, replacement: 'rarely' },
  ];

  let modified = content;
  for (const { pattern, replacement } of certaintyPhrases) {
    modified = modified.replace(pattern, replacement);
  }

  return modified;
}

export function getEmergencyResponse(): string {
  return `This sounds urgent. Please go to the nearest emergency department now or dial ${DEMO_PROVIDER.emergencyPhone} for emergency help.

If you are heading to ${DEMO_PROVIDER.hospitalName}, bring any medication list with you.`;
}

export function validateResponse(response: string): string {
  const outputCheck = checkOutputSafety(response);
  let finalResponse = outputCheck.modifiedContent || response;

  for (const phrase of FILLER_PHRASES) {
    finalResponse = finalResponse.replace(phrase, '');
  }

  finalResponse = addUncertaintyMarkers(finalResponse);
  finalResponse = finalResponse.replace(/\s+/g, ' ').trim();

  const sentences = finalResponse
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, 3);

  finalResponse = sentences.join(' ');

  const questionCount = (finalResponse.match(/\?/g) || []).length;
  if (questionCount > 1) {
    let seenQuestion = false;
    finalResponse = finalResponse
      .split('')
      .map((char) => {
        if (char !== '?') return char;
        if (seenQuestion) return '.';
        seenQuestion = true;
        return char;
      })
      .join('');
  }

  if (!/[.!?]$/.test(finalResponse)) {
    finalResponse = `${finalResponse}.`;
  }

  return finalResponse;
}
