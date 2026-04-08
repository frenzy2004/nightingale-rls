'use client';

import { useState, useCallback, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { synthesizeQuickActionPrompt } from '@/lib/demo';
import { v4 as uuidv4 } from 'uuid';
import type {
  AppointmentOption,
  Escalation,
  EscalationPayload,
  MemoryTag,
  Message,
  PatientProfile,
  QuickActionOption,
  RiskAssessment,
} from '@/types';

const ESCALATION_TURN_THRESHOLD = 3;

interface UseChatOptions {
  userId: string;
  conversationId?: string;
  clinicId?: string;
}

function upsertMessage(messages: Message[], message: Message): Message[] {
  if (messages.some((item) => item.id === message.id)) {
    return messages;
  }

  return [...messages, message];
}

function upsertTag(tags: MemoryTag[], tag: MemoryTag): MemoryTag[] {
  const existing = tags.findIndex((item) => item.id === tag.id);
  if (existing === -1) {
    return [tag, ...tags];
  }

  return tags.map((item) => (item.id === tag.id ? tag : item));
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
  const [riskAssessment, setRiskAssessment] = useState<RiskAssessment | null>(null);
  const [careStatus, setCareStatus] = useState<Escalation | null>(null);
  const [patientProfile, setPatientProfile] = useState<PatientProfile | null>(null);

  const supabase = createClient();

  useEffect(() => {
    if (!userId) {
      return;
    }

    const loadExistingData = async () => {
      let activeConversationId = initialConversationId || '';

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

      const [messagesResult, tagsResult, escalationResult, profileResult] = await Promise.all([
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
        supabase
          .from('escalations')
          .select('*')
          .eq('patient_id', userId)
          .eq('conversation_id', activeConversationId)
          .order('created_at', { ascending: false })
          .limit(1),
        supabase
          .from('patient_profiles')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle(),
      ]);

      if (messagesResult.data) {
        setMessages(messagesResult.data as Message[]);
        const patientMessages = messagesResult.data.filter((message: Message) => message.sender === 'patient');
        setTurnCount(patientMessages.length);

        const latestAiMessage = [...messagesResult.data]
          .reverse()
          .find((message: Message) => message.sender === 'ai');
        if (latestAiMessage?.metadata?.riskLevel) {
          setRiskAssessment({
            level: latestAiMessage.metadata.riskLevel,
            matchedSignals: latestAiMessage.metadata.matchedSignals || [],
            summary: latestAiMessage.metadata.riskSummary || '',
            emergency: latestAiMessage.metadata.riskLevel === 'high',
            escalationRecommended: latestAiMessage.metadata.riskLevel === 'high',
          });
        }
      }
      if (tagsResult.data) {
        setMemoryTags(tagsResult.data as MemoryTag[]);
      }
      if (escalationResult.data?.[0]) {
        setCareStatus(escalationResult.data[0] as Escalation);
      }
      if (profileResult.data) {
        setPatientProfile(profileResult.data as PatientProfile);
      }

      setInitialLoading(false);
    };

    loadExistingData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
          setMessages((prev) => upsertMessage(prev, newMessage));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`memory_tags:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'memory_tags',
          filter: `user_id=eq.${userId}`,
        },
        (payload: { new: unknown }) => {
          const tag = payload.new as MemoryTag;
          setMemoryTags((prev) => upsertTag(prev, tag));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!userId || !conversationId) return;

    const channel = supabase
      .channel(`escalations:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'escalations',
          filter: `patient_id=eq.${userId}`,
        },
        (payload: { new: unknown }) => {
          const escalation = payload.new as Escalation;
          if (escalation.conversation_id === conversationId) {
            setCareStatus(escalation);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, userId]);

  const sendChatRequest = useCallback(async (
    content: string,
    options?: {
      displayMessage?: string;
      promptOverride?: string;
      messageMetadata?: Record<string, unknown>;
      audioBase64?: string;
      imageDataUrl?: string;
      transcriptHint?: string;
    }
  ) => {
    setLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          displayMessage: options?.displayMessage,
          promptOverride: options?.promptOverride,
          messageMetadata: options?.messageMetadata,
          audioBase64: options?.audioBase64,
          imageDataUrl: options?.imageDataUrl,
          transcriptHint: options?.transcriptHint,
          conversationId,
          userId,
          memoryTags,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const data = await response.json();

      setMessages((prev) => upsertMessage(upsertMessage(prev, data.patientMessage), data.aiMessage));

      if (data.newTags && data.newTags.length > 0) {
        setMemoryTags((prev) =>
          data.newTags.reduce(
            (nextTags: MemoryTag[], tag: MemoryTag) => upsertTag(nextTags, tag),
            prev
          )
        );
      }

      const newTurnCount = turnCount + 1;
      setTurnCount(newTurnCount);
      setRiskAssessment(data.riskAssessment || null);

      const escalationShouldShow =
        !data.deferEscalationPrompt &&
        (Boolean(data.shouldEscalate) || newTurnCount >= ESCALATION_TURN_THRESHOLD);

      if (escalationShouldShow && !showEscalationPrompt) {
        setShowEscalationPrompt(true);
        setPendingEscalation({
          question: data.escalationQuestionDraft || options?.displayMessage || content,
          aiSummary: data.escalationSummary || data.aiSummary || '',
          contextSnapshot: data.relevantTags || memoryTags.slice(0, 10),
          conversationId,
          riskAssessment: data.riskAssessment || null,
        });
      }
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setLoading(false);
    }
  }, [conversationId, userId, memoryTags, turnCount, showEscalationPrompt]);

  const sendMessage = useCallback(async (content: string) => {
    await sendChatRequest(content);
  }, [sendChatRequest]);

  const sendVoiceMessage = useCallback(
    async (audioBase64: string, transcriptHint = '') => {
      await sendChatRequest(transcriptHint || 'Voice message', {
        displayMessage: transcriptHint || undefined,
        audioBase64,
        transcriptHint,
      });
    },
    [sendChatRequest]
  );

  const sendImageMessage = useCallback(
    async (imageDataUrl: string, prompt = '', fileName?: string) => {
      const trimmedPrompt = prompt.trim();
      const displayMessage = trimmedPrompt
        ? `Shared an image: ${trimmedPrompt}`
        : 'Shared an image with Nightingale.';

      await sendChatRequest(trimmedPrompt || 'Please help me understand this image.', {
        displayMessage,
        imageDataUrl,
        messageMetadata: {
          imageName: fileName,
        },
      });
    },
    [sendChatRequest]
  );

  const sendProviderAction = useCallback(async (action: QuickActionOption, message: Message) => {
    await sendChatRequest(action.label, {
      displayMessage: action.label,
      promptOverride: synthesizeQuickActionPrompt(
        action,
        message.content,
        message.metadata?.provider
      ),
      messageMetadata: {
        quickActionId: action.id,
        sourceMessageId: message.id,
      },
    });
  }, [sendChatRequest]);

  const sendAppointmentSelection = useCallback(async (option: AppointmentOption, message: Message) => {
    await sendChatRequest(`Book ${option.label}`, {
      displayMessage: `Book ${option.label}`,
      promptOverride: `The patient selected the mock appointment slot "${option.label}" after this provider message: "${message.content}". Confirm that the request is noted, explain that the care team will confirm the slot, and keep it to 2 short sentences.`,
      messageMetadata: {
        sourceMessageId: message.id,
      },
    });
  }, [sendChatRequest]);

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

      const data = await response.json();

      setShowEscalationPrompt(false);
      setPendingEscalation(null);
      setTurnCount(0);
      if (data.escalation) {
        setCareStatus(data.escalation as Escalation);
      }
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
    riskAssessment,
    careStatus,
    patientProfile,
    sendMessage,
    sendVoiceMessage,
    sendImageMessage,
    sendProviderAction,
    sendAppointmentSelection,
    escalateToClinic,
    dismissEscalation,
  };
}
