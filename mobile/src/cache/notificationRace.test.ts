import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test, jest } from '@jest/globals';
import { endpoints } from '../api/endpoints';
import type { Notification, ApiEnvelope } from '../api/types';
import { fetchNotificationPage, prependNotification, markCachedNotificationsRead, mobileQueryKeys } from './mobileCache';

const notice = (id: number) => ({ id, created_at: '2026-10-08T00:00:00Z', read_at: null } as Notification);

describe('notification load races', () => {
  test('retains live arrivals without duplicates during the initial fetch', async () => {
    const client = new QueryClient();
    let resolve!: (value: ApiEnvelope<Notification[]>) => void;
    const mock = jest.spyOn(endpoints, 'notifications').mockImplementation(() => new Promise(done => { resolve = done; }));
    try {
      const loading = fetchNotificationPage(client);
      prependNotification(client, notice(3));
      prependNotification(client, notice(2));
      resolve({ data: [notice(2), notice(1)], meta: { unread_count: 2 } });
      const result = await loading;
      expect(result.data.map(row => row.id)).toEqual([3, 2, 1]);
      expect(result.meta?.unread_count).toBe(3);
    } finally { mock.mockRestore(); client.clear(); }
  });
  test('preserves a read acknowledgement received during a stale fetch', async () => {
    const client = new QueryClient();
    client.setQueryData(mobileQueryKeys.notifications, { pages: [{ data: [notice(1)] }], pageParams: [undefined] });
    let resolve!: (value: ApiEnvelope<Notification[]>) => void;
    const mock = jest.spyOn(endpoints, 'notifications').mockImplementation(() => new Promise(done => { resolve = done; }));
    try {
      const loading = fetchNotificationPage(client);
      markCachedNotificationsRead(client, { notification_id: 1, read_at: '2026-10-09T01:00:00Z', unread_count: 0 });
      resolve({ data: [notice(1)], meta: { unread_count: 1 } });
      const result = await loading;
      expect(result.data[0].read_at).toBe('2026-10-09T01:00:00Z');
      expect(result.meta?.unread_count).toBe(0);
      client.clear();
      expect((await fetchNotificationPageAfterReset()).data[0].read_at).toBeNull();
    } finally { mock.mockRestore(); client.clear(); }
    async function fetchNotificationPageAfterReset() {
      const pending = fetchNotificationPage(client);
      resolve({ data: [notice(1)], meta: { unread_count: 1 } });
      return pending;
    }
  });
});
