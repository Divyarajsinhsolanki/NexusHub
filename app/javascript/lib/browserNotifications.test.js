// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserNotificationPermission, notificationPath, notificationPresentation, notificationReadMatches, showBrowserNotification } from './browserNotifications';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('browser notifications', () => {
  it('does not prompt or display without permission', () => {
    const Notification = vi.fn();
    Notification.permission = 'default';
    vi.stubGlobal('Notification', Notification);
    expect(browserNotificationPermission()).toBe('default');
    showBrowserNotification({ id: 1, message: 'Hello' }, vi.fn());
    expect(Notification).not.toHaveBeenCalled();
  });

  it('opens a chat on click and closes the alert', () => {
    const alert = { close: vi.fn() };
    const Notification = vi.fn(function () { return alert; });
    Notification.permission = 'granted';
    vi.stubGlobal('Notification', Notification);
    vi.spyOn(window, 'focus').mockImplementation(() => {});
    const navigate = vi.fn();
    showBrowserNotification({ id: 2, message: 'New message', metadata: { conversation_id: 9 } }, navigate);
    expect(Notification).toHaveBeenCalledWith('NexusHub', expect.objectContaining({ tag: 'nexus-notification-2' }));
    alert.onclick();
    expect(navigate).toHaveBeenCalledWith('/chat/9');
    expect(alert.close).toHaveBeenCalled();
  });

  it('survives browsers that reject the notification constructor', () => {
    const Notification = vi.fn(function () { throw new Error('Unsupported'); });
    Notification.permission = 'granted';
    vi.stubGlobal('Notification', Notification);
    expect(() => showBrowserNotification({ id: 3, message: 'Assigned' }, vi.fn())).not.toThrow();
    expect(notificationPath({ notifiable_type: 'Project' })).toBe('/projects');
    expect(notificationPath({ notifiable_type: 'Event' })).toBe('/calendar');
  });
});

describe('notification presentation policy', () => {
  it('suppresses chat popups on a focused chat page but keeps work alerts', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    expect(notificationPresentation({ action: 'chat_message' }, '/chat/9')).toEqual({ toast: false, browser: false });
    expect(notificationPresentation({ action: 'task_assigned' }, '/chat/9')).toEqual({ toast: true, browser: false });
    expect(notificationPresentation({ action: 'chat_ping' }, '/projects')).toEqual({ toast: true, browser: false });
  });
  it.each(['hidden', 'visible'])('uses system notifications when chat is %s and unfocused', (visibility) => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(visibility);
    expect(notificationPresentation({ action: 'chat_message' }, '/chat/9')).toEqual({ toast: false, browser: true });
  });
});

it('translates mobile catalog links into web notification destinations', () => {
  expect(notificationPath({ deep_link: '/projects/7?taskId=2' })).toBe('/projects/7/dashboard?taskId=2');
  expect(notificationPath({ deep_link: '/call/9', metadata: { conversation_id: 3 } })).toBe('/chat/3');
  expect(notificationPath({ deep_link: '/more/calendar?eventId=8' })).toBe('/calendar?eventId=8');
  expect(notificationPath({ deep_link: '/projects/7/dashboard?tab=environments&record=2' })).toBe('/projects/7/dashboard?tab=environments&record=2');
});

it('updates only the specified notifications when chat receipts mark multiple messages read', () => {
  const event = { notification_ids: [3, 4] };
  expect(notificationReadMatches(event, { id: 3 })).toBe(true);
  expect(notificationReadMatches(event, { id: 8 })).toBe(false);
  expect(notificationReadMatches({ notification_id: 3 }, { id: 8 })).toBe(false);
  expect(notificationReadMatches({}, { id: 8 })).toBe(true);
});
