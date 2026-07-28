import { createConsumer, type Consumer, type Subscription } from '@rails/actioncable';
import { useEffect, useRef, useState } from 'react';

import { endpoints } from '../api/endpoints';

export type ChatEvent = {
  type: string;
  conversation_id?: number;
  message?: Record<string, unknown>;
  message_id?: number;
  call_session?: Record<string, unknown>;
  [key: string]: unknown;
};

type RealtimeState = 'connecting' | 'connected' | 'disconnected';

export function useChatRealtime(conversationId: number | undefined, onEvent: (event: ChatEvent) => void) {
  const [state, setState] = useState<RealtimeState>('connecting');
  const callback = useRef(onEvent);
  callback.current = onEvent;

  useEffect(() => {
    let active = true;
    let consumer: Consumer | undefined;
    let subscription: Subscription | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    const connect = async () => {
      setState('connecting');
      try {
        const credentials = await endpoints.realtimeToken();
        if (!active) return;
        const separator = credentials.url.includes('?') ? '&' : '?';
        const url = credentials.url.includes('token=') ? credentials.url : `${credentials.url}${separator}token=${encodeURIComponent(credentials.token)}`;
        consumer = createConsumer(url);
        subscription = consumer.subscriptions.create(
          { channel: 'ChatChannel', ...(conversationId ? { conversation_id: conversationId } : {}) },
          {
            connected: () => {
              attempts = 0;
              setState('connected');
              if (conversationId) subscription?.perform('mark_as_read', { conversation_id: conversationId });
            },
            disconnected: () => setState('disconnected'),
            rejected: () => setState('disconnected'),
            received: (event: ChatEvent) => callback.current(event),
          },
        );
      } catch {
        if (!active) return;
        setState('disconnected');
        attempts += 1;
        reconnectTimer = setTimeout(connect, Math.min(1_000 * 2 ** attempts, 20_000));
      }
    };

    void connect();
    return () => {
      active = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      subscription?.unsubscribe();
      consumer?.disconnect();
    };
  }, [conversationId]);

  return state;
}
