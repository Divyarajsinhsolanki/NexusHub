import { describe, expect, test } from '@jest/globals';

import { isViewingNotificationTarget, notificationBehavior, setVisibleNotificationRoute } from './presentation';

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
    setVisibleNotificationRoute('/projects/7', { taskId: '1' });
    expect(isViewingNotificationTarget('/projects/7?taskId=2')).toBe(false);
    expect(notificationBehavior({ request: { content: { data: { type: 'call_ringing', deep_link: '/call/9' } } } } as never)).toMatchObject({
      shouldPlaySound: true,
      shouldShowBanner: true,
    });
  });
});
