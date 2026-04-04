export type UserRole = 'patient' | 'clinician' | 'admin';

export type MessageSender = 'patient' | 'ai' | 'clinician';

export type MessageAuthority = 'ai_generated' | 'clinician_verified';

export type TagStatus = 'active' | 'stopped' | 'resolved' | 'flagged';

export type TagAuthority = 'ai_extracted' | 'clinician_verified';

export type EscalationStatus = 'pending' | 'in_progress' | 'resolved';

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
