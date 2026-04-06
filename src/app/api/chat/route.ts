import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import {
  generateChatResponse,
  generateImageChatResponse,
  generateTriageSummary,
  generateVoiceChatResponse,
} from '@/lib/ai/openai-realtime';
import { detectContradictions, handleContradictions } from '@/lib/ai/tag-extractor';
import { logExperiment } from '@/lib/experiment-logger';
import type { MemoryTag, Message } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const {
      message,
      conversationId,
      userId,
      memoryTags,
      displayMessage,
      promptOverride,
      messageMetadata,
      audioBase64,
      imageDataUrl,
      transcriptHint,
    } = await request.json();

    if ((!message && !audioBase64 && !imageDataUrl) || !conversationId || !userId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user || user.id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createServiceClient();

    const { data: existingMessages } = await supabase
      .from('messages')
      .select('sender, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    const conversationHistory = (existingMessages || []).map((item) => ({
      role: item.sender === 'patient' ? ('user' as const) : ('model' as const),
      content: item.content,
    }));

    const { data: existingTags } = await supabase
      .from('memory_tags')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['active', 'flagged', 'stopped']);

    const aiResponse = audioBase64
      ? await generateVoiceChatResponse(
          audioBase64,
          conversationHistory,
          (memoryTags as MemoryTag[]) || [],
          transcriptHint || message || ''
        )
      : imageDataUrl
      ? await generateImageChatResponse(
          imageDataUrl,
          promptOverride || message || '',
          conversationHistory,
          (memoryTags as MemoryTag[]) || []
        )
      : await generateChatResponse(
          promptOverride || message,
          conversationHistory,
          (memoryTags as MemoryTag[]) || []
        );

    const patientMessageId = uuidv4();
    const patientVisibleMessage =
      displayMessage ||
      aiResponse.transcript ||
      transcriptHint ||
      message ||
      (imageDataUrl ? 'Shared an image with Nightingale.' : null) ||
      'Voice message sent.';

    const patientMessage: Omit<Message, 'created_at'> = {
      id: patientMessageId,
      user_id: userId,
      conversation_id: conversationId,
      content: patientVisibleMessage,
      sender: 'patient',
      authority: 'ai_generated',
      language: aiResponse.language || null,
      message_type: 'chat',
      metadata: {
        ...(messageMetadata || {}),
        ...(audioBase64 ? { inputMode: 'voice' } : {}),
        ...(imageDataUrl ? { inputMode: 'image' } : {}),
      },
    };

    const { error: patientError } = await supabase.from('messages').insert(patientMessage);

    if (patientError) {
      console.error('Error inserting patient message:', patientError);
      return NextResponse.json({ error: 'Failed to save message' }, { status: 500 });
    }

    await logExperiment(supabase, {
      event_type: 'message_sent',
      user_id: userId,
      payload: {
        conversation_id: conversationId,
        message_id: patientMessageId,
        sender: 'patient',
        quick_action_id: messageMetadata?.quickActionId,
        input_mode: audioBase64 ? 'voice' : imageDataUrl ? 'image' : 'text',
      },
    });

    const aiMessageId = uuidv4();
    const aiMessage: Omit<Message, 'created_at'> = {
      id: aiMessageId,
      user_id: userId,
      conversation_id: conversationId,
      content: aiResponse.content,
      sender: 'ai',
      authority: 'ai_generated',
      language: aiResponse.language,
      message_type: 'chat',
      metadata: {
        riskLevel: aiResponse.riskAssessment.level,
        riskSummary: aiResponse.riskAssessment.summary,
        matchedSignals: aiResponse.riskAssessment.matchedSignals,
      },
    };

    const { error: aiError } = await supabase.from('messages').insert(aiMessage);

    if (aiError) {
      console.error('Error inserting AI message:', aiError);
      return NextResponse.json({ error: 'Failed to save AI response' }, { status: 500 });
    }

    await logExperiment(supabase, {
      event_type: 'message_sent',
      user_id: userId,
      payload: {
        conversation_id: conversationId,
        message_id: aiMessageId,
        sender: 'ai',
        is_emergency: aiResponse.isEmergency,
        risk_level: aiResponse.riskAssessment.level,
      },
    });

    const contradictions = detectContradictions(
      aiResponse.extractedTags,
      (existingTags as MemoryTag[]) || []
    );

    const newTags: MemoryTag[] = [];
    for (const tag of aiResponse.extractedTags) {
      const tagId = uuidv4();
      const memoryTag: Omit<MemoryTag, 'created_at' | 'updated_at'> & { id: string } = {
        id: tagId,
        message_id: patientMessageId,
        user_id: userId,
        value: tag.value,
        tags: tag.tags,
        status: tag.status,
        authority: 'ai_extracted',
        source_message_id: patientMessageId,
      };

      const { error: tagError, data: insertedTag } = await supabase
        .from('memory_tags')
        .insert(memoryTag)
        .select()
        .single();

      if (!tagError && insertedTag) {
        newTags.push(insertedTag);

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
      await handleContradictions(supabase, userId, contradictions, newTags);
    }

    let aiSummary = '';
    const updatedMessages = [
      ...conversationHistory.map((entry) => ({
        sender: entry.role === 'user' ? 'patient' : 'ai',
        content: entry.content,
      })),
      { sender: 'patient', content: patientVisibleMessage },
      { sender: 'ai', content: aiResponse.content },
    ];

    if (updatedMessages.filter((item) => item.sender === 'patient').length >= 2) {
      aiSummary = await generateTriageSummary(updatedMessages, (memoryTags as MemoryTag[]) || []);
    }

    const relevantTags = [...newTags, ...(((memoryTags as MemoryTag[]) || []) as MemoryTag[])]
      .filter((tag) => tag.status === 'active' || tag.status === 'flagged')
      .slice(0, 10);

    return NextResponse.json({
      patientMessage: { ...patientMessage, created_at: new Date().toISOString() },
      aiMessage: { ...aiMessage, created_at: new Date().toISOString() },
      newTags,
      aiSummary,
      relevantTags,
      riskAssessment: aiResponse.riskAssessment,
      shouldEscalate: aiResponse.shouldEscalate,
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
