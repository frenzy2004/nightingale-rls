import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  logClinicianEdit,
  logVerifiedAnswerInjected,
  logExperiment
} from '@/lib/experiment-logger';
import { extractTags } from '@/lib/ai/gemini';
import { detectContradictions } from '@/lib/ai/tag-extractor';
import { v4 as uuidv4 } from 'uuid';
import type { DiffEntry, MemoryTag } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const {
      escalationId,
      aiDraft,
      finalReply,
      diffLog,
    } = await request.json();

    if (!escalationId || !finalReply) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const clinicianId = user.id;

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

    // Derive patientId and conversationId from the escalation record (server-side)
    const { data: escalation } = await supabase
      .from('escalations')
      .select('patient_id, conversation_id, created_at, context_snapshot')
      .eq('id', escalationId)
      .single();

    if (!escalation) {
      return NextResponse.json(
        { error: 'Escalation not found' },
        { status: 404 }
      );
    }

    const patientId = escalation.patient_id;
    const conversationId = escalation.conversation_id;

    const clinicianSignature = userData.full_name 
      ? `\n\n— ${userData.full_name}, Healthcare Provider`
      : '';

    const messageId = uuidv4();
    const messageContent = finalReply + clinicianSignature;
    
    const { error: messageError } = await supabase
      .from('messages')
      .insert({
        id: messageId,
        user_id: patientId,
        conversation_id: conversationId,
        content: messageContent,
        sender: 'clinician',
        authority: 'clinician_verified',
        language: null,
      });

    if (messageError) {
      console.error('Error inserting clinician message:', messageError);
      return NextResponse.json(
        { error: 'Failed to save message' },
        { status: 500 }
      );
    }

    const replyId = uuidv4();
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

    // Extract clinician-verified tags from the reply and flag contradictions
    const { data: existingTags } = await supabase
      .from('memory_tags')
      .select('*')
      .eq('user_id', patientId)
      .in('status', ['active', 'flagged']);

    if (existingTags && existingTags.length > 0) {
      // Extract facts from the clinician's reply
      const clinicianTags = await extractTags(finalReply);

      if (clinicianTags.length > 0) {
        // Detect contradictions between clinician reply and existing AI-extracted tags
        const contradictions = detectContradictions(clinicianTags, existingTags);

        // Flag any AI-extracted tags that contradict the clinician's verified reply
        for (const contradiction of contradictions) {
          await supabase
            .from('memory_tags')
            .update({ status: 'flagged' })
            .eq('id', contradiction.existingTag.id);
        }

        // Insert clinician-verified tags as ground truth
        for (const tag of clinicianTags) {
          await supabase
            .from('memory_tags')
            .insert({
              id: uuidv4(),
              user_id: patientId,
              value: tag.value,
              tags: tag.tags,
              status: tag.status,
              authority: 'clinician_verified',
              source_message_id: messageId,
            });
        }
      }

      // Resolve any already-flagged tags from the escalation context
      if (escalation?.context_snapshot) {
        const contextTags = escalation.context_snapshot as MemoryTag[];
        for (const tag of contextTags) {
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
    }

    await logClinicianEdit(
      supabase,
      clinicianId,
      escalationId,
      aiDraft,
      finalReply,
      diffLog
    );

    if (escalation?.created_at) {
      const escalationTime = new Date(escalation.created_at).getTime();
      const responseTime = Date.now() - escalationTime;
      
      await logVerifiedAnswerInjected(
        supabase,
        patientId,
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
        conversation_id: conversationId,
        sender: 'clinician',
        escalation_id: escalationId,
      },
    });

    return NextResponse.json({
      success: true,
      messageId,
      replyId,
    });
  } catch (error) {
    console.error('Reply error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
