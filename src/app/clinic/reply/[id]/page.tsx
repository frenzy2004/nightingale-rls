'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/hooks/useUser';
import { createClient } from '@/lib/supabase/client';
import { ReplyEditor } from '@/components/clinic/ReplyEditor';
import { Loader2 } from 'lucide-react';
import type { Escalation, DiffEntry } from '@/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ReplyPage({ params }: PageProps) {
  const { id } = use(params);
  const { user, loading: userLoading } = useUser();
  const router = useRouter();
  const [escalation, setEscalation] = useState<Escalation | null>(null);
  const [aiDraft, setAiDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    if (!userLoading && !user) {
      router.push('/login');
      return;
    }

    if (user?.role !== 'clinician' && user?.role !== 'admin') {
      router.push('/chat');
      return;
    }
  }, [user, userLoading, router]);

  useEffect(() => {
    const fetchEscalation = async () => {
      if (!id) return;

      try {
        const { data, error } = await supabase
          .from('escalations')
          .select(`
            *,
            patient:users!escalations_patient_id_fkey(id, full_name, email)
          `)
          .eq('id', id)
          .single();

        if (error) throw error;

        setEscalation(data);

        if (data.status === 'pending') {
          await supabase
            .from('escalations')
            .update({ status: 'in_progress' })
            .eq('id', id);
        }

        const draftResponse = await fetch('/api/reply/draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: data.patient_edited_question,
            contextSnapshot: data.context_snapshot,
          }),
        });
        const draftData = await draftResponse.json();
        setAiDraft(draftData.draft || '');
      } catch (error) {
        console.error('Error fetching escalation:', error);
        router.push('/clinic/triage');
      } finally {
        setLoading(false);
      }
    };

    fetchEscalation();
  }, [id, supabase, router]);

  const handleSendReply = async (reply: string, diffLog: DiffEntry[]) => {
    if (!escalation || !user) return;

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

  const handleBack = () => {
    router.push('/clinic/triage');
  };

  if (userLoading || loading || !escalation) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-screen">
      <ReplyEditor
        escalation={escalation as Escalation & { patient?: { full_name: string; email: string } }}
        aiDraft={aiDraft}
        onSend={handleSendReply}
        onBack={handleBack}
        loading={sending}
      />
    </div>
  );
}
