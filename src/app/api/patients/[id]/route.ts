import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createServiceClient();
    const { data: viewer } = await supabase
      .from('users')
      .select('role, clinic_id')
      .eq('id', user.id)
      .single();

    if (viewer?.role !== 'clinician' && viewer?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: patient } = await supabase
      .from('users')
      .select('id, full_name, email, clinic_id, created_at')
      .eq('id', id)
      .single();

    if (!patient || patient.clinic_id !== viewer.clinic_id) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    const [{ data: profile }, { data: clinic }, { data: escalations }, { data: messages }] =
      await Promise.all([
        supabase
          .from('patient_profiles')
          .select('*')
          .eq('user_id', id)
          .maybeSingle(),
        supabase
          .from('clinics')
          .select('*')
          .eq('id', patient.clinic_id)
          .single(),
        supabase
          .from('escalations')
          .select(`
            *,
            clinician_replies(id, final_reply, sent_at, clinician_id)
          `)
          .eq('patient_id', id)
          .order('created_at', { ascending: false })
          .limit(8),
        supabase
          .from('messages')
          .select('*')
          .eq('user_id', id)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

    const clinicianIds = Array.from(new Set(
      (escalations || [])
        .flatMap((escalation) =>
          ((escalation.clinician_replies || []) as Array<{ clinician_id: string | null }>)
            .map((reply) => reply.clinician_id)
        )
        .filter(Boolean)
    )) as string[];

    const clinicianMap = new Map<string, string>();
    if (clinicianIds.length > 0) {
      const { data: clinicians } = await supabase
        .from('users')
        .select('id, full_name')
        .in('id', clinicianIds);

      for (const clinician of clinicians || []) {
        clinicianMap.set(clinician.id, clinician.full_name || 'Care team');
      }
    }

    const recentQuestions = (escalations || []).map((escalation) => {
      const replies = [
        ...((escalation.clinician_replies || []) as Array<{
          clinician_id: string;
          final_reply: string;
          sent_at: string;
        }>),
      ].sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime());
      const latestReply = replies[0];

      return {
        id: escalation.id,
        status: escalation.status,
        conversation_id: escalation.conversation_id,
        created_at: escalation.created_at,
        patient_question: escalation.patient_edited_question,
        ai_summary: escalation.ai_summary,
        final_reply: latestReply?.final_reply || null,
        responder_name: latestReply?.clinician_id
          ? clinicianMap.get(latestReply.clinician_id) || 'Care team'
          : null,
        responded_at: latestReply?.sent_at || null,
      };
    });

    return NextResponse.json({
      patient,
      profile,
      clinic,
      recentQuestions,
      messages: messages || [],
    });
  } catch (error) {
    console.error('Patient detail error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
