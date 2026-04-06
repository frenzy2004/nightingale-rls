'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Send, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';

interface ChatInputProps {
  onSend: (message: string) => void | Promise<void>;
  onSendVoice?: (audioBase64: string, transcriptHint?: string) => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSend,
  onSendVoice,
  disabled,
  placeholder = 'Type your message...',
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const {
    supported: voiceSupported,
    recording,
    processing,
    transcript,
    error,
    startRecording,
    stopRecording,
  } = useVoiceRecorder();

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [message]);

  useEffect(() => {
    if (recording) {
      setMessage(transcript);
    }
  }, [recording, transcript]);

  const busy = Boolean(disabled || processing);

  const submitCurrentMessage = async () => {
    if (!message.trim() || busy || recording) {
      return;
    }

    const nextMessage = message.trim();
    setMessage('');
    await onSend(nextMessage);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await submitCurrentMessage();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submitCurrentMessage();
    }
  };

  const handleMicToggle = async () => {
    if (busy || !onSendVoice) {
      return;
    }

    if (!recording) {
      setMessage('');
      await startRecording();
      return;
    }

    const capture = await stopRecording();
    if (!capture?.audioBase64) {
      return;
    }

    setMessage('');
    await onSendVoice(capture.audioBase64, capture.transcript);
  };

  return (
    <div className="border-t bg-background">
      <form onSubmit={handleSubmit} className="flex items-end gap-2 p-4">
        <Textarea
          ref={textareaRef}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={recording ? 'Listening...' : placeholder}
          disabled={busy}
          className="min-h-[44px] max-h-[150px] resize-none"
          rows={1}
        />
        <Button
          type="button"
          size="icon"
          variant={recording ? 'destructive' : 'outline'}
          disabled={busy || !voiceSupported || !onSendVoice}
          onClick={() => {
            void handleMicToggle();
          }}
          aria-label={recording ? 'Stop microphone recording' : 'Start microphone recording'}
        >
          {processing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : recording ? (
            <Square className="h-4 w-4" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </Button>
        <Button type="submit" size="icon" disabled={busy || recording || !message.trim()}>
          {disabled ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
      {(recording || error || !voiceSupported) && (
        <div className="px-4 pb-4 text-xs text-muted-foreground">
          {recording && 'Microphone is live. Tap the square to send your voice note.'}
          {!recording && error && error}
          {!recording && !error && !voiceSupported && 'Microphone input is not available in this browser.'}
        </div>
      )}
    </div>
  );
}
