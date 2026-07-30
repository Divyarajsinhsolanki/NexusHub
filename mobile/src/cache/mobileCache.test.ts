import { QueryClient, type InfiniteData } from '@tanstack/react-query';
import { afterEach, describe, expect, test } from '@jest/globals';

import type { CollectionResult, Message, Post } from '../api/types';
import {
  appendIncomingMessage,
  applyPostToFeed,
  createMobileQueryClient,
  MOBILE_CACHE_MAX_AGE,
  mobileQueryKeys,
  shouldPersistMobileQuery,
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
