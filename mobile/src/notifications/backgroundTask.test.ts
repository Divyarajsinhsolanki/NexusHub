import { beforeEach, expect, jest, test } from '@jest/globals';
let mockTask: (input: { data: unknown; error?: unknown }) => Promise<void>;
const mockFeedback = jest.fn(async (_input: unknown) => undefined);
const mockProcess = jest.fn(async (_response: unknown) => undefined);
jest.mock('expo-task-manager', () => ({ isTaskDefined: () => false, defineTask: (_name: string, callback: typeof mockTask) => { mockTask = callback; } }));
jest.mock('expo-notifications', () => ({ registerTaskAsync: jest.fn(async () => undefined), scheduleNotificationAsync: (input: unknown) => mockFeedback(input) }));
jest.mock('./actions', () => ({ NotificationReplyError: class extends Error { queued: boolean; constructor(message: string, mockQueued: boolean) { super(message); this.queued = mockQueued; } }, processNotificationResponse: (...args: unknown[]) => mockProcess(args[0]) }));
beforeEach(() => { mockProcess.mockReset().mockResolvedValue(undefined); mockFeedback.mockClear(); });
require('./backgroundTask');
test('background inline replies use the shared durable processor and ordinary deliveries do not send', async () => {
  const response = { actionIdentifier: 'nexus_reply', userText: 'Background reply', notification: { request: { identifier: 'push' } } };
  await mockTask({ data: response });
  expect(mockProcess).toHaveBeenCalledWith(response);
  await mockTask({ data: { data: { conversation_id: 7 } } });
  expect(mockProcess).toHaveBeenCalledTimes(1);
});

test('a failed background reply shows a private queued-send status', async () => {
  mockProcess.mockRejectedValueOnce(new (require('./actions').NotificationReplyError)('Saved; reopen to retry.', true));
  await mockTask({ data: { actionIdentifier: 'nexus_reply', notification: { request: { content: { data: { deep_link: '/chat/7' } } } } } });
  expect(mockFeedback).toHaveBeenCalledWith(expect.objectContaining({ content: expect.objectContaining({ title: 'Reply saved for retry', data: { deep_link: '/chat/7' } }), trigger: null }));
});
