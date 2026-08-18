import * as Crypto from 'expo-crypto';
import * as Notifications from 'expo-notifications';

import { endpoints } from '../api/endpoints';
import { normalizeMobileDeepLink } from '../navigation/deepLinks';
import {
  enqueueNotificationAction,
  markNotificationActionProcessed,
  notificationActionWasProcessed,
  pendingNotificationActions,
  type StoredNotificationAction,
} from '../storage/database';
import { NOTIFICATION_ACTIONS, numericPushValue, type NexusPushData } from './constants';

export type NotificationActionResult = { deepLink: string | null; performed: boolean };

export function storedActionFromResponse(response: Notifications.NotificationResponse): StoredNotificationAction {
  const request = response.notification.request;
  const body = response.userText?.trim();
  return {
    actionKey: [request.identifier, response.actionIdentifier, body || ''].join(':'),
    actionIdentifier: response.actionIdentifier,
    data: {
      ...(request.content.data as Record<string, unknown>),
      ...(body && response.actionIdentifier === NOTIFICATION_ACTIONS.reply ? { notification_client_id: `push-${Crypto.randomUUID()}` } : {}),
    },
    userText: body || undefined,
  };
}

export async function processNotificationResponse(response: Notifications.NotificationResponse, queueOnFailure = true) {
  return processStoredNotificationAction(storedActionFromResponse(response), queueOnFailure);
}

export async function processStoredNotificationAction(action: StoredNotificationAction, queueOnFailure = true): Promise<NotificationActionResult> {
  if (await notificationActionWasProcessed(action.actionKey)) {
    return { deepLink: deepLinkForAction(action), performed: false };
  }

  try {
    await performAction(action);
    await markNotificationActionProcessed(action.actionKey);
    return { deepLink: deepLinkForAction(action), performed: true };
  } catch (error) {
    if (queueOnFailure) await enqueueNotificationAction(action);
    throw error;
  }
}

export async function retryPendingNotificationActions() {
  const actions = await pendingNotificationActions();
  for (const action of actions) {
    try {
      await processStoredNotificationAction(action, false);
    } catch {
      // The encrypted queue remains intact until connectivity or authentication recovers.
    }
  }
}

async function performAction(action: StoredNotificationAction) {
  const data = action.data as NexusPushData;
  const conversationId = numericPushValue(data.conversation_id);
  const callId = numericPushValue(data.call_id);
  const notificationId = numericPushValue(data.notification_id);

  switch (action.actionIdentifier) {
    case NOTIFICATION_ACTIONS.reply: {
      if (!conversationId || !action.userText) throw new Error('This reply is missing its conversation or message.');
      const clientId = typeof action.data.notification_client_id === 'string' ? action.data.notification_client_id : `push-${Crypto.randomUUID()}`;
      await endpoints.createTextMessage(conversationId, action.userText.slice(0, 4_000), clientId);
      if (notificationId) await endpoints.readNotification(notificationId);
      return;
    }
    case NOTIFICATION_ACTIONS.markRead:
      if (notificationId) await endpoints.readNotification(notificationId);
      return;
    case NOTIFICATION_ACTIONS.answer:
      if (!callId) throw new Error('This call is no longer available.');
      await endpoints.callAction(callId, 'ack_ring');
      return;
    case NOTIFICATION_ACTIONS.decline:
      if (!callId) throw new Error('This call is no longer available.');
      await endpoints.callAction(callId, 'decline');
      return;
    case NOTIFICATION_ACTIONS.callBack:
    case Notifications.DEFAULT_ACTION_IDENTIFIER:
      return;
    default:
      return;
  }
}

function deepLinkForAction(action: StoredNotificationAction) {
  const data = action.data as NexusPushData;
  if (action.actionIdentifier === NOTIFICATION_ACTIONS.markRead || action.actionIdentifier === NOTIFICATION_ACTIONS.decline) return null;
  if (action.actionIdentifier === NOTIFICATION_ACTIONS.answer) {
    const callId = numericPushValue(data.call_id);
    if (callId) return `/call/${callId}${data.call_type ? `?type=${data.call_type}` : ''}`;
  }
  return normalizeMobileDeepLink(data.deep_link);
}
