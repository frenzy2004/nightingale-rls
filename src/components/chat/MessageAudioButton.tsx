'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, PauseCircle, PlayCircle, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MessageAudioButtonProps {
  text: string;
  language?: string | null;
  shouldAutoPlay?: boolean;
  className?: string;
}

export function MessageAudioButton({
  text,
  language,
  shouldAutoPlay = false,
  className,
}: MessageAudioButtonProps) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const autoPlayTriggeredRef = useRef(false);

  const releaseAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setAudioUrl(null);
    setIsPlaying(false);
  }, []);

  useEffect(() => releaseAudio, [releaseAudio]);

  const fetchAudio = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          language,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || 'Unable to generate audio right now.');
      }

      const blob = await response.blob();
      const nextUrl = URL.createObjectURL(blob);

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }

      objectUrlRef.current = nextUrl;
      setAudioUrl(nextUrl);
      return nextUrl;
    } finally {
      setIsLoading(false);
    }
  }, [language, text]);

  const playAudio = useCallback(async () => {
    try {
      const sourceUrl = audioUrl || (await fetchAudio());
      if (!sourceUrl) {
        return;
      }

      if (!audioRef.current || audioRef.current.src !== sourceUrl) {
        const nextAudio = new Audio(sourceUrl);
        nextAudio.onended = () => setIsPlaying(false);
        nextAudio.onpause = () => setIsPlaying(false);
        nextAudio.onplay = () => setIsPlaying(true);
        audioRef.current = nextAudio;
      }

      await audioRef.current.play();
      setHasPlayed(true);
      setErrorMessage(null);
    } catch (error) {
      console.error('Audio playback failed:', error);
      setErrorMessage('Audio unavailable');
      setIsPlaying(false);
    }
  }, [audioUrl, fetchAudio]);

  useEffect(() => {
    if (!shouldAutoPlay || autoPlayTriggeredRef.current) {
      return;
    }

    autoPlayTriggeredRef.current = true;
    void playAudio();
  }, [playAudio, shouldAutoPlay]);

  const handleClick = async () => {
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      return;
    }

    await playAudio();
  };

  const label = isLoading ? 'Generating audio' : isPlaying ? 'Pause audio' : hasPlayed ? 'Replay audio' : 'Listen';
  const Icon = isLoading ? Loader2 : isPlaying ? PauseCircle : hasPlayed ? PlayCircle : Volume2;

  return (
    <div className={className}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 rounded-full px-3 text-xs text-slate-600 hover:bg-white/80 hover:text-slate-900"
        onClick={handleClick}
        disabled={isLoading}
      >
        <Icon className={`mr-1.5 h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        {label}
      </Button>
      {errorMessage && <p className="mt-1 text-[11px] text-amber-700">{errorMessage}</p>}
    </div>
  );
}
