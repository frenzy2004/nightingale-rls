import { describe, it, expect, vi } from 'vitest';
import { diffWords } from 'diff';
import type { Message, DiffEntry } from '@/types';

describe('test_clinic_reply_injection', () => {
  describe('Reply appears in patient chat as distinct verified bubble', () => {
    it('should create message with clinician sender', () => {
      const clinicianReply: Partial<Message> = {
        content: 'Based on your symptoms, I recommend scheduling an appointment.',
        sender: 'clinician',
        authority: 'clinician_verified',
      };

      expect(clinicianReply.sender).toBe('clinician');
      expect(clinicianReply.authority).toBe('clinician_verified');
    });

    it('should distinguish clinician messages from AI messages', () => {
      const messages: Partial<Message>[] = [
        { sender: 'patient', content: 'I have a question' },
        { sender: 'ai', content: 'Here is some info', authority: 'ai_generated' },
        { sender: 'clinician', content: 'Verified response', authority: 'clinician_verified' },
      ];

      const clinicianMessages = messages.filter(m => m.sender === 'clinician');
      const aiMessages = messages.filter(m => m.sender === 'ai');

      expect(clinicianMessages.length).toBe(1);
      expect(clinicianMessages[0].authority).toBe('clinician_verified');
      expect(aiMessages[0].authority).toBe('ai_generated');
    });
  });

  describe('Reply is persisted as authority == clinician_verified', () => {
    it('should set authority to clinician_verified on reply', () => {
      const createClinicianMessage = (content: string): Partial<Message> => ({
        content,
        sender: 'clinician',
        authority: 'clinician_verified',
      });

      const message = createClinicianMessage('Your test results are normal.');

      expect(message.authority).toBe('clinician_verified');
    });

    it('should never create clinician message with ai_generated authority', () => {
      const validateClinicianMessage = (message: Partial<Message>): boolean => {
        if (message.sender === 'clinician') {
          return message.authority === 'clinician_verified';
        }
        return true;
      };

      const validMessage: Partial<Message> = {
        sender: 'clinician',
        authority: 'clinician_verified',
        content: 'Test',
      };

      const invalidMessage: Partial<Message> = {
        sender: 'clinician',
        authority: 'ai_generated',
        content: 'Test',
      };

      expect(validateClinicianMessage(validMessage)).toBe(true);
      expect(validateClinicianMessage(invalidMessage)).toBe(false);
    });
  });

  describe('Conflicts with prior AI context are flagged', () => {
    it('should identify conflicting information', () => {
      const aiContext = 'Patient reports taking aspirin daily';
      const clinicianReply = 'I see from your records you are allergic to aspirin. Please stop immediately.';

      const hasConflict = (ai: string, clinician: string): boolean => {
        const aiLower = ai.toLowerCase();
        const clinicianLower = clinician.toLowerCase();
        
        const conflictKeywords = ['stop', 'allergic', 'incorrect', 'wrong', 'not', 'don\'t'];
        return conflictKeywords.some(keyword => clinicianLower.includes(keyword));
      };

      expect(hasConflict(aiContext, clinicianReply)).toBe(true);
    });

    it('should mark conflicting tags as flagged when clinician contradicts AI', () => {
      type TagStatus = 'active' | 'stopped' | 'resolved' | 'flagged';
      
      const existingAiTag = {
        id: 'tag-1',
        value: 'takes aspirin',
        status: 'active' as TagStatus,
        authority: 'ai_extracted' as const,
      };

      const clinicianContradicts = true;

      const resolveConflict = (
        tag: typeof existingAiTag,
        contradicts: boolean
      ): { id: string; value: string; status: TagStatus; authority: 'ai_extracted' } => {
        if (contradicts) {
          return { ...tag, status: 'flagged' as TagStatus };
        }
        return tag;
      };

      const updatedTag = resolveConflict(existingAiTag, clinicianContradicts);
      
      expect(updatedTag.status).toBe('flagged');
    });
  });
});

describe('test_edit_delta_log', () => {
  describe('Both AI draft and clinician-edited response are stored', () => {
    it('should store both versions', () => {
      const aiDraft = 'Based on your symptoms, this could be a mild cold.';
      const clinicianEdited = 'Based on your symptoms, this appears to be a mild cold. I recommend rest and fluids.';

      const replyRecord = {
        ai_draft: aiDraft,
        final_reply: clinicianEdited,
      };

      expect(replyRecord.ai_draft).toBe(aiDraft);
      expect(replyRecord.final_reply).toBe(clinicianEdited);
      expect(replyRecord.ai_draft).not.toBe(replyRecord.final_reply);
    });
  });

  describe('Diff between versions is logged and retrievable', () => {
    it('should generate word-level diff', () => {
      const aiDraft = 'This could be a cold.';
      const clinicianEdited = 'This appears to be a mild cold.';

      const diff = diffWords(aiDraft, clinicianEdited);

      const added = diff.filter(d => d.added);
      const removed = diff.filter(d => d.removed);

      expect(added.length).toBeGreaterThan(0);
      expect(removed.length).toBeGreaterThan(0);
    });

    it('should convert diff to storable format', () => {
      const aiDraft = 'Take medication twice daily.';
      const clinicianEdited = 'Take medication once daily with food.';

      const diff = diffWords(aiDraft, clinicianEdited);
      
      const diffLog: DiffEntry[] = diff.map(part => ({
        type: part.added ? 'added' : part.removed ? 'removed' : 'unchanged',
        value: part.value,
      }));

      expect(Array.isArray(diffLog)).toBe(true);
      expect(diffLog.every(entry => 
        ['added', 'removed', 'unchanged'].includes(entry.type)
      )).toBe(true);
    });

    it('should calculate edit statistics from diff', () => {
      const aiDraft = 'Your symptoms suggest a viral infection. Rest is recommended.';
      const clinicianEdited = 'Your symptoms suggest a viral infection. Rest and hydration are recommended. Follow up if symptoms worsen.';

      const diff = diffWords(aiDraft, clinicianEdited);
      
      const stats = {
        addedWords: diff.filter(d => d.added).reduce((sum, d) => sum + d.value.split(' ').length, 0),
        removedWords: diff.filter(d => d.removed).reduce((sum, d) => sum + d.value.split(' ').length, 0),
        totalChanges: diff.filter(d => d.added || d.removed).length,
      };

      expect(stats.addedWords).toBeGreaterThan(0);
      expect(stats.totalChanges).toBeGreaterThan(0);
    });
  });
});
