'use client';

import { useState, useEffect } from 'react';
import { diffWords } from 'diff';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Send,
  Sparkles,
  User,
  Tag,
  Clock,
  ArrowLeft,
  RefreshCw,
} from 'lucide-react';
import type { Escalation, MemoryTag, DiffEntry } from '@/types';
import { format } from 'date-fns';
import { DEMO_PROVIDER, getClinicEscalationLabel } from '@/lib/demo';

interface ReplyEditorProps {
  escalation: Escalation & { patient?: { full_name: string; email: string } };
  aiDraft: string;
  onSend: (reply: string, diffLog: DiffEntry[]) => void;
  onBack: () => void;
  loading?: boolean;
}

export function ReplyEditor({
  escalation,
  aiDraft,
  onSend,
  onBack,
  loading,
}: ReplyEditorProps) {
  const [reply, setReply] = useState(aiDraft);
  const [showDiff, setShowDiff] = useState(false);
  const contextTags = escalation.context_snapshot as MemoryTag[];

  useEffect(() => {
    setReply(aiDraft);
  }, [aiDraft]);

  const getDiffLog = (): DiffEntry[] => {
    const diff = diffWords(aiDraft, reply);
    return diff.map(part => ({
      type: part.added ? 'added' : part.removed ? 'removed' : 'unchanged',
      value: part.value,
    }));
  };

  const handleSend = () => {
    const diffLog = getDiffLog();
    onSend(reply, diffLog);
  };

  const handleReset = () => {
    setReply(aiDraft);
  };

  const hasEdits = reply !== aiDraft;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-4 p-4 border-b">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h2 className="font-semibold">Reply to Patient</h2>
          <p className="text-sm text-muted-foreground">
            {escalation.patient?.full_name || 'Patient'} · {DEMO_PROVIDER.hospitalName}
          </p>
        </div>
        <Badge variant="secondary">
          {getClinicEscalationLabel(escalation.status)}
        </Badge>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Patient Info */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <User className="h-4 w-4" />
                Patient Question
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm">{escalation.patient_edited_question}</p>
              
              {escalation.original_question !== escalation.patient_edited_question && (
                <div className="p-2 bg-muted rounded text-xs">
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

          {/* AI Summary */}
          {escalation.ai_summary && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  AI Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {escalation.ai_summary}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Context Tags */}
          {contextTags.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Patient Context
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {contextTags.map((tag, i) => (
                    <div
                      key={i}
                      className="flex items-start justify-between p-2 bg-muted/50 rounded"
                    >
                      <div>
                        <p className="text-sm">{tag.value}</p>
                        <div className="flex gap-1 mt-1">
                          {tag.tags.map((t, j) => (
                            <Badge key={j} variant="outline" className="text-xs">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <Badge
                        variant={tag.status === 'active' ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {tag.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Separator />

          {/* Reply Editor */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Your Reply</Label>
              <div className="flex gap-2">
                {hasEdits && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowDiff(!showDiff)}
                  >
                    {showDiff ? 'Hide Changes' : 'Show Changes'}
                  </Button>
                )}
                {hasEdits && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleReset}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Reset
                  </Button>
                )}
              </div>
            </div>

            {showDiff && hasEdits && (
              <div className="p-3 bg-muted rounded-lg text-sm font-mono">
                {getDiffLog().map((part, i) => (
                  <span
                    key={i}
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
                onChange={(e) => setReply(e.target.value)}
                className="min-h-[150px]"
                placeholder="Write your response..."
              />
              <div className="absolute bottom-2 right-2">
                <Badge variant="outline" className="text-xs">
                  <Sparkles className="h-3 w-3 mr-1" />
                  AI Draft
                </Badge>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Edit the AI-generated draft before sending. The verified response will appear back in the patient messenger with your provider details attached.
            </p>
          </div>
        </div>
      </ScrollArea>

      <div className="p-4 border-t">
        <Button
          onClick={handleSend}
          className="w-full"
          disabled={loading || !reply.trim()}
        >
          <Send className="h-4 w-4 mr-2" />
          Send Verified Response
        </Button>
      </div>
    </div>
  );
}
