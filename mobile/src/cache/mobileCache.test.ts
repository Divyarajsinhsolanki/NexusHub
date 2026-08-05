import { QueryClient, type InfiniteData } from '@tanstack/react-query';
import { afterEach, describe, expect, test } from '@jest/globals';

import type { CollectionResult, Message, Post } from '../api/types';
import {
  appendIncomingMessage,
  applyConversationReceipt,
  applyPostToFeed,
  createMobileQueryClient,
  MOBILE_CACHE_MAX_AGE,
  MOBILE_CACHE_PAGE_LIMIT,
  mobileQueryKeys,
  shouldPersistMobileQuery,
  trimInfinitePages,
  updatePostInFeed,
} from './mobileCache';

let clients: QueryClient[] = [];

afterEach(() => {
  clients.forEach((client) => client.clear());
  clients = [];
});

describe('mobile cache policy', () => {
  test('persists only selected successful read queries for seven days', () => {
    expect(MOBILE_CACHE_MAX_AGE).toBe(7 * 24 * 60 * 60 * 1000);
    expect(shouldPersistMobileQuery(query(['posts'], 'success', { data: [] }))).toBe(true);
    expect(shouldPersistMobileQuery(query(['messages', 12], 'success', { pages: [] }))).toBe(true);
    expect(shouldPersistMobileQuery(query(['admin-tables'], 'success', { data: [] }))).toBe(false);
    expect(shouldPersistMobileQuery(query(['pdf-viewer-token'], 'success', { token: 'secret' }))).toBe(false);
    expect(shouldPersistMobileQuery(query(['posts'], 'pending', undefined))).toBe(false);
  });

  test('creates query defaults for persisted keys', () => {
    const queryClient = trackClient(createMobileQueryClient());

    expect(queryClient.getQueryDefaults(mobileQueryKeys.messages(1)).gcTime).toBe(MOBILE_CACHE_MAX_AGE);
    expect(queryClient.getQueryDefaults(mobileQueryKeys.projects).gcTime).toBe(MOBILE_CACHE_MAX_AGE);
  });
});

describe('mobile cache data helpers', () => {
  test('appends incoming messages once', () => {
    const queryClient = testQueryClient();
    const existing = message(1, 'Hello');
    const incoming = message(2, 'Live reply');

    queryClient.setQueryData<InfiniteData<CollectionResult<Message>>>(mobileQueryKeys.messages(5), {
      pageParams: [undefined],
      pages: [{ data: [existing] }],
    });

    appendIncomingMessage(queryClient, 5, incoming);
    appendIncomingMessage(queryClient, 5, incoming);

    const cached = queryClient.getQueryData<InfiniteData<CollectionResult<Message>>>(mobileQueryKeys.messages(5));
    expect(cached?.pages[0].data.map((item) => item.id)).toEqual([1, 2]);
  });

  test('keeps all active history pages and trims only when a chat becomes inactive', () => {
    const queryClient = testQueryClient();
    const pages = Array.from({ length: 5 }, (_, index) => ({ data: [message(index + 1, `Page ${index + 1}`)] }));
    const history: InfiniteData<CollectionResult<Message>> = { pageParams: [undefined, 1, 2, 3, 4], pages };
    queryClient.setQueryData(mobileQueryKeys.messages(5), history);

    appendIncomingMessage(queryClient, 5, message(6, 'Live reply'));
    const active = queryClient.getQueryData<InfiniteData<CollectionResult<Message>>>(mobileQueryKeys.messages(5));
    expect(active?.pages).toHaveLength(5);

    const inactive = trimInfinitePages(active, MOBILE_CACHE_PAGE_LIMIT);
    expect(inactive?.pages).toHaveLength(3);
    expect(inactive?.pages[0].data.map((item) => item.id)).toEqual([1, 6]);
  });

  test('does not move a cached participant receipt backward when events arrive out of order', () => {
    const queryClient = testQueryClient();
    queryClient.setQueryData(mobileQueryKeys.conversation(5), {
      id: 5,
      participants: [{ id: 2, name: 'Taylor', last_delivered_message_id: 50, last_read_message_id: 45 }],
    });

    applyConversationReceipt(queryClient, 5, { user_id: 2, delivered_message_id: 40, read_message_id: 30 });

    const cached = queryClient.getQueryData<{ participants: Array<{ last_delivered_message_id: number; last_read_message_id: number }> }>(mobileQueryKeys.conversation(5));
    expect(cached?.participants[0]).toMatchObject({ last_delivered_message_id: 50, last_read_message_id: 45 });
  });

  test('updates post feed rows in place', () => {
    const queryClient = testQueryClient();
    const post = postRow(1, 2, false);
    queryClient.setQueryData<CollectionResult<Post>>(mobileQueryKeys.posts, { data: [post] });

    updatePostInFeed(queryClient, 1, (current) => ({ ...current, liked_by_current_user: true, likes_count: current.likes_count + 1 }));
    applyPostToFeed(queryClient, { ...post, id: 2, message: 'New cached post' });

    const cached = queryClient.getQueryData<CollectionResult<Post>>(mobileQueryKeys.posts);
    expect(cached?.data.map((item) => [item.id, item.likes_count, item.liked_by_current_user])).toEqual([
      [2, 2, false],
      [1, 3, true],
    ]);
  });
});

function query(queryKey: unknown[], status: string, data: unknown) {
  return { queryKey, state: { status, data } } as never;
}

function testQueryClient() {
  return trackClient(new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } }));
}

function trackClient<T extends QueryClient>(client: T) {
  clients.push(client);
  return client;
}

function message(id: number, body: string): Message {
  return { id, body, created_at: '2026-07-30T10:00:00Z', user_id: 1, user_name: 'Alex' };
}

function postRow(id: number, likesCount: number, liked: boolean): Post {
  return {
    id,
    comments_count: 0,
    created_at: '2026-07-30T10:00:00Z',
    liked_by_current_user: liked,
    likes_count: likesCount,
    message: 'Cached post',
    user: { id: 1, first_name: 'Alex', last_name: 'Morgan' },
  };
}
