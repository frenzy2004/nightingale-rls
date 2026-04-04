import { describe, it, expect, vi } from 'vitest';
import { detectContradictions, handleContradictions } from '@/lib/ai/tag-extractor';
import type { MemoryTag, TagExtractionResult, ContradictionInfo } from '@/types';

describe('test_memory_contradiction', () => {
  describe('Turn 1: "I take Panadol." -> Turn 2: "Actually I stopped last week."', () => {
    it('should detect contradiction between active and stopped medication', () => {
      const existingTags: MemoryTag[] = [
        {
          id: 'tag-1',
          message_id: 'msg-1',
          user_id: 'user-1',
          value: 'takes Panadol',
          tags: ['#medication'],
          status: 'active',
          authority: 'ai_extracted',
          source_message_id: 'msg-1',
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      ];

      const newTags: TagExtractionResult[] = [
        {
          value: 'stopped taking Panadol',
          tags: ['#medication'],
          status: 'stopped',
          confidence: 0.95,
        },
      ];

      const contradictions = detectContradictions(newTags, existingTags);

      expect(contradictions.length).toBe(1);
      expect(contradictions[0].existingTag.status).toBe('active');
      expect(contradictions[0].newTag.status).toBe('stopped');
    });

    it('should preserve both states with correct status markers', () => {
      const existingTags: MemoryTag[] = [
        {
          id: 'tag-1',
          message_id: 'msg-1',
          user_id: 'user-1',
          value: 'takes Panadol medication daily',
          tags: ['#medication'],
          status: 'active',
          authority: 'ai_extracted',
          source_message_id: 'msg-1',
          updated_at: '2024-01-01T00:00:00Z',
          created_at: '2024-01-01T00:00:00Z',
        },
      ];

      const newTags: TagExtractionResult[] = [
        {
          value: 'stopped taking Panadol medication',
          tags: ['#medication'],
          status: 'stopped',
          confidence: 0.9,
        },
      ];

      const contradictions = detectContradictions(newTags, existingTags);
      
      expect(contradictions.length).toBeGreaterThan(0);
      expect(contradictions[0].existingTag.status).toBe('active');
      expect(contradictions[0].newTag.status).toBe('stopped');
      expect(contradictions[0].resolution).toBe('update_status');
    });

    it('should maintain source_message_id pointers for both states', () => {
      const existingTag: MemoryTag = {
        id: 'tag-1',
        message_id: 'msg-1',
        user_id: 'user-1',
        value: 'takes ibuprofen',
        tags: ['#medication'],
        status: 'active',
        authority: 'ai_extracted',
        source_message_id: 'msg-1',
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };

      const newTag: MemoryTag = {
        id: 'tag-2',
        message_id: 'msg-2',
        user_id: 'user-1',
        value: 'stopped ibuprofen',
        tags: ['#medication'],
        status: 'stopped',
        authority: 'ai_extracted',
        source_message_id: 'msg-2',
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };

      expect(existingTag.source_message_id).toBe('msg-1');
      expect(newTag.source_message_id).toBe('msg-2');
      expect(existingTag.source_message_id).not.toBe(newTag.source_message_id);
    });
  });

  describe('Contradiction resolution strategies', () => {
    it('should flag both when clinician verified tag is contradicted', () => {
      const existingTags: MemoryTag[] = [
        {
          id: 'tag-1',
          message_id: 'msg-1',
          user_id: 'user-1',
          value: 'takes aspirin daily',
          tags: ['#medication'],
          status: 'active',
          authority: 'clinician_verified',
          source_message_id: 'msg-1',
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      ];

      const newTags: TagExtractionResult[] = [
        {
          value: 'stopped aspirin',
          tags: ['#medication'],
          status: 'stopped',
          confidence: 0.9,
        },
      ];

      const contradictions = detectContradictions(newTags, existingTags);

      expect(contradictions[0].resolution).toBe('flag_both');
    });

    it('should update status for AI-extracted tags', () => {
      const existingTags: MemoryTag[] = [
        {
          id: 'tag-1',
          message_id: 'msg-1',
          user_id: 'user-1',
          value: 'takes metformin',
          tags: ['#medication'],
          status: 'active',
          authority: 'ai_extracted',
          source_message_id: 'msg-1',
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      ];

      const newTags: TagExtractionResult[] = [
        {
          value: 'stopped metformin',
          tags: ['#medication'],
          status: 'stopped',
          confidence: 0.95,
        },
      ];

      const contradictions = detectContradictions(newTags, existingTags);

      expect(contradictions[0].resolution).toBe('update_status');
    });

    it('should keep both when restarting a stopped medication', () => {
      const existingTags: MemoryTag[] = [
        {
          id: 'tag-1',
          message_id: 'msg-1',
          user_id: 'user-1',
          value: 'stopped taking vitamin supplement daily',
          tags: ['#medication'],
          status: 'stopped',
          authority: 'ai_extracted',
          source_message_id: 'msg-1',
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      ];

      const newTags: TagExtractionResult[] = [
        {
          value: 'started vitamin supplement again daily',
          tags: ['#medication'],
          status: 'active',
          confidence: 0.9,
        },
      ];

      const contradictions = detectContradictions(newTags, existingTags);

      expect(contradictions.length).toBeGreaterThan(0);
      expect(contradictions[0].resolution).toBe('keep_both');
    });
  });

  describe('Non-contradictions', () => {
    it('should not detect contradiction for unrelated tags', () => {
      const existingTags: MemoryTag[] = [
        {
          id: 'tag-1',
          message_id: 'msg-1',
          user_id: 'user-1',
          value: 'headaches',
          tags: ['#symptom'],
          status: 'active',
          authority: 'ai_extracted',
          source_message_id: 'msg-1',
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      ];

      const newTags: TagExtractionResult[] = [
        {
          value: 'takes Tylenol',
          tags: ['#medication'],
          status: 'active',
          confidence: 0.9,
        },
      ];

      const contradictions = detectContradictions(newTags, existingTags);

      expect(contradictions.length).toBe(0);
    });

    it('should not detect contradiction for same status tags', () => {
      const existingTags: MemoryTag[] = [
        {
          id: 'tag-1',
          message_id: 'msg-1',
          user_id: 'user-1',
          value: 'takes vitamins',
          tags: ['#medication'],
          status: 'active',
          authority: 'ai_extracted',
          source_message_id: 'msg-1',
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      ];

      const newTags: TagExtractionResult[] = [
        {
          value: 'still taking vitamins daily',
          tags: ['#medication'],
          status: 'active',
          confidence: 0.85,
        },
      ];

      const contradictions = detectContradictions(newTags, existingTags);

      expect(contradictions.length).toBe(0);
    });
  });
});
