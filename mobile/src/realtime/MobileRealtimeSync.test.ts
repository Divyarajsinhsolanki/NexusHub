import { QueryClient, QueryClientProvider, type InfiniteData } from '@tanstack/react-query';
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { render } from '@testing-library/react-native';
import { createElement } from 'react';

import type { ApiEnvelope, CollectionResult, Conversation, Message, Notification } from '../api/types';
import { mobileQueryKeys } from '../cache/mobileCache';
import { handleMobileRealtimeEvent, MobileRealtimeSync } from './MobileRealtimeSync';
import { useChatRealtime } from './useChatRealtime';

jest.mock('./useChatRealtime', () => ({ useChatRealtime: jest.fn() }));
jest.mock('@sentry/react-native', () => ({ captureException: jest.fn() }));
jest.mock('./RealtimeProvider', () => ({ useRealtimeChannel: jest.fn() }));
jest.mock('../api/endpoints', () => ({ endpoints: { presence: jest.fn(async () => ({})), updateConversationReceipt: jest.fn(async () => ({})) } }));
jest.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 1 } }) }));

let clients: QueryClient[] = [];

afterEach(() => {
  clients.forEach((client) => client.clear());
  clients = [];
  jest.clearAllMocks();
});

describe('handleMobileRealtimeEvent', () => {
  test('read notifications on another device refresh notification and home caches', async () => {
    const client = testQueryClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    await handleMobileRealtimeEvent(client, { type: 'notifications_read', unread_count: 0 }, 1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: mobileQueryKeys.notifications });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: mobileQueryKeys.home });
  });
  test('profile changes update cached authors and quoted reply names', async () => {
    const client = testQueryClient();
    client.setQueryData(mobileQueryKeys.messages(7), { pageParams: [undefined], pages: [{ data: [{ ...message(20, 'Reply'), user_id: 2, user_name: 'Old name', reply_to: { id: 19, user_id: 2, user_name: 'Old name', body: 'Original' } }] }] });
    await handleMobileRealtimeEvent(client, { type: 'user_profile_updated', user_id: 2, user_name: 'New name', user_profile_picture: '/new.png' }, 1);
    const row = client.getQueryData<InfiniteData<CollectionResult<Message>>>(mobileQueryKeys.messages(7))!.pages[0].data[0];
    expect(row.user_name).toBe('New name');
    expect(row.user_profile_picture).toBe('/new.png');
    expect(row.reply_to?.user_name).toBe('New name');
  });
  test('edits and deletions update quotes without changing unread counts or resurrecting content', async () => {
    const client = testQueryClient();
    const original = { ...message(20, 'Original'), updated_at: '2026-10-07T10:00:00Z' };
    client.setQueryData(mobileQueryKeys.messages(7), { pageParams: [undefined], pages: [{ data: [original,
      { ...message(21, 'Reply'), reply_to: { id: 20, body: 'Original', user_id: 2, user_name: 'Sam' } }] }] });
    client.setQueryData(mobileQueryKeys.conversations, { data: [{ id: 7, last_message_id: 20, last_message: original, unread_count: 4 }] });
    const changed = { ...original, body: 'Edited', edited_at: '2026-10-07T10:01:00Z', updated_at: '2026-10-07T10:01:00Z' };
    await handleMobileRealtimeEvent(client, { type: 'message_updated', conversation_id: 7, message: changed }, 1);
    const deleted = { ...changed, body: 'Message deleted', deleted_at: '2026-10-07T10:02:00Z', updated_at: '2026-10-07T10:02:00Z' };
    await handleMobileRealtimeEvent(client, { type: 'message_deleted', conversation_id: 7, message: deleted }, 1);
    await handleMobileRealtimeEvent(client, { type: 'message_updated', conversation_id: 7, message: changed }, 1);
    const rows = client.getQueryData<InfiniteData<CollectionResult<Message>>>(mobileQueryKeys.messages(7))!.pages[0].data;
    expect(rows[0].body).toBe('Message deleted');
    expect(rows[1].reply_to?.body).toBe('Message deleted');
    expect(client.getQueryData<CollectionResult<Conversation>>(mobileQueryKeys.conversations)?.data[0].unread_count).toBe(4);
    expect(client.getQueryData<CollectionResult<Conversation>>(mobileQueryKeys.conversations)?.data[0].last_message).toMatchObject({ body: 'Message deleted' });
  });
  test('counts incoming messages once and preserves a newer preview', async () => {
    const client = testQueryClient();
    client.setQueryData(mobileQueryKeys.conversations, { data: [{ id: 7, unread_count: 0, participants: [] }] });
    const event = { type: 'message_created', conversation_id: 7, message: { ...message(20, 'Latest'), user_id: 2 } };
    await handleMobileRealtimeEvent(client, event, 1);
    await handleMobileRealtimeEvent(client, event, 1);
    await handleMobileRealtimeEvent(client, { ...event, message: { ...event.message, id: 19, body: 'Older' } }, 1);
    expect(client.getQueryData<CollectionResult<Conversation>>(mobileQueryKeys.conversations)?.data[0]).toMatchObject({ unread_count: 1, last_message: { id: 20 } });
  });
  test('refreshes inbox counts when the current user reads on another device', async () => {
    const client = testQueryClient();
    client.setQueryData(mobileQueryKeys.conversations, { data: [{ id: 7, unread_count: 2 }] });
    client.setQueryData(mobileQueryKeys.conversation(7), { id: 7, participants: [{ id: 1 }] });
    await handleMobileRealtimeEvent(client, { type: 'message_receipt_updated', conversation_id: 7, user_id: 1, read_message_id: 20 }, 1);
    expect(client.getQueryState(mobileQueryKeys.conversations)?.isInvalidated).toBe(true);
  });

  test('updates online presence in the inbox and open conversation', async () => {
    const client = testQueryClient();
    const conversation = { id: 7, participants: [{ id: 2, online: false }] };
    client.setQueryData(mobileQueryKeys.conversations, { pageParams: [1], pages: [{ data: [conversation] }] });
    client.setQueryData(mobileQueryKeys.conversation(7), conversation);
    await handleMobileRealtimeEvent(client, { type: 'presence', user_id: 2, online: true, last_seen_at: new Date().toISOString() }, 1);
    expect(client.getQueryData<Conversation>(mobileQueryKeys.conversation(7))?.participants?.[0].online).toBe(true);
    expect(client.getQueryData<InfiniteData<CollectionResult<Conversation>>>(mobileQueryKeys.conversations)?.pages[0].data[0].participants?.[0].online).toBe(true);
  });
  test('syncs the current user reaction added or removed on the web', async () => {
    const queryClient = testQueryClient();
    queryClient.setQueryData(mobileQueryKeys.messages(7), { pageParams: [undefined], pages: [{ data: [message(2, 'Hello')] }] });
    const event = { type: 'message_reactions_updated', conversation_id: 7, message_id: 2, last_actor_id: 1, last_actor_emoji: 'thumbs-up', last_actor_action: 'added', reactions: { 'thumbs-up': 1 } };
    await handleMobileRealtimeEvent(queryClient, event, 1);
    const rows = () => queryClient.getQueryData<InfiniteData<CollectionResult<Message>>>(mobileQueryKeys.messages(7))!.pages[0].data;
    expect(rows()[0].reacted_emojis).toEqual(['thumbs-up']);
    await handleMobileRealtimeEvent(queryClient, { ...event, last_actor_action: 'removed', reactions: {} }, 1);
    expect(rows()[0].reacted_emojis).toEqual([]);
  });

  test('handles user-stream call events without a top-level conversation id', async () => {
    const queryClient = testQueryClient();
    queryClient.setQueryData(mobileQueryKeys.conversation(7), { id: 7, active_call: null });
    const call = { id: 11, conversation_id: 7, status: 'ringing' };
    await handleMobileRealtimeEvent(queryClient, { type: 'call_ringing', call_session: call }, 1);
    expect(queryClient.getQueryData<Conversation>(mobileQueryKeys.conversation(7))?.active_call?.id).toBe(11);
    await handleMobileRealtimeEvent(queryClient, { type: 'call_missed', call_session: { ...call, status: 'active' } }, 1);
    expect(queryClient.getQueryData<Conversation>(mobileQueryKeys.conversation(7))?.active_call?.status).toBe('active');
    await handleMobileRealtimeEvent(queryClient, { type: 'call_ended', call_session: { ...call, status: 'ended' } }, 1);
    expect(queryClient.getQueryData<Conversation>(mobileQueryKeys.conversation(7))?.active_call).toBeNull();
  });

  test('refreshes chats on reconnect so messages sent while backgrounded are recovered', async () => {
    const queryClient = testQueryClient();
    const keys = [mobileQueryKeys.conversations, mobileQueryKeys.conversation(7), mobileQueryKeys.messages(7)];
    const seedFreshCaches = () => {
      queryClient.setQueryData(keys[0], { data: [] });
      queryClient.setQueryData(keys[1], { id: 7 });
      queryClient.setQueryData(keys[2], { pageParams: [undefined], pages: [{ data: [] }] });
    };
    seedFreshCaches();
    jest.mocked(useChatRealtime).mockReturnValue('connecting');
    const tree = () => createElement(QueryClientProvider, { client: queryClient }, createElement(MobileRealtimeSync));
    const screen = await render(tree());
    expect(queryClient.getQueryState(keys[2])?.isInvalidated).toBe(false);

    jest.mocked(useChatRealtime).mockReturnValue('connected');
    await screen.rerender(tree());
    keys.forEach((key) => expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true));

    jest.mocked(useChatRealtime).mockReturnValue('disconnected');
    await screen.rerender(tree());
    seedFreshCaches();
    jest.mocked(useChatRealtime).mockReturnValue('connected');
    await screen.rerender(tree());
    keys.forEach((key) => expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true));
    await screen.unmount();
  });

  test('prepends realtime notifications and refreshes notification counters', async () => {
    const queryClient = testQueryClient();
    queryClient.setQueryData<InfiniteData<ApiEnvelope<Notification[]>>>(mobileQueryKeys.notifications, {
      pageParams: [1],
      pages: [{ data: [], meta: { unread_count: 0 } }],
    });
    queryClient.setQueryData(mobileQueryKeys.home, { summary: { unread_notifications: 0 }, tasks: [] });

    await handleMobileRealtimeEvent(queryClient, {
      type: 'notification_received',
      notification: {
        id: 9,
        action: 'chat_message',
        actor_avatar: '/rails/avatar.png',
        created_at: '2026-07-30T10:00:00Z',
        message: 'Alex sent a message',
        metadata: { conversation_id: 4 },
        notifiable_id: 99,
        notifiable_type: 'Message',
      },
    });

    const notifications = queryClient.getQueryData<InfiniteData<ApiEnvelope<Notification[]>>>(mobileQueryKeys.notifications);
    expect(notifications?.pages[0].data[0]).toMatchObject({
      id: 9,
      deep_link: '/inbox/chat/4',
      actor: { profile_picture: '/rails/avatar.png' },
    });
    expect(notifications?.pages[0].meta?.unread_count).toBe(1);
    expect(queryClient.getQueryState(mobileQueryKeys.home)?.isInvalidated).toBe(true);
  });

  test('dedupes message-created events and updates conversation previews', async () => {
    const queryClient = testQueryClient();
    const incoming = message(2, 'New message');
    queryClient.setQueryData<InfiniteData<CollectionResult<Message>>>(mobileQueryKeys.messages(7), {
      pageParams: [undefined],
      pages: [{ data: [message(1, 'Old message')] }],
    });
    queryClient.setQueryData<CollectionResult<Conversation>>(mobileQueryKeys.conversations, {
      data: [
        { id: 5, title: 'Other chat', last_message: null },
        { id: 7, title: 'Active chat', last_message: null },
      ],
    });

    await handleMobileRealtimeEvent(queryClient, { type: 'message_created', conversation_id: 7, message: incoming });
    await handleMobileRealtimeEvent(queryClient, { type: 'message_created', conversation_id: 7, message: incoming });

    const messages = queryClient.getQueryData<InfiniteData<CollectionResult<Message>>>(mobileQueryKeys.messages(7));
    const conversations = queryClient.getQueryData<CollectionResult<Conversation>>(mobileQueryKeys.conversations);

    expect(messages?.pages[0].data.map((item) => item.id)).toEqual([1, 2]);
    expect(conversations?.data[0]).toMatchObject({ id: 7, last_message: { id: 2 } });
    expect(queryClient.getQueryState(mobileQueryKeys.conversations)?.isInvalidated).toBe(false);
  });

  test('refreshes conversation caches for lightweight conversation events', async () => {
    const queryClient = testQueryClient();
    queryClient.setQueryData(mobileQueryKeys.conversations, { data: [] });
    queryClient.setQueryData(mobileQueryKeys.conversation(3), { id: 3 });
    queryClient.setQueryData(mobileQueryKeys.messages(3), { pageParams: [], pages: [] });

    await handleMobileRealtimeEvent(queryClient, { type: 'conversation_refresh', conversation_id: 3 });

    expect(queryClient.getQueryState(mobileQueryKeys.conversations)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(mobileQueryKeys.conversation(3))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(mobileQueryKeys.messages(3))?.isInvalidated).toBe(false);
  });
});

function message(id: number, body: string): Message {
  return { id, body, created_at: '2026-07-30T10:00:00Z', user_id: 1, user_name: 'Alex' };
}

function testQueryClient() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
  clients.push(queryClient);
  return queryClient;
}
