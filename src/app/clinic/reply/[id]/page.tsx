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

async function requestDraft(question: string, contextSnapshot: unknown) {
  const response = await fetch('/api/reply/draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question,
      contextSnapshot,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to generate draft');
  }

  const data = await response.json();
  return data.draft || '';
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
  const [draftLoading, setDraftLoading] = useState(false);

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
        setDraftLoading(true);

        const [draft, patientResponse] = await Promise.all([
          requestDraft(esc.patient_edited_question, esc.context_snapshot),
          fetch(`/api/patients/${esc.patient_id}`),
        ]);

        if (esc.status === 'pending') {
          await createClient().from('escalations').update({ status: 'in_progress' }).eq('id', id);
        }

        setAiDraft(draft);

        if (patientResponse.ok) {
          const patientData = await patientResponse.json();
          setPatientProfile((patientData.profile || null) as PatientProfile | null);
        }
      } catch (error) {
        console.error('Error fetching escalation:', error);
        router.push('/clinic/triage');
      } finally {
        setDraftLoading(false);
        setLoading(false);
      }
    };

    fetchEscalation();
  }, [id, router, user]);

  const handleRegenerateDraft = async () => {
    if (!escalation) {
      return;
    }

    setDraftLoading(true);
    try {
      const draft = await requestDraft(
        escalation.patient_edited_question,
        escalation.context_snapshot
      );
      setAiDraft(draft);
    } catch (error) {
      console.error('Error regenerating draft:', error);
    } finally {
      setDraftLoading(false);
    }
  };

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
        onRegenerateDraft={handleRegenerateDraft}
        draftLoading={draftLoading}
        onSend={handleSendReply}
        onBack={() => router.push('/clinic/triage')}
        loading={sending}
      />
    </div>
  );
}
