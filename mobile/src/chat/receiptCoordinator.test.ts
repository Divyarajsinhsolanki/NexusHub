import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { resetConversationReceiptTracking, sendConversationReceiptOnce } from './receiptCoordinator';

beforeEach(() => resetConversationReceiptTracking());

describe('conversation receipt coordination', () => {
  test('deduplicates receipts shared by root and thread subscriptions', async () => {
    const sender = jest.fn(async () => undefined);

    await expect(sendConversationReceiptOnce(7, 12, 30, 'delivered', sender)).resolves.toBe(true);
    await expect(sendConversationReceiptOnce(7, 12, 30, 'delivered', sender)).resolves.toBe(false);
    expect(sender).toHaveBeenCalledTimes(1);
  });

  test('read advances delivered and older events cannot move cursors backwards', async () => {
    const sender = jest.fn(async () => undefined);

    await sendConversationReceiptOnce(7, 12, 30, 'read', sender);
    await sendConversationReceiptOnce(7, 12, 29, 'read', sender);
    await sendConversationReceiptOnce(7, 12, 30, 'delivered', sender);

    expect(sender).toHaveBeenCalledTimes(1);
    expect(sender).toHaveBeenCalledWith(12, 30, 'read');
  });

  test('rolls back a failed cursor so recovery can retry it', async () => {
    const sender = jest.fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined);

    await expect(sendConversationReceiptOnce(7, 12, 31, 'read', sender)).rejects.toThrow('offline');
    await expect(sendConversationReceiptOnce(7, 12, 31, 'read', sender)).resolves.toBe(true);
    expect(sender).toHaveBeenCalledTimes(2);
  });

  test('a failed delivered request cannot erase a concurrent read cursor', async () => {
    let rejectDelivered: ((error: Error) => void) | undefined;
    const delivered = new Promise<void>((_resolve, reject) => { rejectDelivered = reject; });
    const sender = jest.fn((_conversationId: number, _messageId: number, state: 'delivered' | 'read') => (
      state === 'delivered' ? delivered : Promise.resolve()
    ));

    const pendingDelivered = sendConversationReceiptOnce(7, 12, 50, 'delivered', sender);
    await sendConversationReceiptOnce(7, 12, 50, 'read', sender);
    rejectDelivered?.(new Error('offline'));
    await expect(pendingDelivered).rejects.toThrow('offline');

    await expect(sendConversationReceiptOnce(7, 12, 50, 'read', sender)).resolves.toBe(false);
  });
});
