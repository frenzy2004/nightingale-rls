import { describe, expect, it } from 'vitest';
import { validateResponse, assessMedicalRisk, getEmergencyResponse } from '@/lib/ai/guardrails';
import {
  buildProviderMessageMetadata,
  getClinicEscalationLabel,
  getPatientEscalationLabel,
} from '@/lib/demo';

describe('demo-ready AI formatting', () => {
  it('hard-limits responses to three sentences and one question', () => {
    const response = validateResponse(
      "I'm sorry you're dealing with this. This is definitely serious. You should stop everything right now. Do you feel worse now? Can you come in today?"
    );

    const sentenceCount = response.split(/(?<=[.!?])\s+/).filter(Boolean).length;
    const questionCount = (response.match(/\?/g) || []).length;

    expect(sentenceCount).toBeLessThanOrEqual(3);
    expect(questionCount).toBeLessThanOrEqual(1);
  });

  it('classifies neck lump copy as high risk', () => {
    const risk = assessMedicalRisk('I found a hard lump on my neck today and I am worried.');

    expect(risk.level).toBe('high');
    expect(risk.escalationRecommended).toBe(true);
  });

  it('uses malaysia-localized emergency copy', () => {
    expect(getEmergencyResponse()).toContain('999');
    expect(getEmergencyResponse()).toContain('SJMC');
  });
});

describe('demo-ready provider metadata', () => {
  it('builds default provider card metadata', () => {
    const metadata = buildProviderMessageMetadata(null, 'Dr Alan Teh', null);

    expect(metadata.provider?.name).toBe('Dr Alan Teh');
    expect(metadata.provider?.hospitalName).toBe('SJMC');
    expect(metadata.quickActions?.length).toBeGreaterThan(0);
  });

  it('maps escalation labels for clinic and patient views', () => {
    expect(getClinicEscalationLabel('pending')).toBe('Received');
    expect(getPatientEscalationLabel('resolved')).toBe('Response received');
  });
});
