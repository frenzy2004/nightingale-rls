import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  synthesizeSpeech,
  TtsConfigurationError,
  TtsRequestError,
} from '@/lib/ai/tts';

export async function POST(request: NextRequest) {
  try {
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { text, language, voiceId } = await request.json();

    if (typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    const audio = await synthesizeSpeech({ text, language, voiceId });

    return new NextResponse(audio.buffer, {
      status: 200,
      headers: {
        'Cache-Control': 'private, max-age=3600',
        'Content-Type': audio.contentType,
      },
    });
  } catch (error) {
    if (error instanceof TtsRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof TtsConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    console.error('TTS API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
