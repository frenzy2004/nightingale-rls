import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateClinicianDraft } from '@/lib/ai/openai-realtime';
import type { MemoryTag } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const { question, contextSnapshot, preferredLanguage } = await request.json();

    if (!question) {
      return NextResponse.json(
        { error: 'Missing question' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userData?.role !== 'clinician' && userData?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    const draftResult = await generateClinicianDraft(
      question,
      contextSnapshot as MemoryTag[] || [],
      preferredLanguage || null
    );

    return NextResponse.json(draftResult);
  } catch (error) {
    console.error('Draft generation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
