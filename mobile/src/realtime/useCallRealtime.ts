import type { ChatEvent } from './useChatRealtime';
import { useRealtimeChannel } from './RealtimeProvider';

export function useCallRealtime(publicId: string | undefined, onEvent: (event: ChatEvent) => void) {
  return useRealtimeChannel(publicId ? { channel: 'CallChannel', public_id: publicId } : undefined, onEvent, Boolean(publicId));
}
