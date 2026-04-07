'use client';

import { useEffect, useState } from 'react';
import { diffWords } from 'diff';
import { format } from 'date-fns';
import {
  ArrowLeft,
  ClipboardList,
  Clock,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  User,
} from 'lucide-react';
import { MemoryTagsPanel } from '@/components/chat/MemoryTagsPanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  DEFAULT_APPOINTMENT_OPTIONS,
  DEMO_PROVIDER,
  getClinicEscalationLabel,
} from '@/lib/demo';
import type { DiffEntry, Escalation, MemoryTag, PatientProfile } from '@/types';

interface ReplyEditorProps {
  escalation: Escalation & { patient?: { full_name: string; email: string } };
  aiDraft: string;
  patientProfile?: PatientProfile | null;
  onRegenerateDraft: () => void;
  draftLoading?: boolean;
  onSend: (
    reply: string,
    diffLog: DiffEntry[],
    options: { includeAppointmentSlots: boolean }
  ) => void;
  onBack: () => void;
  loading?: boolean;
}

export function ReplyEditor({
  escalation,
  aiDraft,
  patientProfile,
  onRegenerateDraft,
  draftLoading,
  onSend,
  onBack,
  loading,
}: ReplyEditorProps) {
  const [reply, setReply] = useState(aiDraft);
  const [showDiff, setShowDiff] = useState(false);
  const [includeAppointmentSlots, setIncludeAppointmentSlots] = useState(false);
  const contextTags = escalation.context_snapshot as MemoryTag[];

  useEffect(() => {
    setReply(aiDraft);
  }, [aiDraft]);

  const getDiffLog = (): DiffEntry[] => {
    const diff = diffWords(aiDraft, reply);
    return diff.map((part) => ({
      type: part.added ? 'added' : part.removed ? 'removed' : 'unchanged',
      value: part.value,
    }));
  };

  const handleSend = () => {
    onSend(reply, getDiffLog(), {
      includeAppointmentSlots,
    });
  };

  const handleReset = () => {
    setReply(aiDraft);
  };

  const hasEdits = reply !== aiDraft;
  const hasContext = contextTags.length > 0 || Boolean(patientProfile);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-4 border-b p-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h2 className="font-semibold">Reply to Patient</h2>
          <p className="text-sm text-muted-foreground">
            {escalation.patient?.full_name || 'Patient'} · {DEMO_PROVIDER.hospitalName}
          </p>
        </div>
        <Badge variant="secondary">{getClinicEscalationLabel(escalation.status)}</Badge>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4" />
                Patient Question
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm">{escalation.patient_edited_question}</p>

              {escalation.original_question !== escalation.patient_edited_question && (
                <div className="rounded bg-muted p-2 text-xs">
                  <span className="text-muted-foreground">Original: </span>
                  {escalation.original_question}
                </div>
              )}

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {format(new Date(escalation.created_at), 'MMMM d, yyyy at h:mm a')}
              </div>
            </CardContent>
          </Card>

          {escalation.ai_summary && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Sparkles className="h-4 w-4" />
                  AI Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{escalation.ai_summary}</p>
              </CardContent>
            </Card>
          )}

          {hasContext && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <ClipboardList className="h-4 w-4" />
                  Patient Context
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs leading-5 text-muted-foreground">
                  Organized into EMR-style chart sections so you can scan the recent memory and
                  profile context more quickly.
                </p>
                <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50/40">
                  <MemoryTagsPanel
                    tags={contextTags}
                    profile={patientProfile}
                    showPanelChrome={false}
                    showEmptySections
                    className="max-h-[36rem]"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Your Reply</Label>
              <div className="flex gap-2">
                {hasEdits && (
                  <Button variant="ghost" size="sm" onClick={() => setShowDiff(!showDiff)}>
                    {showDiff ? 'Hide Changes' : 'Show Changes'}
                  </Button>
                )}
                {hasEdits && (
                  <Button variant="ghost" size="sm" onClick={handleReset}>
                    <RefreshCw className="mr-1 h-3 w-3" />
                    Reset
                  </Button>
                )}
              </div>
            </div>

            {showDiff && hasEdits && (
              <div className="rounded-lg bg-muted p-3 font-mono text-sm">
                {getDiffLog().map((part, index) => (
                  <span
                    key={index}
                    className={
                      part.type === 'added'
                        ? 'bg-green-200 dark:bg-green-900'
                        : part.type === 'removed'
                          ? 'bg-red-200 dark:bg-red-900 line-through'
                          : ''
                    }
                  >
                    {part.value}
                  </span>
                ))}
              </div>
            )}

            <div className="relative">
              <Textarea
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                className="min-h-[170px]"
                placeholder="Write your response..."
              />
              <div className="absolute bottom-2 right-2">
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className="border-slate-200 bg-white/95 text-xs shadow-sm"
                  onClick={onRegenerateDraft}
                  disabled={draftLoading}
                >
                  {draftLoading ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="mr-1 h-3 w-3" />
                  )}
                  {draftLoading ? 'Refreshing...' : 'AI Draft'}
                </Button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Edit the AI-generated draft before sending. The verified response will appear back in
              the patient messenger with your provider details attached.
            </p>

            <div className="rounded-2xl border border-teal-200 bg-teal-50/80 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">Book Appointment</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    Add suggested slots so the patient can tap a time directly from the verified
                    response.
                  </p>
                </div>
                <Button
                  type="button"
                  variant={includeAppointmentSlots ? 'default' : 'outline'}
                  size="sm"
                  className={
                    includeAppointmentSlots
                      ? 'bg-teal-700 text-white hover:bg-teal-800'
                      : 'border-teal-200 bg-white text-teal-800 hover:bg-teal-100'
                  }
                  onClick={() => setIncludeAppointmentSlots((value) => !value)}
                >
                  {includeAppointmentSlots ? 'Included' : 'Add slots'}
                </Button>
              </div>

              {includeAppointmentSlots && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {DEFAULT_APPOINTMENT_OPTIONS.map((option) => (
                    <Badge
                      key={option.id}
                      className="rounded-full bg-teal-700 px-2.5 text-xs text-white hover:bg-teal-700"
                    >
                      {option.label}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </ScrollArea>

      <div className="border-t p-4">
        <Button onClick={handleSend} className="w-full" disabled={loading || !reply.trim()}>
          <Send className="mr-2 h-4 w-4" />
          Send Verified Response
        </Button>
      </div>
    </div>
  );
}
