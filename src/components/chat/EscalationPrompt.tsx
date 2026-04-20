'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Send, X } from 'lucide-react';
import type { RiskAssessment } from '@/types';

interface EscalationPromptProps {
  onAccept: () => void;
  onDismiss: () => void;
  riskAssessment?: RiskAssessment | null;
}

export function EscalationPrompt({
  onAccept,
  onDismiss,
  riskAssessment,
}: EscalationPromptProps) {
  const isEmergency = Boolean(riskAssessment?.emergency);

  return (
    <Card className="mx-4 my-2 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h4 className="font-medium text-amber-800 dark:text-amber-200">
              {isEmergency ? 'Urgent symptoms need emergency care first' : 'This needs a care-team answer'}
            </h4>
            <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
              {isEmergency
                ? 'Please dial emergency services now or go to the nearest emergency department. If you still want a verified response in this thread, we can also route the update to your care team.'
                : 'Time-sensitive clinical or procedural questions are routed to your care team for a verified reply in this same thread.'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              className="text-amber-700 hover:text-amber-900 hover:bg-amber-100"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <Button
            onClick={onAccept}
            size="sm"
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            <Send className="h-4 w-4 mr-2" />
            {isEmergency ? 'Send update to care team' : 'Send to care team'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onDismiss}
            className="border-amber-300 text-amber-700 hover:bg-amber-100"
          >
            Continue Chatting
          </Button>
        </div>
        <p className="mt-2 text-xs text-amber-700/90 dark:text-amber-300">
          Choose &quot;Continue Chatting&quot; if you prefer to keep talking here for now.
        </p>
      </CardContent>
    </Card>
  );
}
