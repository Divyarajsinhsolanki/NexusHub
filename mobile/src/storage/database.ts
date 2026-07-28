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
  `);
  return database;
}

export async function clearOfflineData() {
  const database = await getDatabase();
  if (!database) return;
  await database.execAsync('DELETE FROM app_cache; DELETE FROM drafts;');
}
