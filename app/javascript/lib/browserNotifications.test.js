// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserNotificationPermission, notificationPath, showBrowserNotification } from './browserNotifications';

afterEach(() => vi.unstubAllGlobals());

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
