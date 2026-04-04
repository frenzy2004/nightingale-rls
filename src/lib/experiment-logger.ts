import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExperimentEventType } from '@/types';
import { sanitizeForLogging } from './ai/phi-redaction';

interface LogEntry {
  event_type: ExperimentEventType;
  user_id: string;
  payload: Record<string, unknown>;
}

export async function logExperiment(
  supabase: SupabaseClient,
  entry: LogEntry
): Promise<void> {
  try {
    const sanitizedPayload = sanitizeForLogging(entry.payload);
    
    await supabase.from('experiment_logs').insert({
      event_type: entry.event_type,
      user_id: entry.user_id,
      payload: {
        ...sanitizedPayload,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Failed to log experiment:', error);
  }
}

export async function logMessageSent(
  supabase: SupabaseClient,
  userId: string,
  messageId: string,
  conversationId: string,
  sender: 'patient' | 'ai' | 'clinician'
): Promise<void> {
  await logExperiment(supabase, {
    event_type: 'message_sent',
    user_id: userId,
    payload: {
      message_id: messageId,
      conversation_id: conversationId,
      sender,
    },
  });
}

export async function logEscalationTriggered(
  supabase: SupabaseClient,
  userId: string,
  escalationId: string,
  conversationId: string,
  turnCount: number
): Promise<void> {
  await logExperiment(supabase, {
    event_type: 'escalation_triggered',
    user_id: userId,
    payload: {
      escalation_id: escalationId,
      conversation_id: conversationId,
      turn_count: turnCount,
    },
  });
}

export async function logPatientEdit(
  supabase: SupabaseClient,
  userId: string,
  escalationId: string,
  originalQuestion: string,
  editedQuestion: string
): Promise<void> {
  const hasEdits = originalQuestion !== editedQuestion;
  
  await logExperiment(supabase, {
    event_type: 'patient_edit_before_send',
    user_id: userId,
    payload: {
      escalation_id: escalationId,
      has_edits: hasEdits,
      original_length: originalQuestion.length,
      edited_length: editedQuestion.length,
    },
  });
}

export async function logClinicianEdit(
  supabase: SupabaseClient,
  userId: string,
  escalationId: string,
  aiDraft: string,
  finalReply: string,
  diffLog: Array<{ type?: string; value?: string }>
): Promise<void> {
  await logExperiment(supabase, {
    event_type: 'clinician_edit_before_send',
    user_id: userId,
    payload: {
      escalation_id: escalationId,
      ai_draft_length: aiDraft.length,
      final_reply_length: finalReply.length,
      edit_count: diffLog.filter((d) => d.type !== 'unchanged').length,
    },
  });

  await logExperiment(supabase, {
    event_type: 'ai_clinician_diff',
    user_id: userId,
    payload: {
      escalation_id: escalationId,
      diff_log: diffLog,
    },
  });
}

export async function logVerifiedAnswerInjected(
  supabase: SupabaseClient,
  userId: string,
  messageId: string,
  escalationId: string,
  responseTime: number
): Promise<void> {
  await logExperiment(supabase, {
    event_type: 'verified_answer_injected',
    user_id: userId,
    payload: {
      message_id: messageId,
      escalation_id: escalationId,
    },
  });

  await logExperiment(supabase, {
    event_type: 'response_turnaround_time',
    user_id: userId,
    payload: {
      escalation_id: escalationId,
      turnaround_ms: responseTime,
      turnaround_minutes: Math.round(responseTime / 60000),
    },
  });
}

export async function logContradictionDetected(
  supabase: SupabaseClient,
  userId: string,
  existingTagId: string,
  newTagId: string,
  resolution: string
): Promise<void> {
  await logExperiment(supabase, {
    event_type: 'contradiction_detected',
    user_id: userId,
    payload: {
      existing_tag_id: existingTagId,
      new_tag_id: newTagId,
      resolution,
    },
  });
}
