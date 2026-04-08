'use client';

import { format } from 'date-fns';
import {
  CalendarDays,
  CircleAlert,
  ShieldCheck,
  Stethoscope,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { AppointmentOption, Message, QuickActionOption } from '@/types';
import { MessageAudioButton } from './MessageAudioButton';

interface ProviderReplyCardProps {
  message: Message;
  onQuickAction?: (action: QuickActionOption, message: Message) => void;
  onAppointmentSelect?: (option: AppointmentOption, message: Message) => void;
  shouldAutoPlayAudio?: boolean;
}

export function ProviderReplyCard({
  message,
  onQuickAction,
  onAppointmentSelect,
  shouldAutoPlayAudio = false,
}: ProviderReplyCardProps) {
  const metadata = message.metadata || {};
  const provider = metadata.provider;
  const quickActions = metadata.quickActions || [];
  const appointmentOptions = metadata.appointmentOptions || [];
  const title =
    message.message_type === 'consult_summary'
      ? 'Consult Summary'
      : 'SJMC Cares Response';

  return (
    <Card className="max-w-[85%] overflow-hidden border-orange-200 bg-orange-50/80 shadow-sm">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-700">
              {title}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
              <Stethoscope className="h-4 w-4 text-orange-700" />
              <span>{provider?.name || 'Dr Alan Teh'}</span>
              <Badge className="rounded-full bg-orange-100 px-2.5 text-[11px] text-orange-800 hover:bg-orange-100">
                <ShieldCheck className="mr-1 h-3 w-3" />
                Verified
              </Badge>
            </div>
            <p className="text-xs font-medium text-slate-700">
              {provider?.role || 'Consultant Oncologist'}
            </p>
            <p className="text-xs text-muted-foreground">
              {provider?.providerName || 'Asia OneHealthCare'} ·{' '}
              {provider?.hospitalName || 'SJMC'}
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            {format(new Date(message.created_at), 'h:mm a')}
          </span>
        </div>

        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-900">{message.content}</p>

        <MessageAudioButton
          text={message.content}
          language={message.language}
          shouldAutoPlay={shouldAutoPlayAudio}
        />

        {metadata.disclaimer && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <div className="flex items-start gap-2">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-700" />
              <p>{metadata.disclaimer}</p>
            </div>
          </div>
        )}

        {quickActions.length > 0 && onQuickAction && (
          <div className="rounded-2xl border border-orange-200 bg-white/90 p-3 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
              <Sparkles className="h-4 w-4 text-orange-700" />
              <span>Options</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Tap a button to ask Nightingale to explain or break down this SJMC Cares response.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {quickActions.map((action) => (
                <Button
                  key={action.id}
                  variant="outline"
                  size="sm"
                  className="rounded-full border-orange-200 bg-orange-50 text-orange-900 hover:bg-orange-100"
                  onClick={() => onQuickAction(action, message)}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        {appointmentOptions.length > 0 && (
          <div className="rounded-2xl border border-teal-200 bg-teal-50/80 p-3 shadow-sm">
            <div className="mb-1 flex items-center gap-2 text-sm font-medium text-slate-900">
              <CalendarDays className="h-4 w-4 text-teal-700" />
              <span>Book Appointment</span>
            </div>
            <p className="text-xs leading-5 text-slate-500">
              Pick a suggested slot and Nightingale will confirm that the request has been noted.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {appointmentOptions.map((option) => (
                <Button
                  key={option.id}
                  size="sm"
                  className="rounded-full bg-teal-700 text-white hover:bg-teal-800"
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
