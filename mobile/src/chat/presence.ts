import { useEffect, useState } from 'react';
import type { ConversationParticipant } from '../api/types';

export function isParticipantOnline(participant: ConversationParticipant, now = Date.now()) {
  const lastSeen = Date.parse(participant.last_seen_at || '');
  return participant.online !== false && Number.isFinite(lastSeen) && now - lastSeen <= 120_000;
}

export function usePresenceNow() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
