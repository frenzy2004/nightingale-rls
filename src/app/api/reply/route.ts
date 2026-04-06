import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import {
  logClinicianEdit,
  logVerifiedAnswerInjected,
  logExperiment,
} from '@/lib/experiment-logger';
import { extractTags } from '@/lib/ai/gemini';
import { detectContradictions } from '@/lib/ai/tag-extractor';
import { buildProviderMessageMetadata } from '@/lib/demo';
import { v4 as uuidv4 } from 'uuid';
import type { Clinic, DiffEntry, MemoryTag, MessageMetadata, MessageType } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const {
      escalationId,
      aiDraft = '',
      finalReply,
      diffLog = [],
      messageType = 'provider_reply',
      metadata,
      patientId,
      conversationId,
    } = await request.json();

    if (!finalReply) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const clinicianId = user.id;
    const supabase = await createServiceClient();

    const { data: userData } = await supabase
      .from('users')
      .select('role, clinic_id, full_name')
      .eq('id', clinicianId)
      .single();

    if (userData?.role !== 'clinician' && userData?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    let effectivePatientId = patientId as string | undefined;
    let effectiveConversationId = conversationId as string | undefined;
    let effectiveClinicId = userData.clinic_id as string | null;
    let escalationCreatedAt: string | null = null;
    let escalationContext: MemoryTag[] = [];

    if (escalationId) {
      const { data: escalation } = await supabase
        .from('escalations')
        .select('patient_id, conversation_id, clinic_id, created_at, context_snapshot')
        .eq('id', escalationId)
        .single();

      if (!escalation) {
        return NextResponse.json(
          { error: 'Escalation not found' },
          { status: 404 }
        );
      }

      effectivePatientId = escalation.patient_id;
      effectiveConversationId = escalation.conversation_id;
      effectiveClinicId = escalation.clinic_id;
      escalationCreatedAt = escalation.created_at;
      escalationContext = (escalation.context_snapshot as MemoryTag[]) || [];
    }

    if (!effectivePatientId || !effectiveConversationId) {
      return NextResponse.json(
        { error: 'Missing patient context' },
        { status: 400 }
      );
    }

    const { data: patientData } = await supabase
      .from('users')
      .select('clinic_id')
      .eq('id', effectivePatientId)
      .single();

    if (!patientData || patientData.clinic_id !== effectiveClinicId) {
      return NextResponse.json(
        { error: 'Patient is outside your clinic scope' },
        { status: 403 }
      );
    }

    const { data: clinicData } = effectiveClinicId
      ? await supabase
          .from('clinics')
          .select('*')
          .eq('id', effectiveClinicId)
          .single()
      : { data: null };

    const messageMetadata = buildProviderMessageMetadata(
      clinicData as Clinic | null,
      userData.full_name,
      metadata as MessageMetadata | null
    );

    const messageId = uuidv4();

    const { error: messageError } = await supabase
      .from('messages')
      .insert({
        id: messageId,
        user_id: effectivePatientId,
        conversation_id: effectiveConversationId,
        content: finalReply,
        sender: 'clinician',
        authority: 'clinician_verified',
        language: null,
        message_type: messageType as MessageType,
        metadata: messageMetadata,
      });

    if (messageError) {
      console.error('Error inserting clinician message:', messageError);
      return NextResponse.json(
        { error: 'Failed to save message' },
        { status: 500 }
      );
    }

    let replyId: string | null = null;

    if (escalationId) {
      replyId = uuidv4();

      const { error: replyError } = await supabase
        .from('clinician_replies')
        .insert({
          id: replyId,
          escalation_id: escalationId,
          clinician_id: clinicianId,
          message_id: messageId,
          ai_draft: aiDraft,
          final_reply: finalReply,
          diff_log: diffLog as DiffEntry[],
        });

      if (replyError) {
        console.error('Error inserting clinician reply:', replyError);
      }

      const { error: escalationError } = await supabase
        .from('escalations')
        .update({ status: 'resolved' })
        .eq('id', escalationId);

      if (escalationError) {
        console.error('Error updating escalation status:', escalationError);
      }
    }

    const { data: existingTags } = await supabase
      .from('memory_tags')
      .select('*')
      .eq('user_id', effectivePatientId)
      .in('status', ['active', 'flagged']);

    if (existingTags && existingTags.length > 0) {
      const clinicianTags = await extractTags(finalReply);

      if (clinicianTags.length > 0) {
        const contradictions = detectContradictions(clinicianTags, existingTags);

        for (const contradiction of contradictions) {
          await supabase
            .from('memory_tags')
            .update({ status: 'flagged' })
            .eq('id', contradiction.existingTag.id);
        }

        for (const tag of clinicianTags) {
          await supabase
            .from('memory_tags')
            .insert({
              id: uuidv4(),
              user_id: effectivePatientId,
              value: tag.value,
              tags: tag.tags,
              status: tag.status,
              authority: 'clinician_verified',
              source_message_id: messageId,
            });
        }
      }

      for (const tag of escalationContext) {
        if (tag.status === 'flagged') {
          await supabase
            .from('memory_tags')
            .update({
              status: 'resolved',
              authority: 'clinician_verified',
            })
            .eq('id', tag.id);
        }
      }
    }

    if (escalationId) {
      await logClinicianEdit(
        supabase,
        clinicianId,
        escalationId,
        aiDraft,
        finalReply,
        diffLog
      );
    }

    if (escalationId && escalationCreatedAt) {
      const escalationTime = new Date(escalationCreatedAt).getTime();
      const responseTime = Date.now() - escalationTime;

      await logVerifiedAnswerInjected(
        supabase,
        effectivePatientId,
        messageId,
        escalationId,
        responseTime
      );
    }

    await logExperiment(supabase, {
      event_type: 'message_sent',
      user_id: clinicianId,
      payload: {
        message_id: messageId,
        conversation_id: effectiveConversationId,
        sender: 'clinician',
        escalation_id: escalationId,
        message_type: messageType,
      },
    });

    return NextResponse.json({
      success: true,
      messageId,
      replyId,
      metadata: messageMetadata,
    });
  } catch (error) {
    console.error('Reply error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
