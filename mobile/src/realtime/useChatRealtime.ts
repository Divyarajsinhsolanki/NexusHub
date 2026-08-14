import { useRealtimeChannel } from './RealtimeProvider';
import type { RealtimeEvent } from './types';

export type ChatEvent = RealtimeEvent;

export function useChatRealtime(conversationId: number | undefined, onEvent: (event: ChatEvent) => void) {
  return useRealtimeChannel({ channel: 'ChatChannel', ...(conversationId ? { conversation_id: conversationId } : {}) }, onEvent);
}
