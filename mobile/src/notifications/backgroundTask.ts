import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

import { processNotificationResponse } from './actions';
import { BACKGROUND_NOTIFICATION_TASK } from './constants';

if (!TaskManager.isTaskDefined(BACKGROUND_NOTIFICATION_TASK)) {
  TaskManager.defineTask<Notifications.NotificationTaskPayload>(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
    if (error || !isNotificationResponse(data)) return;
    try {
      await processNotificationResponse(data);
    } catch {
      // Failed actions are persisted to the encrypted offline queue by the action processor.
    }
  });
}

void Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK).catch(() => undefined);

function isNotificationResponse(payload: Notifications.NotificationTaskPayload): payload is Notifications.NotificationResponse {
  return Boolean(payload && typeof payload === 'object' && 'actionIdentifier' in payload && 'notification' in payload);
}
