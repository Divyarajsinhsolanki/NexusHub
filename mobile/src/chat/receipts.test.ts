import { describe, expect, test } from '@jest/globals';

import type { Conversation, Message } from '../api/types';
import { outgoingReceiptState } from './receipts';

const message: Message = { id: 20, user_id: 1, body: 'Hello', created_at: '2026-08-05T10:00:00Z' };

describe('outgoingReceiptState', () => {
  test('shows delivered only after the direct recipient advances', () => {
    expect(outgoingReceiptState(conversation([{ id: 1, name: 'Sender' }, { id: 2, name: 'Recipient', last_delivered_message_id: 20 }]), message, 1)).toMatchObject({ symbol: '✓✓', read: false });
  });

  test('requires every eligible group recipient for read', () => {
    const result = outgoingReceiptState(conversation([
      { id: 1, name: 'Sender' },
      { id: 2, name: 'First', last_delivered_message_id: 20, last_read_message_id: 20 },
      { id: 3, name: 'Second', last_delivered_message_id: 20, last_read_message_id: 19 },
    ]), message, 1);

    expect(result.symbol).toBe('✓✓');
    expect(result.read).toBe(false);
    expect(result.label).toContain('Delivered to all');
  });

  test('ignores participants who joined after the message', () => {
    const result = outgoingReceiptState(conversation([
      { id: 1, name: 'Sender' },
      { id: 2, name: 'Earlier', joined_at: '2026-08-05T09:00:00Z', last_read_message_id: 20, last_delivered_message_id: 20 },
      { id: 3, name: 'Later', joined_at: '2026-08-05T11:00:00Z' },
    ]), message, 1);

    expect(result).toMatchObject({ symbol: '✓✓', read: true });
  });
});

function conversation(participants: NonNullable<Conversation['participants']>): Conversation {
  return { id: 1, participants };
}
