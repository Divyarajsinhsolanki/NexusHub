export const browserNotificationPermission = () =>
  typeof window !== 'undefined' && 'Notification' in window
    ? window.Notification.permission
    : 'unsupported';

export const notificationPath = (notification) => {
  const metadata = notification.metadata || {};
  if (typeof notification.deep_link === 'string' && /^\/(?!\/)/.test(notification.deep_link)) {
    const link = new URL(notification.deep_link, 'https://nexushub.local');
    // The catalog shares mobile routes; translate them to web destinations.
    if (/^\/call\/\d+$/.test(link.pathname)) return metadata.conversation_id ? `/chat/${metadata.conversation_id}` : '/chat';
    if (/^\/projects\/\d+$/.test(link.pathname)) return `${link.pathname}/dashboard${link.search}`;
    if (link.pathname === '/more/calendar') return `/calendar${link.search}`;
    if (link.pathname.startsWith('/more/teams')) return '/teams';
    if (link.pathname === '/more/profile') return `/profile${link.search}`;
    if (link.pathname === '/inbox/notifications') return '/notifications';
    if (link.pathname.startsWith('/inbox/post/')) return '/posts';
    if (link.pathname === '/inbox') return '/chat';
    if (link.pathname === '/work') return '/home';
    return notification.deep_link;
  }
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

// A focused page uses in-app alerts; background tabs use the browser surface.
export const notificationPresentation = (notification, pathname = window.location.pathname) => {
  const foreground = document.visibilityState === 'visible' && document.hasFocus();
  const chatActivity = ['chat_message', 'chat_ping', 'chat_mention', 'reacted', 'message_reacted'].includes(notification.event_type || notification.action);
  const readingChat = /^\/chat(?:\/|$)/.test(pathname) || Boolean(document.querySelector(".nexus-chat-page"));
  return { toast: foreground && !(chatActivity && readingChat), browser: !foreground };
};

export const notificationReadMatches = (event, notice) => Array.isArray(event.notification_ids)
  ? event.notification_ids.some((id) => Number(id) === Number(notice.id))
  : !event.notification_id || Number(notice.id) === Number(event.notification_id);
