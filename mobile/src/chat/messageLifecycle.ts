import type { Message } from '../api/types';
export function mergeMessage(current: Message, incoming: Message): Message {
  if (current.deleted_at && !incoming.deleted_at) return current;
  if (Date.parse(current.updated_at || current.created_at) > Date.parse(incoming.updated_at || incoming.created_at)) return current;
  return { ...current, ...incoming, ...(incoming.deleted_at ? { body: 'Message deleted', attachments: [], reactions: {}, reacted_emojis: [] } : {}) };
}
export function patchMessageRows(rows: Message[], incoming: Message): Message[] {
  return rows.map((message) => {
    if (Number(message.id) === Number(incoming.id)) return mergeMessage(message, incoming);
    if (Number(message.reply_to?.id) !== Number(incoming.id)) return message;
    if (message.reply_to?.deleted_at && !incoming.deleted_at) return message;
    if (Date.parse(message.reply_to?.updated_at || '') > Date.parse(incoming.updated_at || incoming.created_at)) return message;
    return { ...message, reply_to: { ...message.reply_to!, body: incoming.deleted_at ? 'Message deleted' : incoming.body || '',
      deleted_at: incoming.deleted_at, updated_at: incoming.updated_at, attachment_count: incoming.deleted_at ? 0 : incoming.attachments?.length || 0 } };
  });
}
export const canChangeMessage = (message: Message, userId?: number, now = Date.now()) =>
  Number(message.user_id) === Number(userId) && message.id > 0 && !message.deleted_at &&
  message.message_type !== 'system' && now < (message.editable_until ? Date.parse(message.editable_until) : Date.parse(message.created_at) + 900000);
