'use client';

import { Image, Mic, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ChatMode = 'text' | 'voice' | 'image';

interface ChatModeToggleProps {
  mode: ChatMode;
  onChange: (mode: ChatMode) => void;
}

const MODE_COPY: Record<ChatMode, string> = {
  text: 'Type a question and get a short reply in the thread.',
  voice: 'Record a short voice note for lower-friction follow-up.',
  image: 'Upload a photo or screenshot with an optional question.',
};

export function ChatModeToggle({ mode, onChange }: ChatModeToggleProps) {
  return (
    <div className="border-b border-slate-200/80 bg-white/80 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-3xl flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={mode === 'text' ? 'default' : 'outline'}
            size="sm"
            className={cn('gap-2', mode === 'text' && 'shadow-sm')}
            onClick={() => onChange('text')}
          >
            <MessageSquare className="h-4 w-4" />
            Text
          </Button>
          <Button
            type="button"
            variant={mode === 'voice' ? 'default' : 'outline'}
            size="sm"
            className={cn('gap-2', mode === 'voice' && 'shadow-sm')}
            onClick={() => onChange('voice')}
          >
            <Mic className="h-4 w-4" />
            Voice
          </Button>
          <Button
            type="button"
            variant={mode === 'image' ? 'default' : 'outline'}
            size="sm"
            className={cn('gap-2', mode === 'image' && 'shadow-sm')}
            onClick={() => onChange('image')}
          >
            <Image className="h-4 w-4" />
            Image
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{MODE_COPY[mode]}</p>
      </div>
    </div>
  );
}
