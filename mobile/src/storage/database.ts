import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

const DATABASE_NAME = 'nexus-hub.db';
const DATABASE_KEY = 'nexus-hub.database-key';

let databasePromise: ReturnType<typeof SQLite.openDatabaseAsync> | null = null;

export async function getDatabase() {
  if (Platform.OS === 'web') return null;
  if (databasePromise) return databasePromise;

  databasePromise = initializeDatabase();
  return databasePromise;
}

async function initializeDatabase() {
  const database = await SQLite.openDatabaseAsync(DATABASE_NAME);
  let key = await SecureStore.getItemAsync(DATABASE_KEY);
  if (!key) {
    key = Crypto.randomUUID().replace(/-/g, '');
    await SecureStore.setItemAsync(DATABASE_KEY, key);
  }

  await database.execAsync(`PRAGMA key = '${key}';`);
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS app_cache (
      cache_key TEXT PRIMARY KEY NOT NULL,
      payload TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS drafts (
      draft_key TEXT PRIMARY KEY NOT NULL,
      user_id INTEGER NOT NULL,
      workspace_id INTEGER NOT NULL,
      payload TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS drafts_expiry_index ON drafts(expires_at);
    CREATE TABLE IF NOT EXISTS pending_notification_actions (
      action_key TEXT PRIMARY KEY NOT NULL,
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS processed_notification_actions (
      action_key TEXT PRIMARY KEY NOT NULL,
      processed_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS pending_notification_actions_created_index ON pending_notification_actions(created_at);
    CREATE INDEX IF NOT EXISTS processed_notification_actions_date_index ON processed_notification_actions(processed_at);
  `);
  return database;
}

export async function clearOfflineData() {
  const database = await getDatabase();
  if (!database) return;
  await database.execAsync('DELETE FROM app_cache; DELETE FROM drafts; DELETE FROM pending_notification_actions; DELETE FROM processed_notification_actions;');
}

export type StoredNotificationAction = {
  actionKey: string;
  actionIdentifier: string;
  data: Record<string, unknown>;
  userText?: string;
};

export async function enqueueNotificationAction(action: StoredNotificationAction) {
  const database = await getDatabase();
  if (!database) return;
  await database.runAsync(
    'INSERT OR REPLACE INTO pending_notification_actions (action_key, payload, created_at, attempt_count) VALUES (?, ?, ?, COALESCE((SELECT attempt_count FROM pending_notification_actions WHERE action_key = ?), 0))',
    action.actionKey,
    JSON.stringify(action),
    Date.now(),
    action.actionKey,
  );
}

export async function pendingNotificationActions(): Promise<StoredNotificationAction[]> {
  const database = await getDatabase();
  if (!database) return [];
  const rows = await database.getAllAsync<{ payload: string }>('SELECT payload FROM pending_notification_actions ORDER BY created_at ASC LIMIT 50');
  return rows.flatMap((row) => {
    try { return [JSON.parse(row.payload) as StoredNotificationAction]; } catch { return []; }
  });
}

export async function removePendingNotificationAction(actionKey: string) {
  const database = await getDatabase();
  if (!database) return;
  await database.runAsync('DELETE FROM pending_notification_actions WHERE action_key = ?', actionKey);
}

export async function notificationActionWasProcessed(actionKey: string) {
  const database = await getDatabase();
  if (!database) return false;
  return Boolean(await database.getFirstAsync('SELECT action_key FROM processed_notification_actions WHERE action_key = ? LIMIT 1', actionKey));
}

export async function markNotificationActionProcessed(actionKey: string) {
  const database = await getDatabase();
  if (!database) return;
  const staleBefore = Date.now() - 7 * 24 * 60 * 60 * 1000;
  await database.runAsync('INSERT OR REPLACE INTO processed_notification_actions (action_key, processed_at) VALUES (?, ?)', actionKey, Date.now());
  await database.runAsync('DELETE FROM processed_notification_actions WHERE processed_at < ?', staleBefore);
  await removePendingNotificationAction(actionKey);
}
