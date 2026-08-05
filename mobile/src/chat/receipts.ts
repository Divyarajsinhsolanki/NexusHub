import type { Conversation, Message } from '../api/types';

export function outgoingReceiptState(conversation: Conversation | undefined, message: Message, currentUserId?: number) {
  const recipients = (conversation?.participants || []).filter((participant) => (
    participant.id !== currentUserId &&
    (!participant.joined_at || new Date(participant.joined_at) <= new Date(message.created_at))
  ));
  const delivered = recipients.filter((participant) => Number(participant.last_delivered_message_id || 0) >= message.id).length;
  const read = recipients.filter((participant) => Number(participant.last_read_message_id || 0) >= message.id).length;
  const total = recipients.length;

  if (total > 0 && read === total) return { label: `Read by all ${total} recipients`, read: true, symbol: '✓✓' };
  if (total > 0 && delivered === total) return { label: `Delivered to all ${total} recipients`, read: false, symbol: '✓✓' };

  const partial = total > 1 ? ` Delivered ${delivered} of ${total}; read ${read} of ${total}.` : '';
  return { label: `Sent.${partial}`, read: false, symbol: '✓' };
}
