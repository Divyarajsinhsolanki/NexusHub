export function mergeNotifications(previous, incoming) {
  const merged = new Map(previous.map(notice => [String(notice.id), notice]));
  incoming.forEach(notice => {
    const existing = merged.get(String(notice.id));
    merged.set(String(notice.id), { ...existing, ...notice, read_at: existing?.read_at || notice.read_at });
  });
  return [...merged.values()].sort((a, b) => Number(b.id) - Number(a.id));
}

// Keep read acknowledgements even when unread filters remove their rows.
export class NotificationReadState {
  ids = new Map();
  allReadAt = null;
  record(event) {
    const at = event.read_at || new Date().toISOString();
    if (Array.isArray(event.notification_ids)) event.notification_ids.forEach(id => this.ids.set(String(id), at));
    else if (event.notification_id) this.ids.set(String(event.notification_id), at);
    else this.allReadAt = at;
  }
  apply(notices) {
    return notices.map(notice => ({ ...notice, read_at: notice.read_at || this.ids.get(String(notice.id)) ||
      (this.allReadAt && new Date(notice.created_at) <= new Date(this.allReadAt) ? this.allReadAt : null) }));
  }
}
