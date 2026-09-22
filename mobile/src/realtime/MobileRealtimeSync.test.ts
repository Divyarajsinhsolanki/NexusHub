import { QueryClient, QueryClientProvider, type InfiniteData } from '@tanstack/react-query';
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { render } from '@testing-library/react-native';
import { createElement } from 'react';

import type { ApiEnvelope, CollectionResult, Conversation, Message, Notification } from '../api/types';
import { mobileQueryKeys } from '../cache/mobileCache';
import { handleMobileRealtimeEvent, MobileRealtimeSync } from './MobileRealtimeSync';
import { useChatRealtime } from './useChatRealtime';

jest.mock('./useChatRealtime', () => ({ useChatRealtime: jest.fn() }));
jest.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 1 } }) }));

let clients: QueryClient[] = [];

afterEach(() => {
  clients.forEach((client) => client.clear());
  clients = [];
  jest.clearAllMocks();
});

describe('handleMobileRealtimeEvent', () => {
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
