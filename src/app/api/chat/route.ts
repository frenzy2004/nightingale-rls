import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateChatResponse, generateTriageSummary } from '@/lib/ai/gemini';
import { logExperiment } from '@/lib/experiment-logger';
import { v4 as uuidv4 } from 'uuid';
import type { Message, MemoryTag } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const { message, conversationId, userId, memoryTags } = await request.json();

    if (!message || !conversationId || !userId) {
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

    const { data: existingMessages } = await supabase
      .from('messages')
      .select('sender, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    const conversationHistory = (existingMessages || []).map(m => ({
      role: m.sender === 'patient' ? 'user' as const : 'model' as const,
      content: m.content,
    }));

    const patientMessageId = uuidv4();
    const patientMessage: Omit<Message, 'id' | 'created_at'> & { id: string } = {
      id: patientMessageId,
      user_id: userId,
      conversation_id: conversationId,
      content: message,
      sender: 'patient',
      authority: 'ai_generated',
      language: null,
    };

    const { error: patientError } = await supabase
      .from('messages')
      .insert(patientMessage);

    if (patientError) {
      console.error('Error inserting patient message:', patientError);
      return NextResponse.json(
        { error: 'Failed to save message' },
        { status: 500 }
      );
    }

    await logExperiment(supabase, {
      event_type: 'message_sent',
      user_id: userId,
      payload: {
        conversation_id: conversationId,
        message_id: patientMessageId,
        sender: 'patient',
      },
    });

    const aiResponse = await generateChatResponse(
      message,
      conversationHistory,
      memoryTags as MemoryTag[]
    );

    const aiMessageId = uuidv4();
    const aiMessage: Omit<Message, 'id' | 'created_at'> & { id: string } = {
      id: aiMessageId,
      user_id: userId,
      conversation_id: conversationId,
      content: aiResponse.content,
      sender: 'ai',
      authority: 'ai_generated',
      language: aiResponse.language,
    };

    const { error: aiError } = await supabase
      .from('messages')
      .insert(aiMessage);

    if (aiError) {
      console.error('Error inserting AI message:', aiError);
      return NextResponse.json(
        { error: 'Failed to save AI response' },
        { status: 500 }
      );
    }

    await logExperiment(supabase, {
      event_type: 'message_sent',
      user_id: userId,
      payload: {
        conversation_id: conversationId,
        message_id: aiMessageId,
        sender: 'ai',
        is_emergency: aiResponse.isEmergency,
      },
    });

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

    let aiSummary = '';
    const updatedMessages = [
      ...conversationHistory.map(h => ({ 
        sender: h.role === 'user' ? 'patient' : 'ai', 
        content: h.content 
      })),
      { sender: 'patient', content: message },
      { sender: 'ai', content: aiResponse.content },
    ];
    
    if (updatedMessages.filter(m => m.sender === 'patient').length >= 2) {
      aiSummary = await generateTriageSummary(updatedMessages, memoryTags);
    }

    const relevantTags = [...newTags, ...(memoryTags || [])]
      .filter((tag: MemoryTag) => tag.status === 'active' || tag.status === 'flagged')
      .slice(0, 10);

    return NextResponse.json({
      patientMessage: { ...patientMessage, created_at: new Date().toISOString() },
      aiMessage: { ...aiMessage, created_at: new Date().toISOString() },
      newTags,
      aiSummary,
      relevantTags,
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
