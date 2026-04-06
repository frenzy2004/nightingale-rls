'use client';

import { format } from 'date-fns';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { User, Clock, Tag, ChevronRight } from 'lucide-react';
import type { Escalation, MemoryTag } from '@/types';
import { cn } from '@/lib/utils';
import { getClinicEscalationLabel } from '@/lib/demo';

interface TriageCardProps {
  escalation: Escalation & {
    patient?: { id: string; full_name: string; email: string };
    urgency_score?: number;
    latest_reply?: { clinician_name?: string; final_reply?: string; sent_at?: string } | null;
  };
  onSelect: () => void;
  onOpenPatient?: () => void;
}

export function TriageCard({ escalation, onSelect, onOpenPatient }: TriageCardProps) {
  const contextTags = escalation.context_snapshot as MemoryTag[];
  const statusColors = {
    pending: 'bg-amber-100 text-amber-800 border-amber-200',
    in_progress: 'bg-blue-100 text-blue-800 border-blue-200',
    resolved: 'bg-green-100 text-green-800 border-green-200',
  };

  return (
    <Card 
      className={cn(
        'cursor-pointer transition-all hover:shadow-md hover:border-primary/50',
        escalation.status === 'pending' && 'border-l-4 border-l-amber-500'
      )}
      onClick={onSelect}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-blue-100 text-blue-600">
                <User className="h-5 w-5" />
              </AvatarFallback>
            </Avatar>
            <div>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenPatient?.();
                }}
                className="font-medium text-left hover:text-primary"
              >
                {escalation.patient?.full_name || 'Patient'}
              </button>
              <p className="text-sm text-muted-foreground">
                {escalation.patient?.email}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {escalation.urgency_score != null && escalation.urgency_score > 0 && (
              <Badge className={cn(
                'text-xs',
                escalation.urgency_score >= 5 ? 'bg-red-100 text-red-800 border-red-200' :
                escalation.urgency_score >= 2 ? 'bg-orange-100 text-orange-800 border-orange-200' :
                'bg-gray-100 text-gray-600 border-gray-200'
              )}>
                {escalation.urgency_score >= 5 ? 'High' : escalation.urgency_score >= 2 ? 'Medium' : 'Low'}
              </Badge>
            )}
            <Badge className={statusColors[escalation.status]}>
              {getClinicEscalationLabel(escalation.status)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-1">Question</p>
          <p className="text-sm line-clamp-2">
            {escalation.patient_edited_question}
          </p>
        </div>

        {escalation.ai_summary && (
          <div className="p-2 bg-muted rounded-lg">
            <p className="text-xs font-medium text-muted-foreground mb-1">AI Summary</p>
            <p className="text-xs line-clamp-2">{escalation.ai_summary}</p>
          </div>
        )}

        {escalation.latest_reply?.final_reply && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2">
            <p className="text-xs font-medium text-emerald-700">Last responded by {escalation.latest_reply.clinician_name}</p>
            <p className="mt-1 text-xs text-emerald-950 line-clamp-2">
              {escalation.latest_reply.final_reply}
            </p>
          </div>
        )}

        {contextTags.length > 0 && (
          <div className="flex items-center gap-2">
            <Tag className="h-3 w-3 text-muted-foreground" />
            <div className="flex gap-1 flex-wrap">
              {contextTags.slice(0, 3).map((tag, i) => (
                <Badge key={i} variant="secondary" className="text-xs py-0">
                  {tag.tags[0]?.replace('#', '')}
                </Badge>
              ))}
              {contextTags.length > 3 && (
                <Badge variant="secondary" className="text-xs py-0">
                  +{contextTags.length - 3}
                </Badge>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {format(new Date(escalation.created_at), 'MMM d, h:mm a')}
          </div>
          <Button variant="ghost" size="sm" className="gap-1">
            Review <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
