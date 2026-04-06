'use client';

import { useEffect, useRef, useState } from 'react';
import {
  downsampleAudioBuffer,
  float32ToPcm16,
  mergeAudioChunks,
  pcm16ToBase64,
} from '@/lib/audio/pcm';

interface VoiceCaptureResult {
  audioBase64: string;
  transcript: string;
}

interface BrowserSpeechRecognitionResult {
  isFinal: boolean;
  0: {
    transcript: string;
  };
}

interface BrowserSpeechRecognitionEvent {
  resultIndex: number;
  results: ArrayLike<BrowserSpeechRecognitionResult>;
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
}

interface BrowserSpeechRecognitionConstructor {
  new (): BrowserSpeechRecognition;
}

const TARGET_SAMPLE_RATE = 24000;

export function useVoiceRecorder() {
  const [supported, setSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const audioChunksRef = useRef<Float32Array[]>([]);
  const sampleRateRef = useRef(TARGET_SAMPLE_RATE);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const finalTranscriptRef = useRef('');

  useEffect(() => {
    const hasMicrophoneApi =
      typeof window !== 'undefined' &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      Boolean(window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);

    setSupported(hasMicrophoneApi);
  }, []);

  const stopRecognition = () => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // Browser speech recognition throws if stop is called before start settles.
    } finally {
      recognitionRef.current = null;
    }
  };

  const cleanupAudioGraph = async () => {
    processorNodeRef.current?.disconnect();
    sourceNodeRef.current?.disconnect();
    gainNodeRef.current?.disconnect();

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    sourceNodeRef.current = null;
    processorNodeRef.current = null;
    gainNodeRef.current = null;

    if (audioContextRef.current) {
      try {
        await audioContextRef.current.close();
      } catch {
        // Ignore double-close errors.
      } finally {
        audioContextRef.current = null;
      }
    }
  };

  const startRecording = async () => {
    if (!supported || recording || processing) {
      return;
    }

    setError(null);
    setTranscript('');
    finalTranscriptRef.current = '';
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const AudioContextCtor =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

      if (!AudioContextCtor) {
        throw new Error('AudioContext is not available in this browser.');
      }

      const audioContext = new AudioContextCtor();
      const sourceNode = audioContext.createMediaStreamSource(stream);
      const processorNode = audioContext.createScriptProcessor(4096, 1, 1);
      const gainNode = audioContext.createGain();

      gainNode.gain.value = 0;
      sampleRateRef.current = audioContext.sampleRate;

      processorNode.onaudioprocess = (event) => {
        const channelData = event.inputBuffer.getChannelData(0);
        audioChunksRef.current.push(new Float32Array(channelData));
      };

      sourceNode.connect(processorNode);
      processorNode.connect(gainNode);
      gainNode.connect(audioContext.destination);

      audioContextRef.current = audioContext;
      mediaStreamRef.current = stream;
      sourceNodeRef.current = sourceNode;
      processorNodeRef.current = processorNode;
      gainNodeRef.current = gainNode;

      const RecognitionCtor = (
        window as Window & {
          SpeechRecognition?: BrowserSpeechRecognitionConstructor;
          webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
        }
      ).SpeechRecognition ||
        (
          window as Window & {
            webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
          }
        ).webkitSpeechRecognition;

      if (RecognitionCtor) {
        const recognition = new RecognitionCtor();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-MY';

        recognition.onresult = (event) => {
          let finalTranscript = '';
          let interimTranscript = '';

          for (let index = 0; index < event.results.length; index += 1) {
            const result = event.results[index];
            const chunk = result[0]?.transcript ?? '';

            if (result.isFinal) {
              finalTranscript += chunk;
            } else {
              interimTranscript += chunk;
            }
          }

          const mergedTranscript = `${finalTranscript}${interimTranscript}`.trim();
          finalTranscriptRef.current = finalTranscript.trim() || finalTranscriptRef.current;
          setTranscript(mergedTranscript);
        };

        recognition.onerror = (event) => {
          if (event.error !== 'no-speech' && event.error !== 'aborted') {
            setError('Speech recognition had trouble capturing your words, but the voice note can still be sent.');
          }
        };

        recognition.start();
        recognitionRef.current = recognition;
      }

      setRecording(true);
    } catch (captureError) {
      console.error('Voice capture error:', captureError);
      setError('Microphone access was blocked or unavailable.');
      await cleanupAudioGraph();
      stopRecognition();
      setRecording(false);
    }
  };

  const stopRecording = async (): Promise<VoiceCaptureResult | null> => {
    if (!recording) {
      return null;
    }

    setProcessing(true);
    setRecording(false);
    stopRecognition();

    try {
      await cleanupAudioGraph();

      const merged = mergeAudioChunks(audioChunksRef.current);
      audioChunksRef.current = [];

      if (merged.length === 0) {
        setError('No voice audio was captured. Please try again.');
        return null;
      }

      const downsampled = downsampleAudioBuffer(
        merged,
        sampleRateRef.current,
        TARGET_SAMPLE_RATE
      );
      const pcm16 = float32ToPcm16(downsampled);
      const audioBase64 = pcm16ToBase64(pcm16);
      const finalTranscript = finalTranscriptRef.current || transcript;

      return {
        audioBase64,
        transcript: finalTranscript.trim(),
      };
    } catch (captureError) {
      console.error('Voice processing error:', captureError);
      setError('Unable to process the microphone input right now.');
      return null;
    } finally {
      setProcessing(false);
    }
  };

  return {
    supported,
    recording,
    processing,
    transcript,
    error,
    startRecording,
    stopRecording,
  };
}
