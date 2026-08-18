export const PUSH_SCHEMA_VERSION = 2;
export const BACKGROUND_NOTIFICATION_TASK = 'nexus-background-notification-v2';

export const NOTIFICATION_CHANNELS = {
  chat: 'nexus_chat_v1',
  audioCall: 'nexus_audio_calls_v1',
  videoCall: 'nexus_video_calls_v1',
  work: 'nexus_work_v1',
  social: 'nexus_social_v1',
  reminders: 'nexus_reminders_v1',
} as const;

export const NOTIFICATION_SOUNDS = {
  chat: 'nexus_chat.wav',
  audioCall: 'nexus_audio_call.wav',
  videoCall: 'nexus_video_call.wav',
  work: 'nexus_work.wav',
  social: 'nexus_social.wav',
  reminders: 'nexus_reminder.wav',
} as const;

export const NOTIFICATION_CATEGORIES = {
  chat: 'chat_message_actions',
  incomingCall: 'incoming_call_actions',
  missedCall: 'missed_call_actions',
} as const;

export const NOTIFICATION_ACTIONS = {
  reply: 'nexus_reply',
  markRead: 'nexus_mark_read',
  answer: 'nexus_answer',
  decline: 'nexus_decline',
  callBack: 'nexus_call_back',
} as const;

export type NexusPushData = {
  type?: string;
  event_type?: string;
  category?: string;
  deep_link?: string;
  notification_id?: number | string;
  conversation_id?: number | string;
  message_id?: number | string;
  call_id?: number | string;
  call_type?: 'audio' | 'video';
  project_id?: number | string;
  task_id?: number | string;
  issue_id?: number | string;
  post_id?: number | string;
  event_id?: number | string;
};

export function numericPushValue(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}
