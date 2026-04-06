import type { MemoryTag, PatientProfile } from '@/types';

export type PatientContextSectionKey =
  | 'clinical_history'
  | 'family_history'
  | 'psychosocial_history'
  | 'risk_factors'
  | 'medication_history'
  | 'allergies'
  | 'food_allergies'
  | 'considerations';

export type PatientContextItemStatus = MemoryTag['status'] | 'profile';

export interface PatientContextItem {
  id: string;
  value: string;
  tags: string[];
  status: PatientContextItemStatus;
  authority: MemoryTag['authority'] | 'emr_profile';
  updatedAt?: string;
  source: 'memory_tag' | 'patient_profile';
}

export interface PatientContextSection {
  key: PatientContextSectionKey;
  items: PatientContextItem[];
}

export const PATIENT_CONTEXT_SECTION_ORDER: PatientContextSectionKey[] = [
  'clinical_history',
  'family_history',
  'psychosocial_history',
  'risk_factors',
  'medication_history',
  'allergies',
  'food_allergies',
  'considerations',
];

const FAMILY_KEYWORDS = [
  'family',
  'mother',
  'father',
  'sister',
  'brother',
  'parent',
  'child',
  'children',
  'caregiver',
];

const PSYCHOSOCIAL_KEYWORDS = [
  'anxious',
  'anxiety',
  'worried',
  'stress',
  'stressed',
  'mood',
  'support',
  'childcare',
  'school-hour',
  'work',
  'transport',
  'sleep',
  'prefers',
  'reassurance',
];

const RISK_FACTOR_KEYWORDS = [
  'smoke',
  'smoker',
  'smoking',
  'vape',
  'alcohol',
  'obesity',
  'sedentary',
  'high risk',
  'risk profile',
  'immunocompromised',
];

const FOOD_ALLERGY_KEYWORDS = [
  'shellfish',
  'peanut',
  'nut',
  'egg',
  'milk',
  'soy',
  'wheat',
  'fish',
  'seafood',
  'gluten',
];

const CONSIDERATION_KEYWORDS = [
  'booked',
  'appointment',
  'arrange',
  'call',
  'review',
  'results',
  'pathology',
  'visit',
  'program',
  'preferred language',
  'last visit',
  'timeline',
];

function normalizeValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function matchesKeyword(value: string, keywords: string[]): boolean {
  const normalized = normalizeValue(value);
  return keywords.some((keyword) => normalized.includes(keyword));
}

function classifyAllergy(value: string): PatientContextSectionKey {
  return matchesKeyword(value, FOOD_ALLERGY_KEYWORDS) ? 'food_allergies' : 'allergies';
}

function classifyFreeText(value: string, tags: string[], status?: MemoryTag['status']): PatientContextSectionKey {
  const normalizedTags = tags.map((tag) => tag.toLowerCase());

  if (normalizedTags.includes('#medication')) {
    return 'medication_history';
  }

  if (normalizedTags.includes('#allergy')) {
    return classifyAllergy(value);
  }

  if (matchesKeyword(value, FAMILY_KEYWORDS)) {
    return 'family_history';
  }

  if (matchesKeyword(value, PSYCHOSOCIAL_KEYWORDS)) {
    return 'psychosocial_history';
  }

  if (matchesKeyword(value, RISK_FACTOR_KEYWORDS)) {
    return 'risk_factors';
  }

  if (status === 'flagged' || normalizedTags.includes('#timeline') || matchesKeyword(value, CONSIDERATION_KEYWORDS)) {
    return 'considerations';
  }

  return 'clinical_history';
}

function addItem(
  registry: Map<PatientContextSectionKey, PatientContextItem[]>,
  section: PatientContextSectionKey,
  item: PatientContextItem
) {
  const existingItems = registry.get(section) || [];
  const existingValues = new Set(existingItems.map((entry) => normalizeValue(entry.value)));

  if (existingValues.has(normalizeValue(item.value))) {
    return;
  }

  registry.set(section, [...existingItems, item]);
}

export function buildPatientContextSections(
  tags: MemoryTag[],
  profile?: PatientProfile | null
): PatientContextSection[] {
  const registry = new Map<PatientContextSectionKey, PatientContextItem[]>();

  if (profile) {
    if (profile.headline) {
      addItem(registry, 'clinical_history', {
        id: `profile-headline-${profile.user_id}`,
        value: profile.headline,
        tags: ['#profile'],
        status: 'profile',
        authority: 'emr_profile',
        source: 'patient_profile',
      });
    }

    if (profile.summary) {
      addItem(registry, classifyFreeText(profile.summary, ['#profile']), {
        id: `profile-summary-${profile.user_id}`,
        value: profile.summary,
        tags: ['#profile'],
        status: 'profile',
        authority: 'emr_profile',
        source: 'patient_profile',
      });
    }

    for (const allergy of profile.allergies || []) {
      if (!allergy || /^none documented$/i.test(allergy)) {
        continue;
      }

      addItem(registry, classifyAllergy(allergy), {
        id: `profile-allergy-${profile.user_id}-${normalizeValue(allergy)}`,
        value: allergy,
        tags: ['#allergy', '#profile'],
        status: 'profile',
        authority: 'emr_profile',
        source: 'patient_profile',
      });
    }

    for (const item of profile.recent_history || []) {
      addItem(registry, classifyFreeText(item, ['#profile']), {
        id: `profile-history-${profile.user_id}-${normalizeValue(item)}`,
        value: item,
        tags: ['#profile'],
        status: 'profile',
        authority: 'emr_profile',
        source: 'patient_profile',
      });
    }

    const stats = profile.history_stats || {};

    if (stats.risk_profile) {
      addItem(registry, 'risk_factors', {
        id: `profile-risk-${profile.user_id}`,
        value: `Risk profile: ${stats.risk_profile}`,
        tags: ['#risk'],
        status: 'profile',
        authority: 'emr_profile',
        source: 'patient_profile',
      });
    }

    if (stats.care_program) {
      addItem(registry, 'considerations', {
        id: `profile-program-${profile.user_id}`,
        value: `Care program: ${stats.care_program}`,
        tags: ['#program'],
        status: 'profile',
        authority: 'emr_profile',
        source: 'patient_profile',
      });
    }

    if (stats.last_visit) {
      addItem(registry, 'considerations', {
        id: `profile-last-visit-${profile.user_id}`,
        value: `Last visit: ${stats.last_visit}`,
        tags: ['#timeline'],
        status: 'profile',
        authority: 'emr_profile',
        source: 'patient_profile',
      });
    }

    if (stats.last_question) {
      addItem(registry, 'considerations', {
        id: `profile-last-question-${profile.user_id}`,
        value: `Last question: ${stats.last_question}`,
        tags: ['#question'],
        status: 'profile',
        authority: 'emr_profile',
        source: 'patient_profile',
      });
    }

    if (profile.preferred_language) {
      addItem(registry, 'considerations', {
        id: `profile-language-${profile.user_id}`,
        value: `Preferred language: ${profile.preferred_language.toUpperCase()}`,
        tags: ['#language'],
        status: 'profile',
        authority: 'emr_profile',
        source: 'patient_profile',
      });
    }
  }

  const sortedTags = [...tags].sort(
    (left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()
  );

  for (const tag of sortedTags) {
    const section = classifyFreeText(tag.value, tag.tags, tag.status);

    addItem(registry, section, {
      id: tag.id,
      value: tag.value,
      tags: tag.tags,
      status: tag.status,
      authority: tag.authority,
      updatedAt: tag.updated_at,
      source: 'memory_tag',
    });
  }

  return PATIENT_CONTEXT_SECTION_ORDER.map((sectionKey) => ({
    key: sectionKey,
    items: registry.get(sectionKey) || [],
  })).filter((section) => section.items.length > 0);
}
