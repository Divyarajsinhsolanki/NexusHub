// Lifecycle updates must never resurrect deleted content or overwrite a newer edit.
export function mergeMessage(current, incoming) {
  if (!current) return incoming;
  if (current.deleted_at && !incoming.deleted_at) return current;
  if (Date.parse(current.updated_at || current.created_at) > Date.parse(incoming.updated_at || incoming.created_at)) return current;
  return { ...current, ...incoming, ...(incoming.deleted_at ? { body: "Message deleted", attachments: [], reactions: {}, reacted_emojis: [] } : {}) };
}

export function patchMessageRows(rows = [], incoming) {
  return rows.map((message) => {
    if (Number(message.id) === Number(incoming.id)) return mergeMessage(message, incoming);
    if (Number(message.reply_to?.id) !== Number(incoming.id)) return message;
    if (message.reply_to.deleted_at && !incoming.deleted_at) return message;
    if (Date.parse(message.reply_to.updated_at) > Date.parse(incoming.updated_at || incoming.created_at)) return message;
    return { ...message, reply_to: { ...message.reply_to, body: incoming.deleted_at ? "Message deleted" : incoming.body,
      deleted_at: incoming.deleted_at, updated_at: incoming.updated_at, attachment_count: incoming.deleted_at ? 0 : incoming.attachments?.length || 0 } };
  });
}
export const canChangeMessage = (message, userId, now = Date.now()) =>
  Number(message.user_id) === Number(userId) && message.id > 0 && !message.deleted_at &&
  message.message_type !== "system" && now < (message.editable_until ? Date.parse(message.editable_until) : Date.parse(message.created_at) + 900000);

let draftGeneration = 0;
export const getDraftGeneration = () => draftGeneration;
export const DRAFT_PREFIX = "nexus-chat-draft:";
export const chatDraftKey = (user, conversationId) => user?.id && conversationId ? `${DRAFT_PREFIX}${user.id}:${user.workspace?.id || user.workspace_id || "default"}:${conversationId}` : null;
export function readChatDraft(key) {
  try { return key ? JSON.parse(localStorage.getItem(key) || "null") : null; } catch { return null; }
}
export function writeChatDraft(key, draft, generation = draftGeneration) {
  if (!key || generation !== draftGeneration) return;
  try {
    if (!draft.body && !draft.replyTo) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify({ body: draft.body, replyTo: draft.replyTo, clientId: draft.clientId }));
  } catch { /* Storage quota/private browsing must not prevent sending. */ }
}
export function clearChatDrafts() {
  ++draftGeneration;
  try { Object.keys(localStorage).filter((key) => key.startsWith(DRAFT_PREFIX)).forEach((key) => localStorage.removeItem(key)); } catch {}
}
