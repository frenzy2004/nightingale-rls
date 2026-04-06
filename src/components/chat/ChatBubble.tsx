'use client';

import { format } from 'date-fns';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Bird, User, Stethoscope, Shield } from 'lucide-react';
import type { AppointmentOption, Message, QuickActionOption } from '@/types';
import { cn } from '@/lib/utils';
import { ProviderReplyCard } from './ProviderReplyCard';

interface ChatBubbleProps {
  message: Message;
  showTimestamp?: boolean;
  onQuickAction?: (action: QuickActionOption, message: Message) => void;
  onAppointmentSelect?: (option: AppointmentOption, message: Message) => void;
}

export function ChatBubble({
  message,
  showTimestamp = true,
  onQuickAction,
  onAppointmentSelect,
}: ChatBubbleProps) {
  const isPatient = message.sender === 'patient';
  const isAI = message.sender === 'ai';
  const isClinician = message.sender === 'clinician';
  const isVerified = message.authority === 'clinician_verified';
  const isProviderCard = isClinician && message.message_type !== 'chat';

  const getAvatar = () => {
    if (isPatient) {
      return (
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-blue-100 text-blue-600">
            <User className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
      );
    }
    if (isClinician) {
      return (
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-green-100 text-green-600">
            <Stethoscope className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
      );
    }
    return (
      <Avatar className="h-8 w-8">
        <AvatarFallback className="bg-purple-100 text-purple-600">
          <Bird className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
    );
  };

  const getSenderLabel = () => {
    if (isPatient) return 'You';
    if (isClinician) return 'Clinician';
    return 'Nightingale AI';
  };

  return (
    <div
      className={cn(
        'flex gap-3 p-4 rounded-lg',
        isPatient ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      {getAvatar()}
      <div
        className={cn(
          'flex flex-col max-w-[80%]',
          isPatient ? 'items-end' : 'items-start'
        )}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-muted-foreground">
            {getSenderLabel()}
          </span>
          {isVerified && (
            <Badge variant="secondary" className="text-xs py-0 px-1.5 bg-green-100 text-green-700">
              <Shield className="h-3 w-3 mr-1" />
              Verified
            </Badge>
          )}
        </div>
        {isProviderCard ? (
          <ProviderReplyCard
            message={message}
            onQuickAction={onQuickAction}
            onAppointmentSelect={onAppointmentSelect}
          />
        ) : (
          <div
            className={cn(
              'rounded-2xl px-4 py-2.5 text-sm',
              isPatient
                ? 'bg-primary text-primary-foreground rounded-br-md'
                : isClinician
                ? 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-bl-md'
                : 'bg-muted rounded-bl-md'
            )}
          >
            <p className="whitespace-pre-wrap">{message.content}</p>
          </div>
        )}
        {showTimestamp && !isProviderCard && (
          <span className="text-xs text-muted-foreground mt-1">
            {format(new Date(message.created_at), 'h:mm a')}
          </span>
        )}
      </div>
    </div>
  );
}
