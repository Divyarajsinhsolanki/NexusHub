import { applyMessageChange } from '../cache/mobileCache';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import * as Sentry from '@sentry/react-native';
import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';

import { endpoints } from '../api/endpoints';
import type { Message, Notification } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { sendConversationReceiptOnce } from '../chat/receiptCoordinator';
import {
  appendIncomingMessage,
  applyConversationReceipt,
  mobileQueryKeys,
  prependNotification,
  removeConversationFromCache,
  refreshCachesForDeepLink,
  updateCachedMessage,
  updateConversationCaches,
  updateConversationPreview,
} from '../cache/mobileCache';
import { normalizeMobileDeepLink } from '../navigation/deepLinks';
import { type ChatEvent, useChatRealtime } from './useChatRealtime';
import { useRealtimeChannel } from './RealtimeProvider';

export function MobileRealtimeSync() {
  const { user } = useAuth();
  if (!user) return null;
  return <RealtimeSubscription />;
}

function RealtimeSubscription() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const onEvent = useCallback((event: ChatEvent) => {
    void handleMobileRealtimeEvent(queryClient, event, user?.id).catch((error) => Sentry.captureException(error, { tags: { surface: 'mobile_realtime_sync' } }));
  }, [queryClient, user?.id]);

  const connection = useChatRealtime(undefined, onEvent);
  useRealtimeChannel({ channel: 'PresenceChannel' }, onEvent);

  useEffect(() => {
    if (user?.demo_account) return;
    const publish = () => {
      if (AppState.currentState === 'active') void endpoints.presence().catch(() => undefined);
    };
    publish();
    const timer = setInterval(publish, 30_000);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') publish(); });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [user?.id, user?.demo_account]);

  useEffect(() => {
    if (connection !== 'connected') return;
    // ActionCable does not replay messages missed while the app was offline or
    // backgrounded. Refresh active chats and mark cached threads stale on return.
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: mobileQueryKeys.conversations }),
      queryClient.invalidateQueries({ queryKey: ['conversation'] }),
      queryClient.invalidateQueries({ queryKey: ['messages'] }),
      queryClient.invalidateQueries({ queryKey: mobileQueryKeys.notifications }),
      queryClient.invalidateQueries({ queryKey: mobileQueryKeys.home }),
    ]).catch(() => undefined);
  }, [connection, queryClient]);
  return null;
}

export async function handleMobileRealtimeEvent(queryClient: QueryClient, event: ChatEvent, userId?: number) {
  if (event.type === 'user_profile_updated') {
    const update = (message: Message): Message => !message || typeof message !== 'object' ? message : ({ ...message,
      ...(Number(message.user_id) === Number(event.user_id) ? { user_name: event.user_name, user_profile_picture: typeof event.user_profile_picture === 'string' ? event.user_profile_picture : null } : {}),
      reply_to: message.reply_to && Number(message.reply_to.user_id) === Number(event.user_id) ? { ...message.reply_to, user_name: event.user_name || message.reply_to.user_name } : message.reply_to,
    });
    queryClient.setQueriesData<{ pages: Array<{ data: Message[] }> }>({ queryKey: ['messages'] }, (data) => Array.isArray(data?.pages) ? { ...data, pages: data.pages.map((page) => page && Array.isArray(page.data) ? ({ ...page, data: page.data.map(update) }) : page) } : data);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: mobileQueryKeys.conversations }),
      queryClient.invalidateQueries({ queryKey: ['conversation'] }),
      queryClient.invalidateQueries({ queryKey: ['users'] }),
      queryClient.invalidateQueries({ queryKey: ['messages'] }),
    ]);
    return;
  }
  if (event.type === 'presence' || (event.user_id && typeof event.online === 'boolean' && event.last_seen_at)) {
    const ids = new Set<number>();
    for (const [, conversation] of queryClient.getQueriesData<{ id: number }>({ queryKey: ['conversation'] })) {
      if (conversation?.id) ids.add(conversation.id);
    }
    const list = queryClient.getQueryData<{ pages?: Array<{ data: Array<{ id: number }> }>; data?: Array<{ id: number }> }>(mobileQueryKeys.conversations);
    (list?.pages?.flatMap((page) => page.data) || list?.data || []).forEach((conversation) => ids.add(conversation.id));
    ids.forEach((id) => updateConversationCaches(queryClient, id, (conversation) => ({
      ...conversation,
      participants: Array.isArray(conversation.participants) ? conversation.participants.map((participant) => Number(participant.id) === Number(event.user_id) ? { ...participant, online: Boolean(event.online), last_seen_at: typeof event.last_seen_at === 'string' ? event.last_seen_at : participant.last_seen_at } : participant) : [],
    })));
    return;
  }
  const conversationId = numericId(event.conversation_id) || (isRecord(event.call_session) ? numericId(event.call_session.conversation_id) : undefined);

  if (event.type === 'notification_received') {
    const notification = normalizeRealtimeNotification(event.notification);
    if (notification) prependNotification(queryClient, notification);
    await refreshCachesForDeepLink(queryClient, notification?.deep_link || '/inbox/notifications');
    return;
  }

  if (event.type === 'message_updated' || event.type === 'message_deleted') {
    const message = normalizeRealtimeMessage(event.message);
    if (conversationId && message) {
      applyMessageChange(queryClient, conversationId, message);
      await queryClient.invalidateQueries({ queryKey: mobileQueryKeys.notifications });
    }
    return;
  }

  if (event.type === 'message_created') {
    const message = normalizeRealtimeMessage(event.message);
    if (conversationId && message) {
      appendIncomingMessage(queryClient, conversationId, message);
      updateConversationPreview(queryClient, conversationId, message, userId);
      if (Number(message.user_id) !== Number(userId)) {
        void sendConversationReceiptOnce(userId, conversationId, message.id, 'delivered').catch(() => undefined);
      }
    }
    return;
  }

  if (event.type === 'message_reactions_updated') {
    const messageId = numericId(event.message_id);
    if (conversationId && messageId && isRecord(event.reactions)) {
      updateCachedMessage(queryClient, conversationId, messageId, (message) => {
        if (message.deleted_at) return message;
        const reacted = new Set(message.reacted_emojis || []);
        if (Number(event.last_actor_id) === userId && typeof event.last_actor_emoji === 'string') {
          if (event.last_actor_action === 'removed') reacted.delete(event.last_actor_emoji);
          else if (event.last_actor_action === 'added') reacted.add(event.last_actor_emoji);
        }
        return { ...message, reactions: event.reactions as Record<string, number>, reacted_emojis: [...reacted] };
      });
    }
    return;
  }

  if (event.type === 'conversation_refresh') {
    await refreshConversationCaches(queryClient, conversationId, false);
    return;
  }

  if (event.type === 'message_receipt_updated') {
    if (conversationId) applyConversationReceipt(queryClient, conversationId, {
      user_id: event.user_id,
      delivered_message_id: event.delivered_message_id,
      read_message_id: event.read_message_id,
      delivered_at: event.delivered_at,
      read_at: event.read_at,
    });
    if (Number(event.user_id) === Number(userId) && event.read_message_id) {
      await refreshConversationCaches(queryClient, conversationId, false);
      await queryClient.invalidateQueries({ queryKey: mobileQueryKeys.home });
      await queryClient.invalidateQueries({ queryKey: mobileQueryKeys.notifications });
    }
    return;
  }

  if (event.type === 'conversation_hidden' || event.type === 'conversation_removed' || event.type === 'conversation_deleted') {
    if (conversationId) removeConversationFromCache(queryClient, conversationId);
    return;
  }

  if (event.type?.startsWith('call_')) {
    if (conversationId) {
      const call = isRecord(event.call_session) ? event.call_session as never : null;
      const terminal = event.type === 'call_ended' || (isRecord(event.call_session) && !['active', 'ringing'].includes(String(event.call_session.status)));
      updateConversationCaches(queryClient, conversationId, (conversation) => ({ ...conversation, active_call: terminal ? null : call || conversation.active_call }));
    }
    await queryClient.invalidateQueries({ queryKey: mobileQueryKeys.home });
  }
}

async function refreshConversationCaches(queryClient: QueryClient, conversationId?: number, includeMessages = true) {
  const tasks: Array<Promise<unknown>> = [
    queryClient.invalidateQueries({ queryKey: mobileQueryKeys.conversations }),
  ];

  if (conversationId) {
    tasks.push(queryClient.invalidateQueries({ queryKey: mobileQueryKeys.conversation(conversationId) }));
    if (includeMessages) tasks.push(queryClient.invalidateQueries({ queryKey: mobileQueryKeys.messages(conversationId) }));
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
