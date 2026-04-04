interface GuardrailResult {
  safe: boolean;
  reason?: string;
  modifiedContent?: string;
}

const UNSAFE_PATTERNS = [
  /\b(kill|suicide|self[- ]?harm|end my life)\b/i,
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
  'want to die',
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
  return `I'm concerned about what you've shared. If you're experiencing a medical emergency, please call emergency services (911 in the US) or go to your nearest emergency room immediately.

If you're having thoughts of self-harm, please reach out to a crisis helpline:
- National Suicide Prevention Lifeline: 988
- Crisis Text Line: Text HOME to 741741

Your health and safety matter. Please seek immediate help.`;
}

export function validateResponse(response: string): string {
  const outputCheck = checkOutputSafety(response);
  let finalResponse = outputCheck.modifiedContent || response;
  
  finalResponse = addUncertaintyMarkers(finalResponse);

  if (finalResponse.length > 1000) {
    const sentences = finalResponse.split(/[.!?]+/).filter(Boolean);
    finalResponse = sentences.slice(0, 4).join('. ') + '.';
  }

  return finalResponse;
}
