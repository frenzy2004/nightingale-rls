'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { ReplyEditor } from '@/components/clinic/ReplyEditor';
import { useUser } from '@/hooks/useUser';
import { createClient } from '@/lib/supabase/client';
import type { DiffEntry, Escalation, PatientProfile } from '@/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ReplyPage({ params }: PageProps) {
  const { id } = use(params);
  const { user, loading: userLoading } = useUser();
  const router = useRouter();
  const [escalation, setEscalation] = useState<Escalation | null>(null);
  const [patientProfile, setPatientProfile] = useState<PatientProfile | null>(null);
  const [aiDraft, setAiDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (userLoading) {
      return;
    }

    if (!user) {
      router.push('/login');
      return;
    }

    if (user.role !== 'clinician' && user.role !== 'admin') {
      router.push('/chat');
    }
  }, [user, userLoading, router]);

  useEffect(() => {
    const fetchEscalation = async () => {
      if (!id || !user?.clinic_id) {
        return;
      }

      try {
        const response = await fetch(`/api/escalate?clinicId=${user.clinic_id}`);
        const data = await response.json();
        const esc = data.escalations?.find((candidate: Escalation) => candidate.id === id);

        if (!esc) {
          router.push('/clinic/triage');
          return;
        }

        setEscalation(esc);

        const [draftResponse, patientResponse] = await Promise.all([
          fetch('/api/reply/draft', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              question: esc.patient_edited_question,
              contextSnapshot: esc.context_snapshot,
            }),
          }),
          fetch(`/api/patients/${esc.patient_id}`),
        ]);

        if (esc.status === 'pending') {
          await createClient()
            .from('escalations')
            .update({ status: 'in_progress' })
            .eq('id', id);
        }

        const draftData = await draftResponse.json();
        setAiDraft(draftData.draft || '');

        if (patientResponse.ok) {
          const patientData = await patientResponse.json();
          setPatientProfile((patientData.profile || null) as PatientProfile | null);
        }
      } catch (error) {
        console.error('Error fetching escalation:', error);
        router.push('/clinic/triage');
      } finally {
        setLoading(false);
      }
    };

    fetchEscalation();
  }, [id, router, user]);

  const handleSendReply = async (reply: string, diffLog: DiffEntry[]) => {
    if (!escalation || !user) {
      return;
    }

    setSending(true);
    try {
      const response = await fetch('/api/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          escalationId: escalation.id,
          aiDraft,
          finalReply: reply,
          diffLog,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send reply');
      }

      router.push('/clinic/triage');
    } catch (error) {
      console.error('Error sending reply:', error);
    } finally {
      setSending(false);
    }
  };

  if (userLoading || loading || !escalation) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-screen">
      <ReplyEditor
        escalation={escalation as Escalation & { patient?: { full_name: string; email: string } }}
        aiDraft={aiDraft}
        patientProfile={patientProfile}
        onSend={handleSendReply}
        onBack={() => router.push('/clinic/triage')}
        loading={sending}
      />
    </div>
  );
}
