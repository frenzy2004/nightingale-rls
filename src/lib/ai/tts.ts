const DEFAULT_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb';
const DEFAULT_MODEL_ID = 'eleven_multilingual_v2';
const MAX_TTS_CHARACTERS = 1500;

const SUPPORTED_LANGUAGE_CODES = new Set(['en', 'id', 'ms', 'ta', 'zh']);

export class TtsConfigurationError extends Error {}

export class TtsRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'TtsRequestError';
    this.status = status;
  }
}

export interface SynthesizeSpeechOptions {
  text: string;
  language?: string | null;
  voiceId?: string | null;
}

function normalizeLanguageCode(language?: string | null) {
  if (!language) {
    return undefined;
  }

  const normalized = language.toLowerCase().split('-')[0];
  return SUPPORTED_LANGUAGE_CODES.has(normalized) ? normalized : undefined;
}

export function sanitizeTtsText(text: string) {
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_TTS_CHARACTERS);
}

export async function synthesizeSpeech({
  text,
  language,
  voiceId,
}: SynthesizeSpeechOptions) {
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    throw new TtsConfigurationError('Missing ELEVENLABS_API_KEY');
  }

  const sanitizedText = sanitizeTtsText(text);
  if (!sanitizedText) {
    throw new TtsRequestError('Text is required for speech synthesis.', 400);
  }

  const requestVoiceId = voiceId || process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
  const languageCode = normalizeLanguageCode(language);
  const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${requestVoiceId}?output_format=mp3_44100_128`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Accept: 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text: sanitizedText,
      model_id: process.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL_ID,
      ...(languageCode ? { language_code: languageCode } : {}),
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.8,
        style: 0.15,
        speed: 0.95,
      },
    }),
  });

  if (!response.ok) {
    const fallbackMessage = `ElevenLabs request failed with status ${response.status}.`;
    const errorText = await response.text().catch(() => '');
    throw new TtsRequestError(errorText || fallbackMessage, response.status);
  }

  return {
    buffer: await response.arrayBuffer(),
    contentType: response.headers.get('content-type') || 'audio/mpeg',
  };
}
