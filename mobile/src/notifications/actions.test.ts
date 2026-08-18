import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { endpoints } from '../api/endpoints';
import { markNotificationActionProcessed, notificationActionWasProcessed } from '../storage/database';
import { processStoredNotificationAction } from './actions';
import { NOTIFICATION_ACTIONS } from './constants';

jest.mock('../api/endpoints', () => ({
  endpoints: {
    callAction: jest.fn(),
    createTextMessage: jest.fn(),
    readNotification: jest.fn(),
  },
}));

jest.mock('../storage/database', () => ({
  enqueueNotificationAction: jest.fn(),
  markNotificationActionProcessed: jest.fn(),
  notificationActionWasProcessed: jest.fn(),
  pendingNotificationActions: jest.fn(async () => []),
}));

describe('notification actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (notificationActionWasProcessed as jest.MockedFunction<typeof notificationActionWasProcessed>).mockResolvedValue(false);
    (markNotificationActionProcessed as jest.MockedFunction<typeof markNotificationActionProcessed>).mockResolvedValue(undefined);
  });

  test('sends an inline reply with its stable idempotency key and marks the notification read', async () => {
    (endpoints.createTextMessage as jest.MockedFunction<typeof endpoints.createTextMessage>).mockResolvedValue({ id: 8 } as never);
    (endpoints.readNotification as jest.MockedFunction<typeof endpoints.readNotification>).mockResolvedValue({ id: 3 } as never);

    await processStoredNotificationAction({
      actionKey: 'response:reply',
      actionIdentifier: NOTIFICATION_ACTIONS.reply,
      data: { conversation_id: 4, notification_id: 3, notification_client_id: 'push-stable-id' },
      userText: 'On it',
    });

    expect(endpoints.createTextMessage).toHaveBeenCalledWith(4, 'On it', 'push-stable-id');
    expect(endpoints.readNotification).toHaveBeenCalledWith(3);
    expect(markNotificationActionProcessed).toHaveBeenCalledWith('response:reply');
  });

  test('declines a call idempotently without opening a route', async () => {
    (endpoints.callAction as jest.MockedFunction<typeof endpoints.callAction>).mockResolvedValue({ call_session: {} } as never);
    const result = await processStoredNotificationAction({ actionKey: 'response:decline', actionIdentifier: NOTIFICATION_ACTIONS.decline, data: { call_id: 19 } });
    expect(endpoints.callAction).toHaveBeenCalledWith(19, 'decline');
    expect(result.deepLink).toBeNull();
  });
});
