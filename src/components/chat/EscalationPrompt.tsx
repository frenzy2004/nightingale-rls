'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Send, X } from 'lucide-react';

interface EscalationPromptProps {
  onAccept: () => void;
  onDismiss: () => void;
}

export function EscalationPrompt({ onAccept, onDismiss }: EscalationPromptProps) {
  return (
    <Card className="mx-4 my-2 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h4 className="font-medium text-amber-800 dark:text-amber-200">
              Would you like to send this to your clinic?
            </h4>
            <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
              The care team can review your exact question and send a verified response back into this same chat.
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
            Send to Clinic
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onDismiss}
            className="border-amber-300 text-amber-700 hover:bg-amber-100"
          >
            Continue chatting
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
