import type { MemoryTag, TagExtractionResult, ContradictionInfo, TagStatus } from '@/types';
import { SupabaseClient } from '@supabase/supabase-js';
import { logContradictionDetected } from '../experiment-logger';

const MEDICATION_STOP_PATTERNS = [
  /stopped?\s+(taking\s+)?(\w+)/i,
  /quit\s+(taking\s+)?(\w+)/i,
  /no longer\s+(take|taking|on)\s+(\w+)/i,
  /discontinued?\s+(\w+)/i,
  /off\s+(of\s+)?(\w+)/i,
];

const MEDICATION_START_PATTERNS = [
  /started?\s+(taking\s+)?(\w+)/i,
  /now\s+(taking|on)\s+(\w+)/i,
  /prescribed\s+(\w+)/i,
  /began\s+(taking\s+)?(\w+)/i,
];

export function detectContradictions(
  newTags: TagExtractionResult[],
  existingTags: MemoryTag[]
): ContradictionInfo[] {
  const contradictions: ContradictionInfo[] = [];

  for (const newTag of newTags) {
    const normalizedNewValue = normalizeValue(newTag.value);
    
    for (const existingTag of existingTags) {
      if (!sharesTags(newTag.tags, existingTag.tags)) continue;
      
      const normalizedExistingValue = normalizeValue(existingTag.value);

      if (isSameSubject(normalizedNewValue, normalizedExistingValue)) {
        if (isStatusContradiction(newTag, existingTag)) {
          contradictions.push({
            existingTag,
            newTag,
            resolution: determineResolution(newTag, existingTag),
          });
        }
      }
    }
  }

  return contradictions;
}

function normalizeValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function sharesTags(tags1: string[], tags2: string[]): boolean {
  return tags1.some(t => tags2.includes(t));
}

function isSameSubject(value1: string, value2: string): boolean {
  const words1 = new Set(value1.split(' ').filter(w => w.length > 3));
  const words2 = new Set(value2.split(' ').filter(w => w.length > 3));
  
  const intersection = [...words1].filter(w => words2.has(w));
  const minSize = Math.min(words1.size, words2.size);
  
  if (minSize === 0) return false;
  return intersection.length / minSize >= 0.5;
}

function isStatusContradiction(
  newTag: TagExtractionResult,
  existingTag: MemoryTag
): boolean {
  if (newTag.status === 'stopped' && existingTag.status === 'active') {
    return true;
  }
  if (newTag.status === 'active' && existingTag.status === 'stopped') {
    return true;
  }
  return false;
}

function determineResolution(
  newTag: TagExtractionResult,
  existingTag: MemoryTag
): 'update_status' | 'flag_both' | 'keep_both' {
  if (existingTag.authority === 'clinician_verified') {
    return 'flag_both';
  }

  if (newTag.status === 'stopped' && existingTag.status === 'active') {
    return 'update_status';
  }

  if (newTag.status === 'active' && existingTag.status === 'stopped') {
    return 'keep_both';
  }

  return 'flag_both';
}

export async function handleContradictions(
  supabase: SupabaseClient,
  userId: string,
  contradictions: ContradictionInfo[],
  newTagRecords: MemoryTag[]
): Promise<void> {
  for (const contradiction of contradictions) {
    const newTagRecord = newTagRecords.find(
      t => t.value === contradiction.newTag.value
    );
    
    if (!newTagRecord) continue;

    switch (contradiction.resolution) {
      case 'update_status':
        // Preserve both states: mark old tag as superseded, keep new tag with current status.
        // Both records remain in memory_tags with distinct source_message_id and timestamps.
        await supabase
          .from('memory_tags')
          .update({
            status: 'resolved' as TagStatus,
            updated_at: new Date().toISOString(),
          })
          .eq('id', contradiction.existingTag.id);
        break;

      case 'flag_both':
        await supabase
          .from('memory_tags')
          .update({ status: 'flagged' as TagStatus })
          .in('id', [contradiction.existingTag.id, newTagRecord.id]);
        break;

      case 'keep_both':
        break;
    }

    await logContradictionDetected(
      supabase,
      userId,
      contradiction.existingTag.id,
      newTagRecord.id,
      contradiction.resolution
    );
  }
}

export function extractMedicationChanges(
  message: string
): Array<{ medication: string; action: 'started' | 'stopped' }> {
  const changes: Array<{ medication: string; action: 'started' | 'stopped' }> = [];

  for (const pattern of MEDICATION_STOP_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      const medication = match[match.length - 1];
      if (medication && !isCommonWord(medication)) {
        changes.push({ medication, action: 'stopped' });
      }
    }
  }

  for (const pattern of MEDICATION_START_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      const medication = match[match.length - 1];
      if (medication && !isCommonWord(medication)) {
        changes.push({ medication, action: 'started' });
      }
    }
  }

  return changes;
}

function isCommonWord(word: string): boolean {
  const commonWords = new Set([
    'it', 'the', 'a', 'an', 'is', 'was', 'my', 'that', 'this',
    'some', 'any', 'all', 'week', 'month', 'day', 'year', 'ago',
    'now', 'then', 'today', 'yesterday', 'recently',
  ]);
  return commonWords.has(word.toLowerCase());
}

export function getRelevantTagsForEscalation(
  memoryTags: MemoryTag[],
  conversationContext: string
): MemoryTag[] {
  const contextWords = new Set(
    conversationContext
      .toLowerCase()
      .split(/\W+/)
      .filter(w => w.length > 3)
  );

  const scoredTags = memoryTags.map(tag => {
    let score = 0;
    
    if (tag.status === 'active') score += 2;
    if (tag.status === 'flagged') score += 3;
    if (tag.authority === 'clinician_verified') score += 2;

    const tagWords = tag.value.toLowerCase().split(/\W+/);
    const relevance = tagWords.filter(w => contextWords.has(w)).length;
    score += relevance;

    const ageMs = Date.now() - new Date(tag.updated_at).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays < 7) score += 2;
    else if (ageDays < 30) score += 1;

    return { tag, score };
  });

  return scoredTags
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(s => s.tag);
}
