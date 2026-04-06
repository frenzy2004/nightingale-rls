'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/hooks/useUser';
import { BrandMark } from '@/components/brand/BrandMark';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, ClipboardPlus, Loader2, Send, UserRound } from 'lucide-react';
import { format } from 'date-fns';
import type { Clinic, Message, PatientProfile } from '@/types';
import { DEMO_PROVIDER, getClinicEscalationLabel } from '@/lib/demo';

interface PageProps {
  params: Promise<{ id: string }>;
}

interface PatientQuestion {
  id: string;
  status: 'pending' | 'in_progress' | 'resolved';
  conversation_id: string;
  created_at: string;
  patient_question: string;
  ai_summary: string;
  final_reply: string | null;
  responder_name: string | null;
  responded_at: string | null;
}

interface PatientRecordResponse {
  patient: { id: string; full_name: string; email: string; created_at: string };
  profile: PatientProfile | null;
  clinic: Clinic | null;
  recentQuestions: PatientQuestion[];
  messages: Message[];
}

export default function ClinicPatientPage({ params }: PageProps) {
  const { id } = use(params);
  const { user, loading: userLoading } = useUser();
  const router = useRouter();
  const [record, setRecord] = useState<PatientRecordResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [consultSummary, setConsultSummary] = useState(
    'Today we reviewed your recent symptoms, agreed on the next monitoring steps, and confirmed when to contact the care team urgently.'
  );
  const [sendState, setSendState] = useState<string | null>(null);

  useEffect(() => {
    if (userLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.role !== 'clinician' && user.role !== 'admin') {
      router.push('/chat');
    }
  }, [user, userLoading, router]);

  useEffect(() => {
    const fetchRecord = async () => {
      try {
        const response = await fetch(`/api/patients/${id}`);
        if (!response.ok) {
          throw new Error('Failed to fetch patient record');
        }

        const data = await response.json();
        setRecord(data);
      } catch (error) {
        console.error('Error fetching patient record:', error);
        router.push('/clinic/triage');
      } finally {
        setLoading(false);
      }
    };

    fetchRecord();
  }, [id, router]);

  const handleSendConsultSummary = async () => {
    if (!record) return;

    const conversationId =
      record.recentQuestions[0]?.conversation_id ||
      record.messages[0]?.conversation_id;

    if (!conversationId) return;

    setSending(true);
    setSendState(null);

    try {
      const response = await fetch('/api/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          finalReply: consultSummary,
          patientId: record.patient.id,
          conversationId,
          messageType: 'consult_summary',
          metadata: {
            summaryType: 'consult',
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send consult summary');
      }

      setSendState('Consult summary sent to patient messenger.');
      setRecording(false);
    } catch (error) {
      console.error('Error sending consult summary:', error);
      setSendState('Unable to send consult summary right now.');
    } finally {
      setSending(false);
    }
  };

  if (userLoading || loading || !record) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const stats = Object.entries(record.profile?.history_stats || {});

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f5faf9_0%,#ffffff_100%)]">
      <header className="sticky top-0 z-10 border-b bg-white/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.push('/clinic/triage')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <BrandMark compact />
          </div>
          <div className="hidden md:block text-right">
            <p className="text-sm font-medium text-slate-900">{DEMO_PROVIDER.clinicianName}</p>
            <p className="text-xs text-muted-foreground">{DEMO_PROVIDER.specialty}</p>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <CardHeader className="border-b bg-slate-50">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <UserRound className="h-4 w-4 text-emerald-700" />
                    <CardTitle>{record.patient.full_name}</CardTitle>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {record.profile?.headline || 'Demo patient profile'}
                  </p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>MRN: {record.profile?.mrn || 'SJMC-demo'}</p>
                  <p>{record.profile?.age_label || 'Age not set'}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5 p-4">
              <div className="flex flex-wrap gap-2">
                {(record.profile?.allergies || ['None documented']).map((allergy) => (
                  <Badge key={allergy} className="bg-rose-100 text-rose-700">
                    {allergy}
                  </Badge>
                ))}
              </div>
              <p className="text-sm text-slate-700">
                {record.profile?.summary || 'No additional profile summary available yet.'}
              </p>
              {stats.length > 0 && (
                <div className="grid gap-3 md:grid-cols-2">
                  {stats.map(([label, value]) => (
                    <div key={label} className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                        {label.replace('_', ' ')}
                      </p>
                      <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent patient questions and answers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {record.recentQuestions.map((question) => (
                  <div key={question.id} className="rounded-2xl border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge variant="outline">{getClinicEscalationLabel(question.status)}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(question.created_at), 'MMM d, h:mm a')}
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-medium text-slate-900">
                      {question.patient_question}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {question.ai_summary}
                    </p>
                    {question.final_reply && (
                      <div className="mt-3 rounded-xl bg-emerald-50 p-3">
                        <p className="text-xs font-medium text-emerald-700">
                          {question.responder_name || 'Care team'} · {question.responded_at ? format(new Date(question.responded_at), 'MMM d, h:mm a') : 'Sent'}
                        </p>
                        <p className="mt-1 text-sm text-emerald-950">{question.final_reply}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent chart context</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(record.profile?.recent_history || []).map((item) => (
                  <div key={item} className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {item}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Record consult</CardTitle>
              <Button variant="outline" onClick={() => setRecording((value) => !value)}>
                <ClipboardPlus className="mr-2 h-4 w-4" />
                {recording ? 'Hide composer' : 'Record consult'}
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Draft an editable consult summary and send it into the patient messenger as a verified update.
              </p>
              {recording && (
                <>
                  <Textarea
                    value={consultSummary}
                    onChange={(event) => setConsultSummary(event.target.value)}
                    className="min-h-[180px]"
                  />
                  <Button onClick={handleSendConsultSummary} disabled={sending || !consultSummary.trim()}>
                    {sending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    Send consult summary to patient
                  </Button>
                </>
              )}
              {sendState && (
                <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  {sendState}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Latest thread activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[320px] pr-4">
                <div className="space-y-3">
                  {record.messages.map((message) => (
                    <div key={message.id} className="rounded-2xl border p-3">
                      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span className="capitalize">{message.sender}</span>
                        <span>{format(new Date(message.created_at), 'MMM d, h:mm a')}</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-900">{message.content}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
