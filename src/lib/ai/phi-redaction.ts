interface RedactionResult {
  redactedText: string;
  redactions: RedactionEntry[];
}

interface RedactionEntry {
  type: string;
  original: string;
  replacement: string;
  position: number;
}

const PHI_PATTERNS: Array<{ type: string; pattern: RegExp; replacement: string }> = [
  {
    type: 'SSN',
    pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
    replacement: '[SSN REDACTED]',
  },
  {
    type: 'PHONE',
    pattern: /\b(\+?1[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g,
    replacement: '[PHONE REDACTED]',
  },
  {
    type: 'EMAIL',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    replacement: '[EMAIL REDACTED]',
  },
  {
    type: 'DOB',
    pattern: /\b(0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12]\d|3[01])[\/\-](19|20)\d{2}\b/g,
    replacement: '[DOB REDACTED]',
  },
  {
    type: 'ADDRESS',
    pattern: /\b\d{1,5}\s+[\w\s]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|court|ct|way|circle|cir)\.?\s*(?:apt\.?\s*\d+|suite\s*\d+|#\s*\d+)?\b/gi,
    replacement: '[ADDRESS REDACTED]',
  },
  {
    type: 'ZIP',
    pattern: /\b\d{5}(-\d{4})?\b/g,
    replacement: '[ZIP REDACTED]',
  },
  {
    type: 'MRN',
    pattern: /\b(?:mrn|medical record|patient id)[:\s#]*[A-Z0-9-]{6,15}\b/gi,
    replacement: '[MRN REDACTED]',
  },
  {
    type: 'CREDIT_CARD',
    pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    replacement: '[CARD REDACTED]',
  },
  {
    type: 'INSURANCE_ID',
    pattern: /\b(?:insurance|policy|member)[:\s#]*[A-Z0-9-]{8,20}\b/gi,
    replacement: '[INSURANCE ID REDACTED]',
  },
];

export function redactPHI(text: string): RedactionResult {
  const redactions: RedactionEntry[] = [];
  let redactedText = text;

  for (const { type, pattern, replacement } of PHI_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    
    while ((match = regex.exec(text)) !== null) {
      redactions.push({
        type,
        original: match[0],
        replacement,
        position: match.index,
      });
    }

    redactedText = redactedText.replace(pattern, replacement);
  }

  return { redactedText, redactions };
}

export function hasPersonalInfo(text: string): boolean {
  return PHI_PATTERNS.some(({ pattern }) => pattern.test(text));
}

export function sanitizeForLogging(data: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...data };
  
  const sensitiveFields = ['content', 'message', 'question', 'response', 'text'];
  
  for (const field of sensitiveFields) {
    if (typeof sanitized[field] === 'string') {
      const { redactedText } = redactPHI(sanitized[field] as string);
      sanitized[field] = redactedText;
    }
  }

  return sanitized;
}

export function redactFromObject<T extends object>(obj: T): T {
  const result = { ...obj } as Record<string, unknown>;
  
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'string') {
      const { redactedText } = redactPHI(value);
      result[key] = redactedText;
    } else if (typeof value === 'object' && value !== null) {
      result[key] = redactFromObject(value as object);
    }
  }

  return result as T;
}
