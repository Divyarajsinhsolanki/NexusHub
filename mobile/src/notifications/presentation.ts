import type * as Notifications from 'expo-notifications';

import { normalizeMobileDeepLink } from '../navigation/deepLinks';
import type { NexusPushData } from './constants';

let visibleRoute = '/';

export function setVisibleNotificationRoute(pathname: string, params: Record<string, string | string[] | undefined> = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach((item) => search.append(key, item));
    else if (value != null) search.set(key, value);
  });
  visibleRoute = `${pathname}${search.size ? `?${search}` : ''}`;
}

export function notificationBehavior(notification: Notifications.Notification): Notifications.NotificationBehavior {
  const data = notification.request.content.data as NexusPushData;
  const incomingCall = data.event_type === 'call_ringing' || data.type === 'call_ringing';
  const suppress = !incomingCall && isViewingNotificationTarget(data.deep_link);
  return {
    shouldPlaySound: !suppress,
    shouldSetBadge: true,
    shouldShowBanner: !suppress,
    shouldShowList: !suppress,
  };
}

export function isViewingNotificationTarget(deepLink: unknown) {
  const target = normalizeMobileDeepLink(deepLink);
  if (!target) return false;
  const current = parseRoute(visibleRoute);
  const destination = parseRoute(target);
  if (current.pathname !== destination.pathname) return false;

  for (const key of ['taskId', 'issueId', 'eventId']) {
    const expected = destination.searchParams.get(key);
    if (expected && current.searchParams.get(key) !== expected) return false;
  }
  return true;
}

function parseRoute(value: string) {
  return new URL(value, 'https://nexushub.local');
}
