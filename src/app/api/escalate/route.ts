import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { generateTriageSummary, generateClinicianDraft } from '@/lib/ai/openai-realtime';
import { getRelevantTagsForEscalation } from '@/lib/ai/tag-extractor';
import { logExperiment, logPatientEdit, logEscalationTriggered } from '@/lib/experiment-logger';
import { getPatientEscalationLabel } from '@/lib/demo';
import { v4 as uuidv4 } from 'uuid';
import type { MemoryTag } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const {
      question,
      patientEditedQuestion,
      aiSummary,
      contextSnapshot,
      conversationId,
      clinicId,
      userId,
    } = await request.json();

    if (!question || !patientEditedQuestion || !conversationId || !userId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user || user.id !== userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const supabase = await createServiceClient();

    const { data: userData } = await supabase
      .from('users')
      .select('clinic_id')
      .eq('id', userId)
      .single();

    const effectiveClinicId = clinicId || userData?.clinic_id;

    if (!effectiveClinicId) {
      return NextResponse.json(
        { error: 'No clinic associated with this patient' },
        { status: 400 }
      );
    }

    const { data: messages } = await supabase
      .from('messages')
      .select('sender, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    const { data: allTags } = await supabase
      .from('memory_tags')
      .select('*')
      .eq('user_id', userId);

    const relevantTags = getRelevantTagsForEscalation(
      allTags || [],
      patientEditedQuestion
    );

    let summary = aiSummary;
    if (!summary && messages) {
      summary = await generateTriageSummary(messages, relevantTags);
    }

    const escalationId = uuidv4();
    const escalation = {
      id: escalationId,
      patient_id: userId,
      clinic_id: effectiveClinicId,
      conversation_id: conversationId,
      original_question: question,
      patient_edited_question: patientEditedQuestion,
      ai_summary: summary || '',
      context_snapshot: relevantTags,
      status: 'pending',
    };

    const { error: escalationError } = await supabase
      .from('escalations')
      .insert(escalation);

    if (escalationError) {
      console.error('Error creating escalation:', escalationError);
      return NextResponse.json(
        { error: 'Failed to create escalation' },
        { status: 500 }
      );
    }

    await logPatientEdit(
      supabase,
      userId,
      escalationId,
      question,
      patientEditedQuestion
    );

    await logEscalationTriggered(
      supabase,
      userId,
      escalationId,
      conversationId,
      messages?.filter(m => m.sender === 'patient').length || 0
    );

    await logExperiment(supabase, {
      event_type: 'escalation_prompt_shown',
      user_id: userId,
      payload: {
        escalation_id: escalationId,
        conversation_id: conversationId,
        context_tags_count: relevantTags.length,
      },
    });

    const aiDraft = await generateClinicianDraft(
      patientEditedQuestion,
      (contextSnapshot as MemoryTag[]) || relevantTags
    );

    return NextResponse.json({
      escalationId,
      aiSummary: summary,
      contextSnapshot: relevantTags,
      aiDraft,
      escalation: {
        ...escalation,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Escalation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinicId');
    const status = searchParams.get('status');
    const conversationId = searchParams.get('conversationId');

    const authClient2 = await createClient();
    const { data: { user: getUser } } = await authClient2.auth.getUser();
    if (!getUser) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const supabaseGet = await createServiceClient();
    const { data: userData } = await supabaseGet
      .from('users')
      .select('role, clinic_id')
      .eq('id', getUser.id)
      .single();

    if (userData?.role === 'patient') {
      let patientQuery = supabaseGet
        .from('escalations')
        .select('*')
        .eq('patient_id', getUser.id)
        .order('created_at', { ascending: false });

      if (conversationId) {
        patientQuery = patientQuery.eq('conversation_id', conversationId);
      }
      if (status) {
        patientQuery = patientQuery.eq('status', status);
      }

      const { data: escalations, error } = await patientQuery;

      if (error) {
        console.error('Error fetching patient escalations:', error);
        return NextResponse.json(
          { error: 'Failed to fetch escalations' },
          { status: 500 }
        );
      }

      const enriched = (escalations || []).map((escalation) => ({
        ...escalation,
        patient_status_label: getPatientEscalationLabel(escalation.status),
      }));

      return NextResponse.json({ escalations: enriched });
    }

    if (userData?.role !== 'clinician' && userData?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    const effectiveClinicId = clinicId || userData.clinic_id;

    let query = supabaseGet
      .from('escalations')
      .select(`
        *,
        patient:users!escalations_patient_id_fkey(id, full_name, email),
        clinician_replies(id, final_reply, sent_at, clinician_id)
      `)
      .eq('clinic_id', effectiveClinicId)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data: escalations, error } = await query;

    if (error) {
      console.error('Error fetching escalations:', error);
      return NextResponse.json(
        { error: 'Failed to fetch escalations' },
        { status: 500 }
      );
    }

    const clinicianIds = Array.from(new Set(
      (escalations || [])
        .flatMap((esc) =>
          ((esc.clinician_replies || []) as Array<{ clinician_id: string | null }>)
            .map((reply) => reply.clinician_id)
        )
        .filter(Boolean)
    )) as string[];

    const clinicianMap = new Map<string, string>();
    if (clinicianIds.length > 0) {
      const { data: clinicians } = await supabaseGet
        .from('users')
        .select('id, full_name')
        .in('id', clinicianIds);

      for (const clinician of clinicians || []) {
        clinicianMap.set(clinician.id, clinician.full_name || 'Care team');
      }
    }

    const scored = (escalations || []).map((esc) => {
      let urgency = 0;
      const snapshot = (esc.context_snapshot as MemoryTag[]) || [];
      urgency += snapshot.filter((t) => t.status === 'flagged').length * 3;
      urgency += snapshot.filter((t) => t.status === 'active').length;
      const ageHours = (Date.now() - new Date(esc.created_at).getTime()) / (1000 * 60 * 60);
      if (esc.status === 'pending') urgency += Math.min(Math.floor(ageHours), 10);

      const latestReply = [
        ...((esc.clinician_replies || []) as Array<{
          clinician_id: string;
          final_reply: string;
          sent_at: string;
        }>),
      ].sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())[0];

      return {
        ...esc,
        urgency_score: urgency,
        latest_reply: latestReply
          ? {
              ...latestReply,
              clinician_name:
                clinicianMap.get(latestReply.clinician_id) || 'Care team',
            }
          : null,
      };
    });

    scored.sort((a, b) => b.urgency_score - a.urgency_score);

    return NextResponse.json({ escalations: scored });
  } catch (error) {
    console.error('Get escalations error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
