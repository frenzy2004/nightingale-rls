'use client';

import { format } from 'date-fns';
import { CalendarDays, CircleAlert, Stethoscope } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { AppointmentOption, Message, QuickActionOption } from '@/types';

interface ProviderReplyCardProps {
  message: Message;
  onQuickAction?: (action: QuickActionOption, message: Message) => void;
  onAppointmentSelect?: (option: AppointmentOption, message: Message) => void;
}

export function ProviderReplyCard({
  message,
  onQuickAction,
  onAppointmentSelect,
}: ProviderReplyCardProps) {
  const metadata = message.metadata || {};
  const provider = metadata.provider;
  const quickActions = metadata.quickActions || [];
  const appointmentOptions = metadata.appointmentOptions || [];
  const title =
    message.message_type === 'consult_summary' ? 'Consult Summary' : 'Provider Response';

  return (
    <Card className="max-w-[85%] overflow-hidden border-orange-200 bg-orange-50/70 shadow-sm">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-700">
              {title}
            </p>
            <div className="mt-1 flex items-center gap-2 text-sm font-medium text-slate-900">
              <Stethoscope className="h-4 w-4 text-orange-700" />
              <span>{provider?.name || 'Care team'}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {provider?.providerName || 'Asia OneHealthCare'} · {provider?.hospitalName || 'SJMC'}
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            {format(new Date(message.created_at), 'h:mm a')}
          </span>
        </div>

        <p className="whitespace-pre-wrap text-sm text-slate-900">{message.content}</p>

        {metadata.disclaimer && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <div className="flex items-start gap-2">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-700" />
              <p>{metadata.disclaimer}</p>
            </div>
          </div>
        )}

        {quickActions.length > 0 && onQuickAction && (
          <div className="flex flex-wrap gap-2">
            {quickActions.map((action) => (
              <Button
                key={action.id}
                variant="outline"
                size="sm"
                onClick={() => onQuickAction(action, message)}
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}

        {appointmentOptions.length > 0 && (
          <div className="rounded-2xl bg-white/80 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-900">
              <CalendarDays className="h-4 w-4 text-orange-700" />
              <span>Book appointment</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {appointmentOptions.map((option) => (
                <Button
                  key={option.id}
                  size="sm"
                  onClick={() => onAppointmentSelect?.(option, message)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
