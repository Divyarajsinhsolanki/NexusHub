import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';

import { getDatabase } from './database';

const CACHE_KEY = 'react-query';

export const queryPersister: Persister = {
  async persistClient(client: PersistedClient) {
    const database = await getDatabase();
    if (!database) return;
    await database.runAsync(
      `INSERT INTO app_cache(cache_key, payload, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
      CACHE_KEY,
      JSON.stringify(client),
      Date.now(),
    );
  },
  async restoreClient() {
    const database = await getDatabase();
    if (!database) return undefined;
    const row = await database.getFirstAsync<{ payload: string }>(
      'SELECT payload FROM app_cache WHERE cache_key = ?',
      CACHE_KEY,
    );
    return row ? (JSON.parse(row.payload) as PersistedClient) : undefined;
  },
  async removeClient() {
    const database = await getDatabase();
    if (!database) return;
    await database.runAsync('DELETE FROM app_cache WHERE cache_key = ?', CACHE_KEY);
  },
};
