import type { CallSession, Message, Notification } from '../api/types';

export type RealtimeEvent = {
  type: string;
  conversation_id?: number;
  message?: Message | Record<string, unknown>;
  message_id?: number;
  notification?: Notification | Record<string, unknown>;
  call_session?: CallSession | Record<string, unknown>;
  user_id?: number;
  user_name?: string;
  is_typing?: boolean;
  delivered_message_id?: number | null;
  read_message_id?: number | null;
  delivered_at?: string | null;
  read_at?: string | null;
  reactions?: Record<string, number>;
  [key: string]: unknown;
};

export type RealtimeState = 'idle' | 'connecting' | 'connected' | 'disconnected';
export type ChannelIdentifier = { channel: 'ChatChannel'; conversation_id?: number } | { channel: 'CallChannel'; public_id: string };
