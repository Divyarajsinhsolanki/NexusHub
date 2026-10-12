import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { NotificationResponse } from 'expo-notifications';
import * as Notifications from 'expo-notifications';
import { endpoints } from '../api/endpoints';
import { enqueueNotificationAction, markNotificationActionProcessed, notificationActionWasProcessed, pendingNotificationActions, removePendingNotificationAction } from '../storage/database';
import { processNotificationResponse, processStoredNotificationAction, retryPendingNotificationActions, storedActionFromResponse } from './actions';
import { NOTIFICATION_ACTIONS } from './constants';

jest.mock('expo-crypto', () => ({ CryptoDigestAlgorithm: { SHA256: 'sha256' }, digestStringAsync: async (_algorithm: string, input: string) => require('crypto').createHash('sha256').update(input).digest('hex') }));
jest.mock('expo-notifications', () => ({ DEFAULT_ACTION_IDENTIFIER: 'default', dismissNotificationAsync: jest.fn(async () => undefined), setBadgeCountAsync: jest.fn(async () => true) }));
jest.mock('../api/endpoints', () => ({ endpoints: { callAction: jest.fn(), replyToNotification: jest.fn(), readNotification: jest.fn() } }));
jest.mock('../storage/database', () => ({ enqueueNotificationAction: jest.fn(), removePendingNotificationAction: jest.fn(), markNotificationActionProcessed: jest.fn(), notificationActionWasProcessed: jest.fn(), pendingNotificationActions: jest.fn(async () => []) }));
const action = () => ({ actionKey: 'response:reply', actionIdentifier: NOTIFICATION_ACTIONS.reply, data: { conversation_id: 4, notification_id: 3, notification_client_id: 'push-stable-id', deep_link: '/chat/4' }, userText: 'On it', notificationIdentifier: 'push-3', createdAt: Date.now() });
const response = () => ({ notification: { request: { identifier: 'push-3', content: { data: { conversation_id: 4, notification_id: 3, recipient_user_id: 9 } } } }, actionIdentifier: NOTIFICATION_ACTIONS.reply, userText: 'On it' } as unknown as NotificationResponse);

describe('notification actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(enqueueNotificationAction).mockReset().mockResolvedValue(undefined);
    jest.mocked(notificationActionWasProcessed).mockResolvedValue(false);
    jest.mocked(endpoints.replyToNotification).mockReset().mockResolvedValue({ message_id: 8, conversation_id: 4, reply_to_id: 7, unread_count: 2 });
    jest.mocked(pendingNotificationActions).mockResolvedValue([]);
  });
  test('persists an inline reply before sending, updates badges and dismisses without navigating', async () => {
    const result = await processStoredNotificationAction(action());
    expect(endpoints.replyToNotification).toHaveBeenCalledWith(3, 'On it', 'push-stable-id');
    expect(jest.mocked(enqueueNotificationAction).mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(endpoints.replyToNotification).mock.invocationCallOrder[0]);
    expect(markNotificationActionProcessed).toHaveBeenCalledWith('response:reply');
    expect(Notifications.setBadgeCountAsync).toHaveBeenCalledWith(2);
    expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith('push-3');
    expect(result.deepLink).toBeNull();
  });
  test('repeated OS responses generate the same private idempotency key', async () => {
    const first = await storedActionFromResponse(response());
    const second = await storedActionFromResponse(response());
    expect(first.data.notification_client_id).toBe(second.data.notification_client_id);
    expect(first.actionKey).not.toContain('On it');
    const changed = await storedActionFromResponse({ ...response(), userText: 'Different reply' });
    expect(changed.actionKey).not.toBe(first.actionKey);
  });
  test('concurrent foreground and background callbacks send only once', async () => {
    await Promise.all([processNotificationResponse(response()), processNotificationResponse(response())]);
    expect(endpoints.replyToNotification).toHaveBeenCalledTimes(1);
  });
  test('offline and lost-response retries keep the original id', async () => {
    jest.mocked(endpoints.replyToNotification).mockRejectedValueOnce(new Error('Offline'));
    const draft = action();
    await expect(processStoredNotificationAction(draft)).rejects.toMatchObject({ queued: true });
    jest.mocked(pendingNotificationActions).mockResolvedValue([draft]);
    expect(await retryPendingNotificationActions()).toEqual(['/chat/4']);
    expect(jest.mocked(endpoints.replyToNotification).mock.calls.map(args => args[2])).toEqual(['push-stable-id', 'push-stable-id']);
  });
  test('a wrong account or removed conversation is not retried forever', async () => {
    jest.mocked(endpoints.replyToNotification).mockRejectedValueOnce({ response: { status: 404 } });
    await expect(processStoredNotificationAction(action())).rejects.toMatchObject({ queued: false });
    expect(removePendingNotificationAction).toHaveBeenCalledWith('response:reply');
    expect(markNotificationActionProcessed).not.toHaveBeenCalled();
  });
  test('an expired login keeps the reply for authentication recovery', async () => {
    jest.mocked(endpoints.replyToNotification).mockRejectedValueOnce({ response: { status: 401 } });
    await expect(processStoredNotificationAction(action())).rejects.toMatchObject({ queued: true });
    expect(removePendingNotificationAction).not.toHaveBeenCalled();
  });
  test('blank replies do nothing and oversized replies are rejected without truncation', async () => {
    expect(await processStoredNotificationAction({ ...action(), userText: ' ' })).toEqual({ deepLink: null, performed: false });
    await expect(processStoredNotificationAction({ ...action(), userText: 'x'.repeat(4001) })).rejects.toMatchObject({ queued: false });
    expect(endpoints.replyToNotification).not.toHaveBeenCalled();
  });
  test('expired and already processed replies cannot resend', async () => {
    await expect(processStoredNotificationAction({ ...action(), createdAt: Date.now() - 25 * 3600000 })).rejects.toMatchObject({ queued: false });
    jest.mocked(notificationActionWasProcessed).mockResolvedValue(true);
    expect((await processStoredNotificationAction(action())).performed).toBe(false);
    expect(endpoints.replyToNotification).not.toHaveBeenCalled();
  });
  test('declines calls without opening a route', async () => {
    const result = await processStoredNotificationAction({ actionKey: 'response:decline', actionIdentifier: NOTIFICATION_ACTIONS.decline, data: { call_id: 19 } });
    expect(endpoints.callAction).toHaveBeenCalledWith(19, 'decline');
    expect(result.deepLink).toBeNull();
  });
});

test('does not send when the reply cannot be saved for safe recovery', async () => {
  jest.mocked(enqueueNotificationAction).mockRejectedValueOnce(new Error('Storage unavailable'));
  const before = jest.mocked(endpoints.replyToNotification).mock.calls.length;
  await expect(processStoredNotificationAction({ ...action(), actionKey: 'storage-failure' })).rejects.toMatchObject({ queued: false });
  expect(endpoints.replyToNotification).toHaveBeenCalledTimes(before);
});
