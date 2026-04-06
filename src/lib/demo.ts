import type {
  AppointmentOption,
  BrandTheme,
  Clinic,
  EscalationStatus,
  MessageMetadata,
  ProviderIdentity,
  QuickActionOption,
} from '@/types';

const demoEnv = process.env.NEXT_PUBLIC_DEMO_MODE ?? process.env.DEMO_MODE;

export const DEMO_MODE = demoEnv === 'true';

export const DEMO_BRAND_THEME: BrandTheme = {
  primary: '#0F6C5D',
  accent: '#F2B948',
  surface: '#F7FBFA',
  ink: '#123036',
};

export const DEMO_PROVIDER = {
  providerName: 'Asia OneHealthCare',
  hospitalName: 'SJMC',
  emergencyPhone: '999',
  clinicianName: 'Dr Alan Teh',
  clinicianRole: 'Consultant Oncologist',
  specialty: 'Oncology',
  theme: DEMO_BRAND_THEME,
};

export const PROVIDER_QUICK_ACTIONS: QuickActionOption[] = [
  { id: 'explain', label: 'Explain this to me' },
  { id: 'next', label: 'What should I do next?' },
  { id: 'urgent', label: 'How urgent is this?' },
];

export const DEFAULT_APPOINTMENT_OPTIONS: AppointmentOption[] = [
  {
    id: 'slot-1',
    label: 'Tue, 9 Apr · 10:00 AM',
    datetime: '2026-04-09T10:00:00+08:00',
  },
  {
    id: 'slot-2',
    label: 'Wed, 10 Apr · 2:30 PM',
    datetime: '2026-04-10T14:30:00+08:00',
  },
];

export const PROVIDER_MESSAGE_DISCLAIMER =
  'This message supports, but does not replace, urgent in-person care. If symptoms escalate, contact SJMC or dial 999.';

export const PATIENT_SAFETY_FOOTER =
  'Nightingale may make mistakes, so verify the outputs with clinical staff. If there is an emergency, disconnect now and dial 999 or go to SJMC Emergency.';

export function getClinicEscalationLabel(status: EscalationStatus): string {
  switch (status) {
    case 'pending':
      return 'Received';
    case 'in_progress':
      return 'Reviewing';
    case 'resolved':
      return 'Responded';
  }
}

export function getPatientEscalationLabel(status: EscalationStatus): string {
  switch (status) {
    case 'pending':
      return 'Sent to care team';
    case 'in_progress':
      return 'Care team reviewing';
    case 'resolved':
      return 'Response received';
  }
}

export function getProviderIdentity(
  clinic?: Partial<Clinic> | null,
  clinicianName?: string | null
): ProviderIdentity {
  return {
    name: clinicianName || clinic?.primary_clinician_name || DEMO_PROVIDER.clinicianName,
    role: DEMO_PROVIDER.clinicianRole,
    providerName: clinic?.provider_name || DEMO_PROVIDER.providerName,
    hospitalName: clinic?.hospital_name || DEMO_PROVIDER.hospitalName,
    specialty: clinic?.primary_specialty || DEMO_PROVIDER.specialty,
  };
}

export function getBrandTheme(clinic?: Partial<Clinic> | null): BrandTheme {
  const rawTheme = clinic?.brand_theme;

  if (
    rawTheme &&
    typeof rawTheme === 'object' &&
    'primary' in rawTheme &&
    'accent' in rawTheme &&
    'surface' in rawTheme &&
    'ink' in rawTheme
  ) {
    return rawTheme as BrandTheme;
  }

  return DEMO_BRAND_THEME;
}

export function buildProviderMessageMetadata(
  clinic?: Partial<Clinic> | null,
  clinicianName?: string | null,
  metadata?: MessageMetadata | null
): MessageMetadata {
  return {
    provider: getProviderIdentity(clinic, clinicianName),
    disclaimer: metadata?.disclaimer || PROVIDER_MESSAGE_DISCLAIMER,
    quickActions: metadata?.quickActions || PROVIDER_QUICK_ACTIONS,
    appointmentOptions:
      metadata?.appointmentOptions ||
      (DEMO_MODE ? DEFAULT_APPOINTMENT_OPTIONS : undefined),
    ...metadata,
  };
}

export function synthesizeQuickActionPrompt(
  action: QuickActionOption,
  providerMessage: string,
  providerIdentity?: ProviderIdentity | null
): string {
  const providerName = providerIdentity?.name || DEMO_PROVIDER.clinicianName;

  switch (action.id) {
    case 'explain':
      return `The patient tapped "Explain this to me" after this provider message from ${providerName}: "${providerMessage}". Explain it in plain language, keep it to 3 sentences max, and do not add new diagnoses.`;
    case 'urgent':
      return `The patient tapped "How urgent is this?" after this provider message from ${providerName}: "${providerMessage}". Explain how urgent the next steps sound, mention warning signs briefly, and keep it to 3 sentences max.`;
    default:
      return `The patient tapped "What should I do next?" after this provider message from ${providerName}: "${providerMessage}". Turn the provider advice into the next practical steps in 3 sentences max.`;
  }
}
