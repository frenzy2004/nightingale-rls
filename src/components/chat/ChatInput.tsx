'use client';

import { useEffect, useRef, useState } from 'react';
import { Image, Loader2, Mic, Send, Square, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import type { ChatMode } from './ChatModeToggle';

interface ChatInputProps {
  mode: ChatMode;
  onSend: (message: string) => void | Promise<void>;
  onSendVoice?: (audioBase64: string, transcriptHint?: string) => void | Promise<void>;
  onSendImage?: (imageDataUrl: string, prompt?: string, fileName?: string) => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
}

interface ImageAttachment {
  dataUrl: string;
  fileName: string;
}

function getPlaceholder(mode: ChatMode, recording: boolean, fallback: string): string {
  if (recording) {
    return 'Listening...';
  }

  if (mode === 'voice') {
    return 'Tap the mic to speak, or type a short follow-up...';
  }

  if (mode === 'image') {
    return 'Add an optional question about the image...';
  }

  return fallback;
}

export function ChatInput({
  mode,
  onSend,
  onSendVoice,
  onSendImage,
  disabled,
  placeholder = 'Type your message...',
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [imageAttachment, setImageAttachment] = useState<ImageAttachment | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
    if (mode === 'voice' && recording) {
      setMessage(transcript);
    }
  }, [mode, recording, transcript]);

  useEffect(() => {
    if (mode !== 'image') {
      setImageAttachment(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [mode]);

  const busy = Boolean(disabled || processing);

  const submitTextMessage = async () => {
    if (!message.trim() || busy || recording) {
      return;
    }

    const nextMessage = message.trim();
    setMessage('');
    await onSend(nextMessage);
  };

  const submitImageMessage = async () => {
    if (!imageAttachment || busy || !onSendImage) {
      return;
    }

    const nextPrompt = message.trim();
    await onSendImage(imageAttachment.dataUrl, nextPrompt, imageAttachment.fileName);
    setMessage('');
    setImageAttachment(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (mode === 'image') {
      await submitImageMessage();
      return;
    }

    await submitTextMessage();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();

      if (mode === 'image') {
        void submitImageMessage();
        return;
      }

      void submitTextMessage();
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

  const handleImageSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImageAttachment({
          dataUrl: reader.result,
          fileName: file.name,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const clearImageSelection = () => {
    setImageAttachment(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const sendDisabled =
    mode === 'image'
      ? busy || !imageAttachment
      : busy || recording || !message.trim();

  return (
    <div className="border-t bg-background">
      {mode === 'image' && imageAttachment && (
        <div className="px-4 pt-4">
          <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <img
              src={imageAttachment.dataUrl}
              alt={imageAttachment.fileName}
              className="h-20 w-20 rounded-xl object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900">Image ready to send</p>
              <p className="truncate text-xs text-muted-foreground">{imageAttachment.fileName}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Azure Realtime image analysis is still beta on this websocket path, so Nightingale may fall back to your typed question if image parsing fails.
              </p>
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={clearImageSelection}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-end gap-2 p-4">
        {mode === 'image' && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageSelection}
            />
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
              className="gap-2"
            >
              {imageAttachment ? <Image className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
              {imageAttachment ? 'Change' : 'Upload'}
            </Button>
          </>
        )}

        <Textarea
          ref={textareaRef}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={getPlaceholder(mode, recording, placeholder)}
          disabled={busy}
          className="min-h-[44px] max-h-[150px] resize-none"
          rows={1}
        />

        {mode !== 'image' && (
          <Button
            type="button"
            size="icon"
            variant={recording || mode === 'voice' ? 'default' : 'outline'}
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
        )}

        <Button type="submit" size="icon" disabled={sendDisabled}>
          {disabled ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>

      {mode !== 'image' && (recording || error || !voiceSupported) && (
        <div className="px-4 pb-4 text-xs text-muted-foreground">
          {recording && 'Microphone is live. Tap the square to send your voice note.'}
          {!recording && error && error}
          {!recording && !error && !voiceSupported && 'Microphone input is not available in this browser.'}
        </div>
      )}

      {mode === 'image' && !imageAttachment && (
        <div className="px-4 pb-4 text-xs text-muted-foreground">
          Upload a JPG, PNG, or WebP image, then add an optional question for Nightingale.
        </div>
      )}
    </div>
  );
}
