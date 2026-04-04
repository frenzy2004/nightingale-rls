'use client';

import { useState, useCallback, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { v4 as uuidv4 } from 'uuid';
import type { Message, MemoryTag, EscalationPayload } from '@/types';

const ESCALATION_TURN_THRESHOLD = 3;

interface UseChatOptions {
  userId: string;
  conversationId?: string;
  clinicId?: string;
}

export function useChat({ userId, conversationId: initialConversationId, clinicId }: UseChatOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [memoryTags, setMemoryTags] = useState<MemoryTag[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [conversationId, setConversationId] = useState(initialConversationId || '');
  const [turnCount, setTurnCount] = useState(0);
  const [showEscalationPrompt, setShowEscalationPrompt] = useState(false);
  const [pendingEscalation, setPendingEscalation] = useState<EscalationPayload | null>(null);

  const supabase = createClient();

  // Resolve or create a conversation, then load messages and tags
  useEffect(() => {
    const loadExistingData = async () => {
      let activeConversationId = initialConversationId || '';

      // If no explicit conversationId, find the user's most recent one
      if (!activeConversationId) {
        const { data: recentMessage } = await supabase
          .from('messages')
          .select('conversation_id')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        activeConversationId = recentMessage?.conversation_id || uuidv4();
      }

      setConversationId(activeConversationId);

      const [messagesResult, tagsResult] = await Promise.all([
        supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', activeConversationId)
          .order('created_at', { ascending: true }),
        supabase
          .from('memory_tags')
          .select('*')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false }),
      ]);

      if (messagesResult.data) {
        setMessages(messagesResult.data);
        const patientMessages = messagesResult.data.filter((m: Message) => m.sender === 'patient');
        setTurnCount(patientMessages.length);
      }
      if (tagsResult.data) {
        setMemoryTags(tagsResult.data);
      }
      setInitialLoading(false);
    };

    loadExistingData();
  }, [userId, initialConversationId]);

  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload: { new: unknown }) => {
          const newMessage = payload.new as Message;
          setMessages((prev) => {
            if (prev.some(m => m.id === newMessage.id)) return prev;
            return [...prev, newMessage];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  const sendMessage = useCallback(async (content: string) => {
    setLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          conversationId,
          userId,
          memoryTags,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const data = await response.json();

      setMessages((prev) => [...prev, data.patientMessage, data.aiMessage]);
      
      if (data.newTags && data.newTags.length > 0) {
        setMemoryTags((prev) => [...data.newTags, ...prev]);
      }

      const newTurnCount = turnCount + 1;
      setTurnCount(newTurnCount);

      if (newTurnCount >= ESCALATION_TURN_THRESHOLD && !showEscalationPrompt) {
        setShowEscalationPrompt(true);
        setPendingEscalation({
          question: content,
          aiSummary: data.aiSummary || '',
          contextSnapshot: data.relevantTags || memoryTags.slice(0, 10),
          conversationId,
        });
      }
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setLoading(false);
    }
  }, [conversationId, userId, memoryTags, turnCount, showEscalationPrompt]);

  const escalateToClinic = useCallback(async (editedQuestion: string) => {
    if (!pendingEscalation || !clinicId) return;

    try {
      const response = await fetch('/api/escalate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...pendingEscalation,
          patientEditedQuestion: editedQuestion,
          clinicId,
          userId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to escalate');
      }

      setShowEscalationPrompt(false);
      setPendingEscalation(null);
      setTurnCount(0);
    } catch (error) {
      console.error('Error escalating:', error);
    }
  }, [pendingEscalation, clinicId, userId]);

  const dismissEscalation = useCallback(() => {
    setShowEscalationPrompt(false);
    setPendingEscalation(null);
  }, []);

  return {
    messages,
    memoryTags,
    loading,
    initialLoading,
    conversationId,
    turnCount,
    showEscalationPrompt,
    pendingEscalation,
    sendMessage,
    escalateToClinic,
    dismissEscalation,
  };
}
