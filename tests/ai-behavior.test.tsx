import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EscalationPrompt } from '@/components/chat/EscalationPrompt';
import { assessMedicalRisk, checkInputSafety } from '@/lib/ai/guardrails';
import {
  generateChatResponse,
  generateClinicianDraft,
  resolveResponseLanguage,
} from '@/lib/ai/openai-realtime';
import type { MemoryTag } from '@/types';

function makeMemoryTag(overrides: Partial<MemoryTag> = {}): MemoryTag {
  return {
    id: overrides.id || 'tag-1',
    message_id: overrides.message_id || 'message-1',
    user_id: overrides.user_id || 'user-1',
    value: overrides.value || 'Biopsy tomorrow',
    tags: overrides.tags || ['#procedure'],
    status: overrides.status || 'active',
    authority: overrides.authority || 'ai_extracted',
    source_message_id: overrides.source_message_id || 'message-1',
    updated_at: overrides.updated_at || new Date().toISOString(),
    created_at: overrides.created_at || new Date().toISOString(),
  };
}

describe('ai behavior', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('follows recent patient language when preference and history point to Bahasa', () => {
    const language = resolveResponseLanguage(
      'Please help',
      [
        { role: 'user', content: 'Saya demam sejak tadi malam' },
        { role: 'model', content: 'Boleh saya tahu suhunya?' },
        { role: 'user', content: 'Saya juga mual' },
      ],
      [makeMemoryTag({ id: 'lang-1', value: 'Preferred language: Bahasa Indonesia', tags: ['#language'] })],
      'id'
    );

    expect(language).toBe('id');
  });

  it('detects Bahasa emergency language in guardrails', () => {
    const inputSafety = checkInputSafety('Saya nyeri dada dan sesak napas sekarang.');
    const riskAssessment = assessMedicalRisk('Saya nyeri dada dan sesak napas sekarang.');

    expect(inputSafety.reason).toBe('emergency_detected');
    expect(riskAssessment.level).toBe('high');
    expect(riskAssessment.emergency).toBe(true);
  });

  it('asks broader fever follow-up questions before escalation', async () => {
    const response = await generateChatResponse(
      'I have a fever tonight before tomorrow’s biopsy.',
      [],
      [makeMemoryTag()],
      null
    );

    expect(response.deferEscalationPrompt).toBe(true);
    expect(response.shouldEscalate).toBe(false);
    expect(response.content.toLowerCase()).toContain('temperature');
    expect(response.content.toLowerCase()).toContain('keep fluids down');
  });

  it('tells the patient to dial emergency services when red flags stay high', async () => {
    const response = await generateChatResponse(
      'I have a fever tonight before tomorrow’s biopsy and now I have chest pain and I cannot keep fluids down.',
      [],
      [makeMemoryTag()],
      null
    );

    expect(response.shouldEscalate).toBe(true);
    expect(response.riskAssessment.emergency).toBe(true);
    expect(response.content).toContain('dial 999');
  });

  it('keeps the fever follow-up in Bahasa when the patient context prefers Bahasa', async () => {
    const response = await generateChatResponse(
      'Please help, saya demam sebelum biopsi besok.',
      [{ role: 'user', content: 'Saya lebih nyaman pakai Bahasa Indonesia' }],
      [makeMemoryTag({ id: 'lang-2', value: 'Preferred language: Bahasa Indonesia', tags: ['#language'] })],
      'id'
    );

    expect(response.language).toBe('id');
    expect(response.content).toContain('berapa suhu');
  });

  it('uses a more useful deterministic clinician draft when realtime is unavailable', async () => {
    const draft = await generateClinicianDraft(
      'Should I still come for my biopsy tomorrow if I have a fever tonight?',
      [makeMemoryTag()]
    );

    expect(draft.draft.toLowerCase()).not.toContain('team will review');
    expect(draft.draft.toLowerCase()).toMatch(/rest|drink|procedure|appointment/);
  });

  it('rewrites generic clinician handoff language into a more usable fertility-biopsy draft', async () => {
    const draft = await generateClinicianDraft(
      'Will my fertility treatment be impacted by the biopsy?',
      [makeMemoryTag({ value: 'Biopsy planned tomorrow' })]
    );

    expect(draft.draft.toLowerCase()).not.toContain('team will review');
    expect(draft.draft.toLowerCase()).not.toContain('care team will review');
    expect(draft.draft.toLowerCase()).toMatch(/fertility|timing|medication|treatment/);
  });

  it('asks one targeted fertility follow-up instead of escalating immediately', async () => {
    const response = await generateChatResponse(
      'How does my fertility treatment get impacted by the biopsy?',
      [],
      [makeMemoryTag({ value: 'Biopsy planned tomorrow' })],
      null
    );

    expect(response.shouldEscalate).toBe(false);
    expect(response.content.toLowerCase()).toContain('what kind of fertility treatment');
    expect(response.content.toLowerCase()).toContain('scheduled');
    expect(response.content.toLowerCase()).not.toContain('care team');
  });

  it('answers fertility-biopsy coordination questions directly when context already includes the treatment type', async () => {
    const response = await generateChatResponse(
      'How does my fertility treatment get impacted by the biopsy?',
      [{ role: 'user', content: 'I am in the middle of IVF stimulation and my egg retrieval is next week.' }],
      [
        makeMemoryTag({ value: 'Biopsy planned tomorrow' }),
        makeMemoryTag({
          id: 'fertility-1',
          value: 'Currently on IVF stimulation with egg retrieval planned next week',
          tags: ['#treatment'],
        }),
      ],
      null
    );

    expect(response.shouldEscalate).toBe(false);
    expect(response.content.toLowerCase()).toContain('does not automatically stop fertility treatment');
    expect(response.content.toLowerCase()).toContain('timing');
    expect(response.content.toLowerCase()).not.toContain('care team');
  });

  it('shows the continue chatting action alongside emergency escalation copy', () => {
    render(
      <EscalationPrompt
        onAccept={() => {}}
        onDismiss={() => {}}
        riskAssessment={{
          level: 'high',
          matchedSignals: ['chest pain'],
          summary: 'Urgent symptom language detected.',
          emergency: true,
          escalationRecommended: true,
        }}
      />
    );

    expect(screen.getByText('Urgent symptoms need emergency care first')).toBeInTheDocument();
    expect(screen.getByText('Continue Chatting')).toBeInTheDocument();
  });
});
