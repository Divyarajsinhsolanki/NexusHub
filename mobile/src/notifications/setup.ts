import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import {
  NOTIFICATION_ACTIONS,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_SOUNDS,
} from './constants';

let setupPromise: Promise<void> | null = null;

export function setupNotificationPresentation() {
  if (setupPromise) return setupPromise;
  setupPromise = configureNotifications().catch((error) => {
    setupPromise = null;
    throw error;
  });
  return setupPromise;
}

async function configureNotifications() {
  if (Platform.OS === 'android') {
    await Promise.all([
      channel(NOTIFICATION_CHANNELS.chat, 'Chat', 'Messages, mentions, and reactions', Notifications.AndroidImportance.HIGH, NOTIFICATION_SOUNDS.chat, [0, 160, 90, 160]),
      channel(NOTIFICATION_CHANNELS.audioCall, 'Audio calls', 'Incoming and missed audio calls', Notifications.AndroidImportance.MAX, NOTIFICATION_SOUNDS.audioCall, [0, 420, 180, 420, 180, 420]),
      channel(NOTIFICATION_CHANNELS.videoCall, 'Video calls', 'Incoming and missed video calls', Notifications.AndroidImportance.MAX, NOTIFICATION_SOUNDS.videoCall, [0, 520, 150, 240, 150, 520]),
      channel(NOTIFICATION_CHANNELS.work, 'Work', 'Projects, tasks, issues, and teams', Notifications.AndroidImportance.DEFAULT, NOTIFICATION_SOUNDS.work, [0, 180]),
      channel(NOTIFICATION_CHANNELS.social, 'Social activity', 'Likes, comments, and endorsements', Notifications.AndroidImportance.DEFAULT, NOTIFICATION_SOUNDS.social, [0, 100, 70, 100]),
      channel(NOTIFICATION_CHANNELS.reminders, 'Reminders', 'Calendar and event reminders', Notifications.AndroidImportance.HIGH, NOTIFICATION_SOUNDS.reminders, [0, 240, 100, 240]),
    ]);
  }

  const headlessAction = Platform.OS === 'android';
  await Promise.all([
    Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORIES.chat, [
      {
        identifier: NOTIFICATION_ACTIONS.reply,
        buttonTitle: 'Reply',
        options: { opensAppToForeground: !headlessAction },
        textInput: { submitButtonTitle: 'Send', placeholder: 'Write a reply' },
      },
      {
        identifier: NOTIFICATION_ACTIONS.markRead,
        buttonTitle: 'Mark read',
        options: { opensAppToForeground: !headlessAction },
      },
    ]),
    Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORIES.incomingCall, [
      {
        identifier: NOTIFICATION_ACTIONS.answer,
        buttonTitle: 'Answer',
        options: { opensAppToForeground: true },
      },
      {
        identifier: NOTIFICATION_ACTIONS.decline,
        buttonTitle: 'Decline',
        options: { isDestructive: true, opensAppToForeground: !headlessAction },
      },
    ]),
    Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORIES.missedCall, [
      {
        identifier: NOTIFICATION_ACTIONS.callBack,
        buttonTitle: 'Call back',
        options: { opensAppToForeground: true },
      },
    ]),
  ]);
}

function channel(
  id: string,
  name: string,
  description: string,
  importance: Notifications.AndroidImportance,
  sound: string,
  vibrationPattern: number[],
) {
  return Notifications.setNotificationChannelAsync(id, {
    name,
    description,
    importance,
    vibrationPattern,
    lightColor: '#2563eb',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    sound,
  });
}
