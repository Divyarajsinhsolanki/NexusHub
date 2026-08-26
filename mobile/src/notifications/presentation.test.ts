import { describe, expect, test } from '@jest/globals';

import { isViewingNotificationTarget, notificationBehavior, setVisibleIncomingCall, setVisibleNotificationRoute } from './presentation';

describe('notification foreground presentation', () => {
  test('suppresses a duplicate banner while viewing the exact target', () => {
    setVisibleNotificationRoute('/projects/7/issues', { issueId: '12', filter: 'active' });

    expect(isViewingNotificationTarget('/projects/7/issues?issueId=12')).toBe(true);
    expect(notificationBehavior({ request: { content: { data: { deep_link: '/projects/7/issues?issueId=12' } } } } as never)).toMatchObject({
      shouldPlaySound: false,
      shouldShowBanner: false,
      shouldShowList: false,
    });
  });

  test('does not suppress a different selected item and always interrupts for calls', () => {
    setVisibleIncomingCall(null);
    setVisibleNotificationRoute('/projects/7', { taskId: '1' });
    expect(isViewingNotificationTarget('/projects/7?taskId=2')).toBe(false);
    expect(notificationBehavior({ request: { content: { data: { type: 'call_ringing', deep_link: '/call/9' } } } } as never)).toMatchObject({
      shouldPlaySound: true,
      shouldShowBanner: true,
    });
  });

  test('suppresses the duplicate system ring while the in-app call surface is visible', () => {
    setVisibleIncomingCall(9);

    expect(notificationBehavior({ request: { content: { data: { type: 'call_ringing', call_id: 9, deep_link: '/call/9' } } } } as never)).toMatchObject({
      shouldPlaySound: false,
      shouldShowBanner: false,
      shouldShowList: false,
    });

    setVisibleIncomingCall(null);
  });
});
