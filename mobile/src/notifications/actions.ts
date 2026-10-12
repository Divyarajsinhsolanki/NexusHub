import * as Crypto from 'expo-crypto';
import * as Notifications from 'expo-notifications';

import { endpoints } from '../api/endpoints';
import { normalizeMobileDeepLink } from '../navigation/deepLinks';
import {
  enqueueNotificationAction,
  markNotificationActionProcessed,
  notificationActionWasProcessed,
  pendingNotificationActions,
  removePendingNotificationAction,
  type StoredNotificationAction,
} from '../storage/database';
import { NOTIFICATION_ACTIONS, numericPushValue, type NexusPushData } from './constants';

export type NotificationActionResult = { deepLink: string | null; performed: boolean };

export async function storedActionFromResponse(response: Notifications.NotificationResponse): Promise<StoredNotificationAction> {
  const request = response.notification.request;
  const body = response.userText?.trim();
  const actionKey = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, JSON.stringify([request.identifier, response.actionIdentifier, request.content.data?.recipient_user_id, body || '']));
  return {
    actionKey,
    createdAt: Date.now(),
    notificationIdentifier: request.identifier,
    actionIdentifier: response.actionIdentifier,
    data: {
      ...(request.content.data as Record<string, unknown>),
      ...(body && response.actionIdentifier === NOTIFICATION_ACTIONS.reply ? { notification_client_id: `push-${actionKey}` } : {}),
    },
    userText: body || undefined,
  };
}

export async function processNotificationResponse(response: Notifications.NotificationResponse, queueOnFailure = true) {
  return processStoredNotificationAction(await storedActionFromResponse(response), queueOnFailure);
}

const inFlight = new Map<string, Promise<NotificationActionResult>>();
export class NotificationReplyError extends Error {
  constructor(message: string, public readonly queued: boolean) { super(message); }
}

export function processStoredNotificationAction(action: StoredNotificationAction, queueOnFailure = true): Promise<NotificationActionResult> {
  const existing = inFlight.get(action.actionKey);
  if (existing) return existing;
  const operation = runStoredAction(action, queueOnFailure).finally(() => inFlight.delete(action.actionKey));
  inFlight.set(action.actionKey, operation);
  return operation;
}

async function runStoredAction(action: StoredNotificationAction, queueOnFailure: boolean): Promise<NotificationActionResult> {
  const reply = action.actionIdentifier === NOTIFICATION_ACTIONS.reply;
  if (reply && !action.userText?.trim()) return { deepLink: null, performed: false };
  if (reply && (action.userText!.length > 4_000 || !numericPushValue(action.data.notification_id))) {
    await removePendingNotificationAction(action.actionKey);
    throw new NotificationReplyError('This reply needs a valid message notification and at most 4,000 characters.', false);
  }
  if (reply && action.createdAt && Date.now() - action.createdAt > 24 * 60 * 60 * 1000) {
    await removePendingNotificationAction(action.actionKey);
    throw new NotificationReplyError('This saved reply has expired. Open the conversation to send it.', false);
  }
  if (await notificationActionWasProcessed(action.actionKey)) {
    await removePendingNotificationAction(action.actionKey);
    return { deepLink: deepLinkForAction(action), performed: false };
  }
  // Persist before making the request: the OS can stop a background task at any point.
  if (reply && queueOnFailure) {
    try { await enqueueNotificationAction(action); }
    catch { throw new NotificationReplyError('Your reply could not be saved. Open the conversation and send it there.', false); }
  }
  try {
    await performAction(action);
    await markNotificationActionProcessed(action.actionKey);
    if (reply && action.notificationIdentifier) {
      await Notifications.dismissNotificationAsync(action.notificationIdentifier).catch(() => undefined);
    }
    return { deepLink: deepLinkForAction(action), performed: true };
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    const retryable = !status || status === 401 || status === 408 || status === 429 || status >= 500;
    if (!retryable) await removePendingNotificationAction(action.actionKey);
    else if (queueOnFailure && !reply) await enqueueNotificationAction(action);
    if (reply) throw new NotificationReplyError(retryable ? 'Your reply is saved and will retry when you reopen the app or reconnect.' : 'This reply could not be sent. The message or your access may have changed; open the conversation.', retryable);
    throw error;
  }
}

export async function retryPendingNotificationActions() {
  const actions = await pendingNotificationActions();
  const refreshedLinks: string[] = [];
  for (const action of actions) {
    try {
      await processStoredNotificationAction(action, false);
      if (typeof action.data.deep_link === 'string') refreshedLinks.push(action.data.deep_link);
    } catch {
      // The encrypted queue remains intact until connectivity or authentication recovers.
    }
  }
  return refreshedLinks;
}

async function performAction(action: StoredNotificationAction) {
  const data = action.data as NexusPushData;
  const callId = numericPushValue(data.call_id);
  const notificationId = numericPushValue(data.notification_id);

  switch (action.actionIdentifier) {
    case NOTIFICATION_ACTIONS.reply: {
      if (!notificationId || !action.userText) throw new Error('This reply is missing its notification or message.');
      const clientId = typeof action.data.notification_client_id === 'string' ? action.data.notification_client_id : `push-${await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, action.actionKey)}`;
      const result = await endpoints.replyToNotification(notificationId, action.userText.trim(), clientId);
      await Notifications.setBadgeCountAsync(result.unread_count).catch(() => undefined);
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
  if (action.actionIdentifier === NOTIFICATION_ACTIONS.reply || action.actionIdentifier === NOTIFICATION_ACTIONS.markRead || action.actionIdentifier === NOTIFICATION_ACTIONS.decline) return null;
  if (action.actionIdentifier === NOTIFICATION_ACTIONS.answer) {
    const callId = numericPushValue(data.call_id);
    if (callId) return `/call/${callId}${data.call_type ? `?type=${data.call_type}` : ''}`;
  }
  return normalizeMobileDeepLink(data.deep_link);
}
