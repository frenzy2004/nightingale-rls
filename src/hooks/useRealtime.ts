'use client';

import { useEffect, useCallback, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Message, MemoryTag, Escalation } from '@/types';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

interface UseRealtimeMessagesOptions {
  conversationId: string;
  onNewMessage?: (message: Message) => void;
}

export function useRealtimeMessages({ 
  conversationId, 
  onNewMessage 
}: UseRealtimeMessagesOptions) {
  const supabase = createClient();

  useEffect(() => {
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
        (payload: RealtimePostgresChangesPayload<Message>) => {
          if (payload.new && onNewMessage) {
            onNewMessage(payload.new as Message);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, onNewMessage, supabase]);
}

interface UseRealtimeTagsOptions {
  userId: string;
  onTagUpdate?: (tag: MemoryTag) => void;
  onTagInsert?: (tag: MemoryTag) => void;
}

export function useRealtimeTags({ 
  userId, 
  onTagUpdate,
  onTagInsert,
}: UseRealtimeTagsOptions) {
  const supabase = createClient();

  useEffect(() => {
    const channel = supabase
      .channel(`memory_tags:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'memory_tags',
          filter: `user_id=eq.${userId}`,
        },
        (payload: RealtimePostgresChangesPayload<MemoryTag>) => {
          if (payload.new && onTagInsert) {
            onTagInsert(payload.new as MemoryTag);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'memory_tags',
          filter: `user_id=eq.${userId}`,
        },
        (payload: RealtimePostgresChangesPayload<MemoryTag>) => {
          if (payload.new && onTagUpdate) {
            onTagUpdate(payload.new as MemoryTag);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, onTagInsert, onTagUpdate, supabase]);
}

interface UseRealtimeEscalationsOptions {
  clinicId: string;
  onNewEscalation?: (escalation: Escalation) => void;
  onEscalationUpdate?: (escalation: Escalation) => void;
}

export function useRealtimeEscalations({
  clinicId,
  onNewEscalation,
  onEscalationUpdate,
}: UseRealtimeEscalationsOptions) {
  const supabase = createClient();

  useEffect(() => {
    const channel = supabase
      .channel(`escalations:${clinicId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'escalations',
          filter: `clinic_id=eq.${clinicId}`,
        },
        (payload: RealtimePostgresChangesPayload<Escalation>) => {
          if (payload.new && onNewEscalation) {
            onNewEscalation(payload.new as Escalation);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'escalations',
          filter: `clinic_id=eq.${clinicId}`,
        },
        (payload: RealtimePostgresChangesPayload<Escalation>) => {
          if (payload.new && onEscalationUpdate) {
            onEscalationUpdate(payload.new as Escalation);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clinicId, onNewEscalation, onEscalationUpdate, supabase]);
}

export function useClinicianReplyNotification(conversationId: string) {
  const [hasNewReply, setHasNewReply] = useState(false);
  const supabase = createClient();

  const handleNewMessage = useCallback((message: Message) => {
    if (message.sender === 'clinician' && message.authority === 'clinician_verified') {
      setHasNewReply(true);
    }
  }, []);

  useRealtimeMessages({ 
    conversationId, 
    onNewMessage: handleNewMessage 
  });

  const clearNotification = useCallback(() => {
    setHasNewReply(false);
  }, []);

  return { hasNewReply, clearNotification };
}

export function useConflictDetection(userId: string) {
  const [conflicts, setConflicts] = useState<MemoryTag[]>([]);
  
  const handleTagUpdate = useCallback((tag: MemoryTag) => {
    if (tag.status === 'flagged') {
      setConflicts(prev => {
        if (prev.some(t => t.id === tag.id)) {
          return prev.map(t => t.id === tag.id ? tag : t);
        }
        return [...prev, tag];
      });
    } else {
      setConflicts(prev => prev.filter(t => t.id !== tag.id));
    }
  }, []);

  useRealtimeTags({ userId, onTagUpdate: handleTagUpdate });

  const resolveConflict = useCallback((tagId: string) => {
    setConflicts(prev => prev.filter(t => t.id !== tagId));
  }, []);

  return { conflicts, resolveConflict };
}
