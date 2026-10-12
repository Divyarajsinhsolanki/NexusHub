import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

import { NotificationReplyError, processNotificationResponse } from './actions';
import { BACKGROUND_NOTIFICATION_TASK } from './constants';

if (!TaskManager.isTaskDefined(BACKGROUND_NOTIFICATION_TASK)) {
  TaskManager.defineTask<Notifications.NotificationTaskPayload>(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
    if (error || !isNotificationResponse(data)) return;
    try {
      await processNotificationResponse(data);
    } catch (error) {
      // Android may run without any mounted UI, so explain a failed/queued send in the tray.
      if (error instanceof NotificationReplyError) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: error.queued ? 'Reply saved for retry' : 'Reply not sent',
            body: error.message,
            data: { deep_link: data.notification.request.content.data?.deep_link },
          },
          trigger: null,
        }).catch(() => undefined);
      }
    }
  });
}

void Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK).catch(() => undefined);

function isNotificationResponse(payload: Notifications.NotificationTaskPayload): payload is Notifications.NotificationResponse {
  return Boolean(payload && typeof payload === 'object' && 'actionIdentifier' in payload && 'notification' in payload);
}
