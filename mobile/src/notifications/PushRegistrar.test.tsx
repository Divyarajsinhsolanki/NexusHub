import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';

import { useAuth } from '../auth/AuthProvider';
import { mobileQueryKeys } from '../cache/mobileCache';
import { PushRegistrar } from './PushRegistrar';

const mockPush = jest.fn();

let receivedCallback: ((notification: { request: { content: { data?: Record<string, unknown> } } }) => void) | undefined;
let responseCallback: ((response: { notification: { request: { content: { data?: Record<string, unknown> } } } }) => void) | undefined;

jest.mock('expo-crypto', () => ({ CryptoDigestAlgorithm: { SHA256: 'sha256' }, digestStringAsync: async (_algorithm: string, input: string) => require('crypto').createHash('sha256').update(input).digest('hex') }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    easConfig: { projectId: 'project-id' },
    expoConfig: { extra: { eas: { projectId: 'project-id' } }, version: '1.0.0' },
  },
}));
jest.mock('expo-device', () => ({
  deviceName: 'Test phone',
  modelId: 'model-id',
  modelName: 'Phone',
  osBuildId: 'build-id',
}));
jest.mock('expo-notifications', () => {
  const { jest: jestGlobals } = require('@jest/globals');
  return {
    AndroidImportance: { DEFAULT: 3 },
    addNotificationReceivedListener: jestGlobals.fn(),
    addNotificationResponseReceivedListener: jestGlobals.fn(),
    getExpoPushTokenAsync: jestGlobals.fn(),
    getLastNotificationResponseAsync: jestGlobals.fn(async () => null),
    clearLastNotificationResponseAsync: jestGlobals.fn(async () => undefined),
    getPermissionsAsync: jestGlobals.fn(),
    requestPermissionsAsync: jestGlobals.fn(),
    setNotificationChannelAsync: jestGlobals.fn(),
    setNotificationCategoryAsync: jestGlobals.fn(async () => undefined),
    dismissNotificationAsync: jestGlobals.fn(async () => undefined),
    setBadgeCountAsync: jestGlobals.fn(async () => true),
  };
});
jest.mock('../api/endpoints', () => ({ endpoints: { registerDevice: jest.fn(), replyToNotification: jest.fn(async () => ({ message_id: 8, conversation_id: 4, reply_to_id: 7, unread_count: 0 })), notifications: jest.fn(async () => ({ data: [], meta: { unread_count: 0 } })) } }));
jest.mock('../storage/database', () => ({ pendingNotificationActions: jest.fn(async () => []), notificationActionWasProcessed: jest.fn(async () => false), markNotificationActionProcessed: jest.fn(async () => undefined), enqueueNotificationAction: jest.fn(async () => undefined), removePendingNotificationAction: jest.fn(async () => undefined) }));
jest.mock('../auth/AuthProvider', () => ({ useAuth: jest.fn() }));

beforeEach(() => {
  receivedCallback = undefined;
  responseCallback = undefined;
  mockPush.mockClear();
  (Notifications.getPermissionsAsync as jest.MockedFunction<typeof Notifications.getPermissionsAsync>).mockResolvedValue({ status: 'denied' } as never);
  (Notifications.requestPermissionsAsync as jest.MockedFunction<typeof Notifications.requestPermissionsAsync>).mockResolvedValue({ status: 'denied' } as never);
  (Notifications.addNotificationReceivedListener as jest.MockedFunction<typeof Notifications.addNotificationReceivedListener>).mockImplementation((callback) => {
    receivedCallback = callback as typeof receivedCallback;
    return { remove: jest.fn() } as never;
  });
  (Notifications.addNotificationResponseReceivedListener as jest.MockedFunction<typeof Notifications.addNotificationResponseReceivedListener>).mockImplementation((callback) => {
    responseCallback = callback as typeof responseCallback;
    return { remove: jest.fn() } as never;
  });
  (useAuth as jest.MockedFunction<typeof useAuth>).mockReturnValue({
    user: {
      id: 1,
      email: 'demo@example.com',
      first_name: 'Demo',
      last_name: 'User',
      full_name: 'Demo User',
      job_title: 'Reviewer',
      avatar_color: '#2563eb',
      roles: ['member'],
      workspace: { id: 1, name: 'Demo Workspace', slug: 'demo' },
    },
    isLoading: false,
    signIn: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    signInWithGoogle: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    signInDemo: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    signUp: jest.fn() as never,
    forgotPassword: jest.fn() as never,
    resetPassword: jest.fn() as never,
    signOut: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    refreshUser: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    startImpersonation: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    stopImpersonation: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

test('refreshes cached counters on foreground push and normalizes tap navigation', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
  queryClient.setQueryData(mobileQueryKeys.notifications, { pageParams: [1], pages: [{ data: [], meta: { unread_count: 0 } }] });
  queryClient.setQueryData(mobileQueryKeys.home, { summary: { unread_notifications: 0 }, tasks: [] });

  await render(<QueryClientProvider client={queryClient}><PushRegistrar /></QueryClientProvider>);

  await waitFor(() => expect(Notifications.addNotificationReceivedListener).toHaveBeenCalled());
  await act(async () => {
    receivedCallback?.({ request: { content: { data: { deep_link: '/notifications' } } } });
  });

  await waitFor(() => expect(queryClient.getQueryState(mobileQueryKeys.notifications)?.isInvalidated).toBe(true));
  expect(queryClient.getQueryState(mobileQueryKeys.home)?.isInvalidated).toBe(true);

  responseCallback?.({ notification: { request: { content: { data: { deep_link: '/notifications' } } } } });

  expect(mockPush).toHaveBeenCalledWith('/inbox/notifications');
  cleanup();
  queryClient.clear();
});

test('opens the last call notification after a terminated Android launch', async () => {
  (Notifications.getLastNotificationResponseAsync as jest.MockedFunction<typeof Notifications.getLastNotificationResponseAsync>).mockResolvedValue({
    notification: { request: { identifier: 'incoming-call-11', content: { data: { deep_link: '/call/11?type=video' } } } },
  } as never);
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });

  await render(<QueryClientProvider client={queryClient}><PushRegistrar /></QueryClientProvider>);

  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/call/11?type=video'));
  expect(Notifications.clearLastNotificationResponseAsync).toHaveBeenCalled();
  cleanup();
  queryClient.clear();
});


test('daily knowledge push refreshes the board and opens the exact post', async () => {
  (Notifications.getLastNotificationResponseAsync as jest.MockedFunction<typeof Notifications.getLastNotificationResponseAsync>).mockResolvedValue(null);
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
  queryClient.setQueryData(['knowledge-items', 'active'], { data: [] });
  queryClient.setQueryData(mobileQueryKeys.posts, { data: [] });
  await render(<QueryClientProvider client={queryClient}><PushRegistrar /></QueryClientProvider>);
  await waitFor(() => expect(Notifications.addNotificationReceivedListener).toHaveBeenCalled());
  const data = { event_type: 'daily_knowledge_published', deep_link: '/more/knowledge?itemId=91', post_id: 92 };
  await act(async () => { receivedCallback?.({ request: { content: { data } } }); });
  expect(queryClient.getQueryState(['knowledge-items', 'active'])?.isInvalidated).toBe(true);
  expect(queryClient.getQueryState(mobileQueryKeys.posts)?.isInvalidated).toBe(true);
  await act(async () => { responseCallback?.({ notification: { request: { content: { data } } } }); });
  expect(mockPush).toHaveBeenCalledWith('/more/knowledge?itemId=91');
  cleanup(); queryClient.clear();
});

test('inline reply sends and refreshes chat without navigating away from the current screen', async () => {
  const { endpoints } = require('../api/endpoints');
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  await render(<QueryClientProvider client={client}><PushRegistrar /></QueryClientProvider>);
  await waitFor(() => expect(responseCallback).toBeDefined());
  await act(async () => {
    responseCallback?.({ actionIdentifier: 'nexus_reply', userText: 'Inline response', notification: { request: { identifier: 'chat-reply', content: { data: { notification_id: 3, conversation_id: 4, deep_link: '/chat/4' } } } } } as never);
  });
  await waitFor(() => expect(endpoints.replyToNotification).toHaveBeenCalledWith(3, 'Inline response', expect.stringMatching(/^push-/)));
  expect(mockPush).not.toHaveBeenCalled();
  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: mobileQueryKeys.messages(4) }));
  cleanup(); client.clear();
});
