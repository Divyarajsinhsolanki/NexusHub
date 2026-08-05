import {
  QueryClient,
  type InfiniteData,
  type Query,
  type QueryKey,
} from '@tanstack/react-query';

import type {
  ApiEnvelope,
  CollectionResult,
  Conversation,
  Message,
  Notification,
  Post,
} from '../api/types';
import { endpoints } from '../api/endpoints';
import { normalizeMobileDeepLink } from '../navigation/deepLinks';

export const MOBILE_CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
export const MOBILE_CACHE_BUSTER = 'mobile-cache-v2';
export const MOBILE_CACHE_PAGE_LIMIT = 3;

const LONG_STALE_TIME = 5 * 60 * 1000;
const SHORT_STALE_TIME = 60 * 1000;

const PERSISTED_QUERY_PREFIXES = new Set([
  'calendar-events',
  'conversation',
  'conversations',
  'department',
  'departments',
  'demo-manifest',
  'home',
  'knowledge-bookmarks',
  'knowledge-items',
  'learning-goals',
  'messages',
  'mobile-config',
  'momentum',
  'notifications',
  'pdf-document',
  'pdf-documents',
  'portfolio',
  'post-comments',
  'posts',
  'project',
  'project-sprints',
  'project-tasks',
  'projects',
  'team-insights',
  'teams',
  'tasks',
  'work-logs',
]);

const BLOCKED_QUERY_PREFIXES = new Set([
  'admin-meta',
  'admin-tables',
  'call',
  'global-search',
  'keka-profile',
  'mobile-sessions',
  'owner-access-users',
  'people-for-impersonation',
  'pdf-viewer-token',
  'portfolio-admin',
  'resource',
  'users',
  'work-options',
]);

type PersistableQuery = Pick<Query, 'queryKey' | 'state'>;

export const mobileQueryKeys = {
  home: ['home'] as const,
  posts: ['posts'] as const,
  postComments: (postId: number) => ['post-comments', postId] as const,
  conversations: ['conversations'] as const,
  conversation: (conversationId: number) => ['conversation', conversationId] as const,
  messages: (conversationId: number) => ['messages', conversationId] as const,
  notifications: ['notifications'] as const,
  projects: ['projects'] as const,
  project: (projectId: number) => ['project', projectId] as const,
  projectSprints: (projectId: number) => ['project-sprints', projectId] as const,
  projectTasks: (projectId: number) => ['project-tasks', projectId] as const,
};

export function createMobileQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 24 * 60 * 60 * 1000,
        retry: 1,
        refetchOnReconnect: true,
      },
      mutations: { retry: 0, networkMode: 'always' },
    },
  });

  [
    mobileQueryKeys.home,
    mobileQueryKeys.posts,
    mobileQueryKeys.conversations,
    mobileQueryKeys.notifications,
  ].forEach((queryKey) => {
    queryClient.setQueryDefaults(queryKey, { staleTime: SHORT_STALE_TIME, gcTime: MOBILE_CACHE_MAX_AGE });
  });

  [
    mobileQueryKeys.projects,
    ['calendar-events'] as const,
    ['department'] as const,
    ['departments'] as const,
    ['demo-manifest'] as const,
    ['teams'] as const,
    ['team-insights'] as const,
    ['knowledge-items'] as const,
    ['knowledge-bookmarks'] as const,
    ['learning-goals'] as const,
    ['mobile-config'] as const,
    ['momentum'] as const,
    ['pdf-document'] as const,
    ['pdf-documents'] as const,
    ['portfolio'] as const,
    ['tasks'] as const,
    ['work-logs'] as const,
  ].forEach((queryKey) => {
    queryClient.setQueryDefaults(queryKey, { staleTime: LONG_STALE_TIME, gcTime: MOBILE_CACHE_MAX_AGE });
  });

  queryClient.setQueryDefaults(['messages'], { staleTime: SHORT_STALE_TIME, gcTime: MOBILE_CACHE_MAX_AGE });
  queryClient.setQueryDefaults(['conversation'], { staleTime: SHORT_STALE_TIME, gcTime: MOBILE_CACHE_MAX_AGE });
  queryClient.setQueryDefaults(['project'], { staleTime: LONG_STALE_TIME, gcTime: MOBILE_CACHE_MAX_AGE });
  queryClient.setQueryDefaults(['project-sprints'], { staleTime: LONG_STALE_TIME, gcTime: MOBILE_CACHE_MAX_AGE });
  queryClient.setQueryDefaults(['project-tasks'], { staleTime: SHORT_STALE_TIME, gcTime: MOBILE_CACHE_MAX_AGE });
  queryClient.setQueryDefaults(['post-comments'], { staleTime: SHORT_STALE_TIME, gcTime: MOBILE_CACHE_MAX_AGE });

  return queryClient;
}

export function shouldPersistMobileQuery(query: PersistableQuery) {
  const prefix = queryKeyPrefix(query.queryKey);
  if (!prefix) return false;
  if (BLOCKED_QUERY_PREFIXES.has(prefix)) return false;
  if (!PERSISTED_QUERY_PREFIXES.has(prefix)) return false;
  if (query.state.status !== 'success') return false;
  return query.state.data !== undefined;
}

export function trimInfinitePages<T>(
  data: InfiniteData<T> | undefined,
  maxPages = MOBILE_CACHE_PAGE_LIMIT,
): InfiniteData<T> | undefined {
  if (!data || data.pages.length <= maxPages) return data;
  return {
    ...data,
    pages: data.pages.slice(0, maxPages),
    pageParams: data.pageParams.slice(0, maxPages),
  };
}

export function appendIncomingMessage(
  queryClient: QueryClient,
  conversationId: number,
  incoming: Message,
) {
  queryClient.setQueryData<InfiniteData<CollectionResult<Message>>>(
    mobileQueryKeys.messages(conversationId),
    (previous) => {
      if (!previous) return previous;
      if (hasMessage(previous, incoming.id)) return previous;

      const pages = previous.pages.map((page, index) => (
        index === 0 ? { ...page, data: [...page.data, incoming] } : page
      ));

      return { ...previous, pages };
    },
  );
}

export function updateConversationPreview(
  queryClient: QueryClient,
  conversationId: number,
  incoming: Message,
) {
  queryClient.setQueryData<CollectionResult<Conversation>>(mobileQueryKeys.conversations, (previous) => {
    if (!previous) return previous;
    const index = previous.data.findIndex((conversation) => Number(conversation.id) === Number(conversationId));
    if (index === -1) return previous;

    const conversation = { ...previous.data[index], last_message: incoming };
    const rest = previous.data.filter((item) => Number(item.id) !== Number(conversationId));
    return { ...previous, data: [conversation, ...rest] };
  });
}

export function applyConversationReceipt(
  queryClient: QueryClient,
  conversationId: number,
  receipt: {
    user_id?: unknown;
    delivered_message_id?: unknown;
    read_message_id?: unknown;
    delivered_at?: unknown;
    read_at?: unknown;
  },
) {
  const update = (conversation: Conversation) => {
    if (Number(conversation.id) !== Number(conversationId) || !Array.isArray(conversation.participants)) return conversation;
    return {
      ...conversation,
      participants: conversation.participants.map((participant) => {
        if (Number(participant.id) !== Number(receipt.user_id)) return participant;
        const currentDeliveredId = Number(participant.last_delivered_message_id || 0);
        const currentReadId = Number(participant.last_read_message_id || 0);
        const incomingDeliveredId = Number(receipt.delivered_message_id || 0);
        const incomingReadId = Number(receipt.read_message_id || 0);
        return {
          ...participant,
          last_delivered_message_id: Math.max(currentDeliveredId, incomingDeliveredId) || null,
          last_read_message_id: Math.max(currentReadId, incomingReadId) || null,
          last_delivered_at: incomingDeliveredId >= currentDeliveredId && typeof receipt.delivered_at === 'string' ? receipt.delivered_at : participant.last_delivered_at,
          last_read_at: incomingReadId >= currentReadId && typeof receipt.read_at === 'string' ? receipt.read_at : participant.last_read_at,
        };
      }),
    };
  };

  queryClient.setQueryData<Conversation>(mobileQueryKeys.conversation(conversationId), (previous) => previous ? update(previous) : previous);
  queryClient.setQueryData<CollectionResult<Conversation>>(mobileQueryKeys.conversations, (previous) => previous ? {
    ...previous,
    data: previous.data.map(update),
  } : previous);
}

export function prependNotification(
  queryClient: QueryClient,
  incoming: Notification,
) {
  queryClient.setQueryData<InfiniteData<ApiEnvelope<Notification[]>>>(
    mobileQueryKeys.notifications,
    (previous) => {
      if (!previous) return previous;
      if (previous.pages.some((page) => page.data.some((notification) => Number(notification.id) === Number(incoming.id)))) {
        return previous;
      }

      const pages = previous.pages.map((page, index) => (
        index === 0
          ? {
            ...page,
            data: [incoming, ...page.data],
            meta: {
              ...page.meta,
              unread_count: Number(page.meta?.unread_count || 0) + 1,
            },
          }
          : page
      ));

      return trimInfinitePages({ ...previous, pages });
    },
  );
}

export function applyPostToFeed(queryClient: QueryClient, post: Post) {
  queryClient.setQueryData<CollectionResult<Post>>(mobileQueryKeys.posts, (previous) => {
    if (!previous) return previous;
    const existing = previous.data.findIndex((item) => Number(item.id) === Number(post.id));
    if (existing === -1) return { ...previous, data: [post, ...previous.data] };

    const data = [...previous.data];
    data[existing] = post;
    return { ...previous, data };
  });
}

export function updatePostInFeed(
  queryClient: QueryClient,
  postId: number,
  updater: (post: Post) => Post,
) {
  queryClient.setQueryData<CollectionResult<Post>>(mobileQueryKeys.posts, (previous) => {
    if (!previous) return previous;
    let changed = false;
    const data = previous.data.map((post) => {
      if (Number(post.id) !== Number(postId)) return post;
      changed = true;
      return updater(post);
    });
    return changed ? { ...previous, data } : previous;
  });
}

export async function warmMobileCache(queryClient: QueryClient) {
  await Promise.allSettled([
    queryClient.prefetchQuery({ queryKey: mobileQueryKeys.home, queryFn: endpoints.home }),
    queryClient.prefetchQuery({ queryKey: mobileQueryKeys.posts, queryFn: () => endpoints.posts() }),
    queryClient.prefetchQuery({ queryKey: mobileQueryKeys.conversations, queryFn: () => endpoints.conversations() }),
    queryClient.prefetchInfiniteQuery({
    queryKey: mobileQueryKeys.notifications,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => endpoints.notifications(Number(pageParam || 1)),
      getNextPageParam: (page: ApiEnvelope<Notification[]>) => page.meta?.next_page ?? undefined,
      maxPages: MOBILE_CACHE_PAGE_LIMIT,
    }),
    queryClient.prefetchQuery({ queryKey: mobileQueryKeys.projects, queryFn: endpoints.projects }),
  ]);
}

export function refreshCachesForDeepLink(queryClient: QueryClient, deepLink: unknown) {
  const normalized = normalizeMobileDeepLink(deepLink);
  const tasks: Array<Promise<unknown>> = [
    queryClient.invalidateQueries({ queryKey: mobileQueryKeys.notifications }),
    queryClient.invalidateQueries({ queryKey: mobileQueryKeys.home }),
  ];

  if (!normalized) return Promise.all(tasks);

  const conversationMatch = normalized.match(/^\/inbox\/chat\/(\d+)/);
  const projectMatch = normalized.match(/^\/projects\/(\d+)/);
  const postMatch = normalized.match(/^\/inbox\/post\/(\d+)/);

  if (normalized === '/inbox' || normalized.startsWith('/inbox?')) {
    tasks.push(queryClient.invalidateQueries({ queryKey: mobileQueryKeys.posts }));
    tasks.push(queryClient.invalidateQueries({ queryKey: mobileQueryKeys.conversations }));
  }

  if (conversationMatch) {
    const conversationId = Number(conversationMatch[1]);
    tasks.push(queryClient.invalidateQueries({ queryKey: mobileQueryKeys.conversations }));
    tasks.push(queryClient.invalidateQueries({ queryKey: mobileQueryKeys.conversation(conversationId) }));
    tasks.push(queryClient.invalidateQueries({ queryKey: mobileQueryKeys.messages(conversationId) }));
  }

  if (projectMatch) {
    const projectId = Number(projectMatch[1]);
    tasks.push(queryClient.invalidateQueries({ queryKey: mobileQueryKeys.projects }));
    tasks.push(queryClient.invalidateQueries({ queryKey: mobileQueryKeys.project(projectId) }));
    tasks.push(queryClient.invalidateQueries({ queryKey: mobileQueryKeys.projectSprints(projectId) }));
    tasks.push(queryClient.invalidateQueries({ queryKey: mobileQueryKeys.projectTasks(projectId) }));
  }

  if (postMatch) {
    const postId = Number(postMatch[1]);
    tasks.push(queryClient.invalidateQueries({ queryKey: mobileQueryKeys.posts }));
    tasks.push(queryClient.invalidateQueries({ queryKey: mobileQueryKeys.postComments(postId) }));
  }

  return Promise.all(tasks);
}

function queryKeyPrefix(queryKey: QueryKey) {
  const prefix = queryKey[0];
  return typeof prefix === 'string' ? prefix : undefined;
}

function hasMessage(data: InfiniteData<CollectionResult<Message>>, messageId: number) {
  return data.pages.some((page) => page.data.some((message) => Number(message.id) === Number(messageId)));
}
