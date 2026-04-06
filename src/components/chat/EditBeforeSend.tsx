'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Send, Edit2, Tag } from 'lucide-react';
import type { MemoryTag } from '@/types';
import { DEMO_PROVIDER } from '@/lib/demo';

interface EditBeforeSendProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  originalQuestion: string;
  aiSummary: string;
  contextSnapshot: MemoryTag[];
  onSend: (editedQuestion: string) => void;
}

export function EditBeforeSend({
  open,
  onOpenChange,
  originalQuestion,
  aiSummary,
  contextSnapshot,
  onSend,
}: EditBeforeSendProps) {
  const [editedQuestion, setEditedQuestion] = useState(originalQuestion);

  const handleSend = () => {
    onSend(editedQuestion);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit2 className="h-5 w-5" />
            Review Before Sending
          </DialogTitle>
          <DialogDescription>
            Review and edit your question before sending it to your clinic.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="question">Your Question</Label>
              <Textarea
                id="question"
                value={editedQuestion}
                onChange={(e) => setEditedQuestion(e.target.value)}
                className="min-h-[100px]"
                placeholder="Edit your question..."
              />
              <p className="text-xs text-muted-foreground">
                This is the exact question the {DEMO_PROVIDER.hospitalName} care team will receive. You can edit it before anything is sent.
              </p>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>AI Summary</Label>
              <div className="p-3 bg-muted rounded-lg text-sm">
                {aiSummary || 'Patient would like a verified answer from the care team, with the tagged context below attached for review.'}
              </div>
              <p className="text-xs text-muted-foreground">
                This summary helps the clinician understand your concern quickly. Their reply will appear back in this thread.
              </p>
            </div>

            {contextSnapshot.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Tag className="h-4 w-4" />
                    Relevant Health Context
                  </Label>
                  <div className="space-y-2">
                    {contextSnapshot.map((tag) => (
                      <div
                        key={tag.id}
                        className="flex items-start justify-between p-2 bg-muted/50 rounded-lg"
                      >
                        <div className="flex-1">
                          <p className="text-sm font-medium">{tag.value}</p>
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {tag.tags.map((t) => (
                              <Badge key={t} variant="secondary" className="text-xs">
                                {t}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <Badge
                          variant={tag.status === 'active' ? 'default' : 'secondary'}
                          className="text-xs ml-2"
                        >
                          {tag.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This context will be shared with the clinician to help them provide a faster, more informed response.
                  </p>
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={!editedQuestion.trim()}>
            <Send className="h-4 w-4 mr-2" />
            Send to Clinic
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
