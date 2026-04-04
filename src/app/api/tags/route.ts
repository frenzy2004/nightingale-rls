import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractTags } from '@/lib/ai/gemini';
import { detectContradictions, handleContradictions } from '@/lib/ai/tag-extractor';
import { logExperiment } from '@/lib/experiment-logger';
import { v4 as uuidv4 } from 'uuid';
import type { MemoryTag } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const { message, messageId, userId } = await request.json();

    if (!message || !messageId || !userId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.id !== userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const extractedTags = await extractTags(message);

    if (extractedTags.length === 0) {
      return NextResponse.json({ tags: [], contradictions: [] });
    }

    const { data: existingTags } = await supabase
      .from('memory_tags')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['active', 'flagged']);

    const contradictions = detectContradictions(
      extractedTags,
      existingTags || []
    );

    const newTags: MemoryTag[] = [];
    for (const tag of extractedTags) {
      const tagId = uuidv4();
      const memoryTag = {
        id: tagId,
        message_id: messageId,
        user_id: userId,
        value: tag.value,
        tags: tag.tags,
        status: tag.status,
        authority: 'ai_extracted',
        source_message_id: messageId,
      };

      const { error, data } = await supabase
        .from('memory_tags')
        .insert(memoryTag)
        .select()
        .single();

      if (!error && data) {
        newTags.push(data);

        await logExperiment(supabase, {
          event_type: 'tag_extracted',
          user_id: userId,
          payload: {
            tag_id: tagId,
            value: tag.value,
            tags: tag.tags,
            confidence: tag.confidence,
          },
        });
      }
    }

    if (contradictions.length > 0) {
      await handleContradictions(
        supabase,
        userId,
        contradictions,
        newTags
      );
    }

    return NextResponse.json({
      tags: newTags,
      contradictions: contradictions.map(c => ({
        existingValue: c.existingTag.value,
        newValue: c.newTag.value,
        resolution: c.resolution,
      })),
    });
  } catch (error) {
    console.error('Tag extraction error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.id !== userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { data: tags, error } = await supabase
      .from('memory_tags')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch tags' },
        { status: 500 }
      );
    }

    return NextResponse.json({ tags });
  } catch (error) {
    console.error('Get tags error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
