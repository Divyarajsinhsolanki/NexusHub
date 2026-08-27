import { endpoints } from '../api/endpoints';

type ReceiptState = 'delivered' | 'read';
type ReceiptSender = (conversationId: number, messageId: number, state: ReceiptState) => Promise<unknown>;

type ReceiptCursor = { delivered: number; read: number };
const cursors = new Map<string, ReceiptCursor>();

export async function sendConversationReceiptOnce(
  userId: number | undefined,
  conversationId: number,
  messageId: number,
  state: ReceiptState,
  sender: ReceiptSender = endpoints.updateConversationReceipt,
) {
  if (!Number.isFinite(messageId) || messageId <= 0) return false;

  const key = `${Number(userId) || 0}:${conversationId}`;
  const cursor = cursors.get(key) || { delivered: 0, read: 0 };
  if (cursor[state] >= messageId) return false;

  const previous = { ...cursor };
  cursor[state] = messageId;
  if (state === 'read') cursor.delivered = Math.max(cursor.delivered, messageId);
  cursors.set(key, cursor);

  try {
    await sender(conversationId, messageId, state);
    return true;
  } catch (error) {
    const current = cursors.get(key);
    if (current?.[state] === messageId) {
      if (state === 'read') {
        current.read = previous.read;
        current.delivered = Math.max(current.delivered, previous.delivered);
      } else if (current.read < messageId) {
        current.delivered = previous.delivered;
      }
    }
    throw error;
  }
}

export function resetConversationReceiptTracking() {
  cursors.clear();
}
