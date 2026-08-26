import type { ConversationParticipant, Message } from '../api/types';

type MessagePage = { data?: unknown } | null | undefined;

/**
 * Treat persisted and remote chat data as untrusted input. This keeps one bad
 * historic attachment or duplicate message from taking down the native list.
 */
export function normalizedMessageRows(pages: readonly MessagePage[] | null | undefined): Message[] {
  const seen = new Set<number>();
  const rows: Message[] = [];

  [...(pages || [])].reverse().forEach((page) => {
    if (!page || !Array.isArray(page.data)) return;
    page.data.forEach((value) => {
      if (!isRecord(value)) return;
      const id = Number(value.id);
      if (!Number.isFinite(id) || id === 0 || seen.has(id)) return;
      seen.add(id);

      const body = typeof value.body === 'string'
        ? value.body
        : typeof value.content === 'string' ? value.content : '';
      const attachments = Array.isArray(value.attachments)
        ? value.attachments.filter(isRecord)
        : [];
      const reactions = isRecord(value.reactions) || Array.isArray(value.reactions)
        ? value.reactions
        : undefined;

      rows.push({
        ...(value as Message),
        id,
        body,
        created_at: typeof value.created_at === 'string' ? value.created_at : new Date(0).toISOString(),
        attachments: attachments as Message['attachments'],
        reactions: reactions as Message['reactions'],
        reacted_emojis: Array.isArray(value.reacted_emojis)
          ? value.reacted_emojis.filter((emoji): emoji is string => typeof emoji === 'string')
          : [],
      });
    });
  });

  return rows;
}

export function normalizedParticipants(value: unknown): ConversationParticipant[] {
  if (!Array.isArray(value)) return [];
  return value.filter((participant): participant is ConversationParticipant => (
    isRecord(participant) && Number.isFinite(Number(participant.id))
  ));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
