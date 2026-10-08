import type { Notification } from '../api/types';
export function mergeNotificationRows(previous: Notification[], incoming: Notification[]) {
  const rows = new Map(previous.map(notice => [notice.id, notice]));
  incoming.forEach(notice => rows.set(notice.id, { ...rows.get(notice.id), ...notice, read_at: rows.get(notice.id)?.read_at || notice.read_at }));
  return [...rows.values()].sort((a, b) => b.id - a.id);
}
