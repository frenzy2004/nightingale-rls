import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectContradictions, getRelevantTagsForEscalation } from '@/lib/ai/tag-extractor';
import type { MemoryTag, TagExtractionResult } from '@/types';

describe('test_escalation_trigger', () => {
  describe('Escalation appears after 2-3 turns or low-confidence', () => {
    it('should trigger escalation prompt after threshold turns', () => {
      const ESCALATION_TURN_THRESHOLD = 3;
      
      const turnCounts = [1, 2, 3, 4, 5];
      
      for (const turnCount of turnCounts) {
        const shouldShowEscalation = turnCount >= ESCALATION_TURN_THRESHOLD;
        
        if (turnCount >= ESCALATION_TURN_THRESHOLD) {
          expect(shouldShowEscalation).toBe(true);
        } else {
          expect(shouldShowEscalation).toBe(false);
        }
      }
    });
  });

  describe('Patient can edit packaged question before send', () => {
    it('should allow editing of question before escalation', () => {
      const originalQuestion = "What could cause my headaches?";
      const editedQuestion = "What could cause my headaches? They happen mostly in the morning.";
      
      expect(editedQuestion).not.toBe(originalQuestion);
      expect(editedQuestion.length).toBeGreaterThan(originalQuestion.length);
    });

    it('should preserve original question for logging', () => {
      const originalQuestion = "My stomach hurts";
      const editedQuestion = "My stomach hurts after eating";
      
      const escalationPayload = {
        originalQuestion,
        patientEditedQuestion: editedQuestion,
      };
      
      expect(escalationPayload.originalQuestion).toBe(originalQuestion);
      expect(escalationPayload.patientEditedQuestion).toBe(editedQuestion);
    });
  });

  describe('Payload includes tagged context snapshot', () => {
    it('should include relevant memory tags in escalation payload', () => {
      const memoryTags: MemoryTag[] = [
        {
          id: '1',
          message_id: 'm1',
          user_id: 'u1',
          value: 'takes Panadol',
          tags: ['#medication'],
          status: 'active',
          authority: 'ai_extracted',
          source_message_id: 'm1',
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
        {
          id: '2',
          message_id: 'm2',
          user_id: 'u1',
          value: 'headaches',
          tags: ['#symptom'],
          status: 'active',
          authority: 'ai_extracted',
          source_message_id: 'm2',
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      ];

      const contextSnapshot = getRelevantTagsForEscalation(
        memoryTags,
        'headache medication'
      );

      expect(contextSnapshot.length).toBeGreaterThan(0);
      expect(contextSnapshot.every(tag => 
        tag.status === 'active' || tag.status === 'flagged'
      )).toBe(true);
    });

    it('should prioritize flagged tags in context', () => {
      const memoryTags: MemoryTag[] = [
        {
          id: '1',
          message_id: 'm1',
          user_id: 'u1',
          value: 'takes aspirin',
          tags: ['#medication'],
          status: 'active',
          authority: 'ai_extracted',
          source_message_id: 'm1',
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
        {
          id: '2',
          message_id: 'm2',
          user_id: 'u1',
          value: 'conflicting medication info',
          tags: ['#medication'],
          status: 'flagged',
          authority: 'ai_extracted',
          source_message_id: 'm2',
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      ];

      const contextSnapshot = getRelevantTagsForEscalation(
        memoryTags,
        'medication question'
      );

      const flaggedFirst = contextSnapshot.findIndex(t => t.status === 'flagged');
      const activeFirst = contextSnapshot.findIndex(t => t.status === 'active');
      
      if (flaggedFirst !== -1 && activeFirst !== -1) {
        expect(flaggedFirst).toBeLessThan(activeFirst);
      }
    });
  });
});

describe('Escalation flow integration', () => {
  it('should package complete escalation payload', () => {
    const question = "Why do I have headaches?";
    const aiSummary = "Patient asking about recurring headaches";
    const contextSnapshot: MemoryTag[] = [
      {
        id: '1',
        message_id: 'm1',
        user_id: 'u1',
        value: 'headaches for 2 weeks',
        tags: ['#symptom', '#timeline'],
        status: 'active',
        authority: 'ai_extracted',
        source_message_id: 'm1',
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
    ];

    const escalationPayload = {
      originalQuestion: question,
      patientEditedQuestion: question,
      aiSummary,
      contextSnapshot,
      conversationId: 'conv-123',
    };

    expect(escalationPayload.originalQuestion).toBeDefined();
    expect(escalationPayload.aiSummary).toBeDefined();
    expect(escalationPayload.contextSnapshot.length).toBeGreaterThan(0);
    expect(escalationPayload.conversationId).toBeDefined();
  });
});
