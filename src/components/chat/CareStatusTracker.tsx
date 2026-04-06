'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { getPatientEscalationLabel } from '@/lib/demo';
import type { Escalation, EscalationStatus } from '@/types';
import { CheckCircle2, Clock3, Send } from 'lucide-react';

interface CareStatusTrackerProps {
  escalation: Pick<Escalation, 'status' | 'updated_at' | 'created_at' | 'patient_edited_question'> | null;
}

const statusIcons: Record<EscalationStatus, typeof Send> = {
  pending: Send,
  in_progress: Clock3,
  resolved: CheckCircle2,
};

export function CareStatusTracker({ escalation }: CareStatusTrackerProps) {
  if (!escalation) {
    return null;
  }

  const StatusIcon = statusIcons[escalation.status];
  const label = getPatientEscalationLabel(escalation.status);

  return (
    <Card className="mx-4 mt-4 border-emerald-200 bg-emerald-50/80">
      <CardContent className="flex items-start justify-between gap-4 p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-emerald-600/10 p-2 text-emerald-700">
            <StatusIcon className="h-4 w-4" />
          </div>
          <div>
            <p className="font-medium text-emerald-950">{label}</p>
            <p className="mt-1 text-sm text-emerald-900">
              {escalation.patient_edited_question}
            </p>
          </div>
        </div>
        <Badge className="bg-white text-emerald-700 shadow-none">
          Care team
        </Badge>
      </CardContent>
    </Card>
  );
}
