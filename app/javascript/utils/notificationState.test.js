import { describe, it, expect } from 'vitest';
import { mergeNotifications, NotificationReadState } from './notificationState';
describe('notification response races', () => {
  it('retains realtime arrivals and deduplicates an overlapping initial response', () => {
    const live = [{ id: 3, read_at: null }, { id: 2, read_at: null }];
    expect(mergeNotifications(live, [{ id: 2, read_at: null }, { id: 1, read_at: null }]).map(row => row.id)).toEqual([3, 2, 1]);
  });
  it('does not resurrect a read notification from a stale response', () => {
    const reads = new NotificationReadState();
    reads.record({ notification_ids: [2], read_at: '2026-10-09T01:00:00Z' });
    expect(reads.apply(mergeNotifications([], [{ id: 2, read_at: null }]))[0].read_at).toBe('2026-10-09T01:00:00Z');
    expect(mergeNotifications([{ id: 2, read_at: 'read' }], [{ id: 2, read_at: null }])[0].read_at).toBe('read');
  });
  it('keeps notifications arriving after mark-all unread', () => {
    const reads = new NotificationReadState();
    reads.record({ read_at: '2026-10-09T01:00:00Z' });
    const rows = reads.apply([{ id: 1, created_at: '2026-10-09T00:00:00Z' }, { id: 2, created_at: '2026-10-09T02:00:00Z' }]);
    expect(rows[0].read_at).toBeTruthy();
    expect(rows[1].read_at).toBeNull();
  });
});
