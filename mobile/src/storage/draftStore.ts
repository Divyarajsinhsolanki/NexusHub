import { getDatabase } from './database';

const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type DraftIdentity = {
  key: string;
  userId: number;
  workspaceId: number;
};

function scopedKey(identity: DraftIdentity) {
  return `${identity.workspaceId}:${identity.userId}:${identity.key}`;
}

export const draftStore = {
  async get<T>(identity: DraftIdentity): Promise<T | null> {
    const database = await getDatabase();
    if (!database) return null;
    await database.runAsync('DELETE FROM drafts WHERE expires_at <= ?', Date.now());
    const row = await database.getFirstAsync<{ payload: string }>(
      'SELECT payload FROM drafts WHERE draft_key = ?',
      scopedKey(identity),
    );
    return row ? (JSON.parse(row.payload) as T) : null;
  },
  async set<T>(identity: DraftIdentity, value: T) {
    const database = await getDatabase();
    if (!database) return;
    const now = Date.now();
    await database.runAsync(
      `INSERT INTO drafts(draft_key, user_id, workspace_id, payload, expires_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(draft_key) DO UPDATE SET
         payload = excluded.payload,
         expires_at = excluded.expires_at,
         updated_at = excluded.updated_at`,
      scopedKey(identity),
      identity.userId,
      identity.workspaceId,
      JSON.stringify(value),
      now + DRAFT_TTL_MS,
      now,
    );
  },
  async remove(identity: DraftIdentity) {
    const database = await getDatabase();
    if (!database) return;
    await database.runAsync('DELETE FROM drafts WHERE draft_key = ?', scopedKey(identity));
  },
};
