export type UserRole = 'patient' | 'clinician' | 'admin';

export type MessageSender = 'patient' | 'ai' | 'clinician';

export type MessageAuthority = 'ai_generated' | 'clinician_verified';

export type MessageType = 'chat' | 'provider_reply' | 'consult_summary';

export type TagStatus = 'active' | 'stopped' | 'resolved' | 'flagged';

export type TagAuthority = 'ai_extracted' | 'clinician_verified';

export type EscalationStatus = 'pending' | 'in_progress' | 'resolved';

export type RiskLevel = 'low' | 'medium' | 'high';

export interface BrandTheme {
  primary: string;
  accent: string;
  surface: string;
  ink: string;
}

export interface QuickActionOption {
  id: string;
  label: string;
}

export interface AppointmentOption {
  id: string;
  label: string;
  datetime: string;
}

export interface SourceReference {
  title: string;
  url: string;
  publisher: string;
  domain: string;
}

export interface GroundingSource extends SourceReference {
  excerpt: string;
  publishedDate?: string | null;
}

export interface ProviderIdentity {
  name: string;
  role: string;
  providerName: string;
  hospitalName: string;
  specialty?: string | null;
}

export interface MessageMetadata {
  riskLevel?: RiskLevel;
  riskSummary?: string;
  matchedSignals?: string[];
  inputMode?: 'text' | 'voice' | 'image';
  imageName?: string;
  provider?: ProviderIdentity;
  disclaimer?: string;
  quickActions?: QuickActionOption[];
  appointmentOptions?: AppointmentOption[];
  quickActionId?: string;
  sourceMessageId?: string;
  careStatus?: EscalationStatus;
  careStatusLabel?: string;
  summaryType?: 'triage' | 'consult';
  groundedBySearch?: boolean;
  sources?: SourceReference[];
}

export interface PatientProfile {
  user_id: string;
  age_label: string | null;
  mrn: string | null;
  allergies: string[];
  headline: string | null;
  summary: string | null;
  history_stats: Record<string, string>;
  recent_history: string[];
  preferred_language: string | null;
  created_at: string;
  updated_at: string;
}

export interface RiskAssessment {
  level: RiskLevel;
  matchedSignals: string[];
  summary: string;
  emergency: boolean;
  escalationRecommended: boolean;
}

export interface User {
  id: string;
  email: string;
  role: UserRole;
  clinic_id: string | null;
  full_name: string | null;
  created_at: string;
}

export interface Clinic {
  id: string;
  name: string;
  provider_name: string | null;
  hospital_name: string | null;
  emergency_phone: string | null;
  primary_clinician_name: string | null;
  primary_specialty: string | null;
  brand_theme: BrandTheme | Record<string, unknown> | null;
  created_at: string;
}

export interface Message {
  id: string;
  user_id: string;
  conversation_id: string;
  content: string;
  sender: MessageSender;
  authority: MessageAuthority;
  language: string | null;
  message_type: MessageType;
  metadata: MessageMetadata | null;
  created_at: string;
}

export interface MemoryTag {
  id: string;
  message_id: string;
  user_id: string;
  value: string;
  tags: string[];
  status: TagStatus;
  authority: TagAuthority;
  source_message_id: string;
  updated_at: string;
  created_at: string;
}

export interface Escalation {
  id: string;
  patient_id: string;
  clinic_id: string;
  conversation_id: string;
  original_question: string;
  patient_edited_question: string;
  ai_summary: string;
  context_snapshot: MemoryTag[];
  status: EscalationStatus;
  created_at: string;
  updated_at: string;
}

export interface ClinicianReply {
  id: string;
  escalation_id: string;
  clinician_id: string;
  message_id: string;
  ai_draft: string;
  final_reply: string;
  diff_log: DiffEntry[];
  sent_at: string;
}

export interface DiffEntry {
  type: 'added' | 'removed' | 'unchanged';
  value: string;
}

export interface ExperimentLog {
  id: string;
  event_type: ExperimentEventType;
  user_id: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export type ExperimentEventType =
  | 'message_sent'
  | 'escalation_triggered'
  | 'escalation_prompt_shown'
  | 'patient_edit_before_send'
  | 'clinician_edit_before_send'
  | 'ai_clinician_diff'
  | 'verified_answer_injected'
  | 'response_turnaround_time'
  | 'contradiction_detected'
  | 'tag_extracted';

export interface ChatContext {
  conversationId: string;
  userId: string;
  messages: Message[];
  memoryTags: MemoryTag[];
  turnCount: number;
}

export interface EscalationPayload {
  question: string;
  aiSummary: string;
  contextSnapshot: MemoryTag[];
  conversationId: string;
  riskAssessment?: RiskAssessment | null;
}

export interface TagExtractionResult {
  value: string;
  tags: string[];
  status: TagStatus;
  confidence: number;
}

export interface ContradictionInfo {
  existingTag: MemoryTag;
  newTag: TagExtractionResult;
  resolution: 'update_status' | 'flag_both' | 'keep_both';
}
