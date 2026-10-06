export const browserNotificationPermission = () =>
  typeof window !== 'undefined' && 'Notification' in window
    ? window.Notification.permission
    : 'unsupported';

export const notificationPath = (notification) => {
  if (typeof notification.deep_link === 'string' && /^\/(?!\/)/.test(notification.deep_link)) return notification.deep_link;
  const metadata = notification.metadata || {};
  if (metadata.conversation_id) return `/chat/${metadata.conversation_id}`;
  if (metadata.project_id) return '/projects';
  if (notification.notifiable_type === 'Project') return '/projects';
  if (notification.notifiable_type === 'Event') return '/calendar';
  return null;
};

export const showBrowserNotification = (notification, navigate) => {
  if (!notification?.message || notification.read_at || browserNotificationPermission() !== 'granted') return;
  try {
    const alert = new window.Notification(notification.title || 'NexusHub', {
      body: notification.message,
      tag: `nexus-notification-${notification.id}`,
    });
    alert.onclick = () => {
      window.focus();
      const path = notificationPath(notification);
      if (path) navigate(path);
      alert.close();
    };
    return alert;
  } catch {
    // Some mobile browsers expose Notification but require a service worker.
    return undefined;
  }
};
