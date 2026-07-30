import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import type { Message, Notification } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import {
  appendIncomingMessage,
  mobileQueryKeys,
  prependNotification,
  refreshCachesForDeepLink,
  updateConversationPreview,
} from '../cache/mobileCache';
import { normalizeMobileDeepLink } from '../navigation/deepLinks';
import { type ChatEvent, useChatRealtime } from './useChatRealtime';

export function MobileRealtimeSync() {
  const { user } = useAuth();
  if (!user) return null;
  return <RealtimeSubscription />;
}

function RealtimeSubscription() {
  const queryClient = useQueryClient();
  const onEvent = useCallback((event: ChatEvent) => {
    void handleMobileRealtimeEvent(queryClient, event);
  }, [queryClient]);

  useChatRealtime(undefined, onEvent);
  return null;
}

export async function handleMobileRealtimeEvent(queryClient: QueryClient, event: ChatEvent) {
  const conversationId = numericId(event.conversation_id);

  if (event.type === 'notification_received') {
    const notification = normalizeRealtimeNotification(event.notification);
    if (notification) prependNotification(queryClient, notification);
    await refreshCachesForDeepLink(queryClient, notification?.deep_link || '/inbox/notifications');
    return;
  }

  if (event.type === 'message_created') {
    const message = normalizeRealtimeMessage(event.message);
    if (conversationId && message) {
      appendIncomingMessage(queryClient, conversationId, message);
      updateConversationPreview(queryClient, conversationId, message);
    }
    await refreshConversationCaches(queryClient, conversationId);
    return;
  }

  if (event.type === 'conversation_refresh' || event.type === 'message_reactions_updated') {
    await refreshConversationCaches(queryClient, conversationId);
    return;
  }

  if (event.type === 'conversation_hidden' || event.type === 'conversation_deleted') {
    if (conversationId) {
      queryClient.setQueryData(mobileQueryKeys.conversations, (previous: unknown) => {
        if (!previous || typeof previous !== 'object' || !Array.isArray((previous as { data?: unknown }).data)) return previous;
        return {
          ...(previous as Record<string, unknown>),
          data: (previous as { data: Array<{ id: number }> }).data.filter((conversation) => Number(conversation.id) !== conversationId),
        };
      });
      queryClient.removeQueries({ queryKey: mobileQueryKeys.messages(conversationId) });
      queryClient.removeQueries({ queryKey: mobileQueryKeys.conversation(conversationId) });
    }
    await queryClient.invalidateQueries({ queryKey: mobileQueryKeys.conversations });
    return;
  }

  if (event.type?.startsWith('call_')) {
    await refreshConversationCaches(queryClient, conversationId);
    await queryClient.invalidateQueries({ queryKey: mobileQueryKeys.home });
  }
}

async function refreshConversationCaches(queryClient: QueryClient, conversationId?: number) {
  const tasks: Array<Promise<unknown>> = [
    queryClient.invalidateQueries({ queryKey: mobileQueryKeys.conversations }),
  ];

  if (conversationId) {
    tasks.push(queryClient.invalidateQueries({ queryKey: mobileQueryKeys.conversation(conversationId) }));
    tasks.push(queryClient.invalidateQueries({ queryKey: mobileQueryKeys.messages(conversationId) }));
  }

  await Promise.all(tasks);
}

function normalizeRealtimeMessage(value: unknown): Message | null {
  if (!isRecord(value)) return null;
  const id = numericId(value.id);
  if (!id) return null;
  return value as Message;
}

function normalizeRealtimeNotification(value: unknown): Notification | null {
  if (!isRecord(value)) return null;
  const id = numericId(value.id);
  if (!id) return null;

  const metadata = isRecord(value.metadata) ? value.metadata : {};
  const conversationId = numericId(metadata.conversation_id);
  const actor = isRecord(value.actor) ? value.actor : {};
  const deepLink = normalizeMobileDeepLink(value.deep_link)
    || (conversationId ? `/inbox/chat/${conversationId}` : '/inbox/notifications');

  return {
    id,
    action: stringValue(value.action, 'notification'),
    message: stringValue(value.message, 'New notification'),
    actor: {
      id: numericId(actor.id) || 0,
      name: stringValue(actor.name, 'Nexus Hub'),
      avatar_color: stringValue(actor.avatar_color, '#2563eb'),
      profile_picture: stringOrNull(actor.profile_picture) || stringOrNull(value.actor_avatar),
    },
    read_at: stringOrNull(value.read_at),
    created_at: stringValue(value.created_at, new Date().toISOString()),
    notifiable_type: stringValue(value.notifiable_type, 'Notification'),
    notifiable_id: numericId(value.notifiable_id) || id,
    deep_link: deepLink,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function numericId(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function stringOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}
