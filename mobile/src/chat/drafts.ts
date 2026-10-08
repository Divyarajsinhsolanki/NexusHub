import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Message } from '../api/types';

const PREFIX = 'nexus-chat-draft:';
let generation = 0;
let writes: Promise<unknown> = Promise.resolve();
type Draft = { body: string; replyTo: Message | null; clientId?: string };
export async function clearChatDrafts() {
  ++generation;
  await writes.catch(() => undefined);
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(PREFIX));
  await AsyncStorage.multiRemove(keys);
}
export function useChatDraft(userId: number | undefined, workspaceId: number | undefined, conversationId: number) {
  const key = `${PREFIX}${userId}:${workspaceId || 'default'}:${conversationId}`;
  const [draft, setDraft] = useState<Draft>({ body: '', replyTo: null });
  const current = useRef({ key, value: draft, dirty: false, generation });
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    const state = { key, value: { body: '', replyTo: null } as Draft, dirty: false, generation };
    current.current = state;
    setDraft(state.value);
    setReady(false);
    AsyncStorage.getItem(key).then((raw) => {
      if (!active || state.dirty) return;
      try {
        const parsed = raw ? JSON.parse(raw) : {};
        state.value = { body: typeof parsed.body === 'string' ? parsed.body : '', replyTo: parsed.replyTo?.id ? parsed.replyTo : null, clientId: typeof parsed.clientId === 'string' ? parsed.clientId : undefined };
        setDraft(state.value);
      } catch {}
    }).catch(() => undefined).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, [key]);
  const save = useCallback(() => {
    const state = current.current;
    if (!state.dirty || state.generation !== generation || !userId) return;
    const value = state.value;
    writes = writes.catch(() => undefined).then(() => {
      if (state.generation !== generation) return;
      return value.body || value.replyTo ? AsyncStorage.setItem(state.key, JSON.stringify(value)) : AsyncStorage.removeItem(state.key);
    }).catch(() => undefined);
  }, [userId]);
  useEffect(() => {
    const timer = setTimeout(save, 250);
    return () => clearTimeout(timer);
  }, [draft, save]);
  useEffect(() => () => save(), [save]);
  const change = useCallback((patch: Partial<Draft>) => {
    current.current.dirty = true;
    current.current.value = { ...current.current.value, ...patch };
    setDraft(current.current.value);
  }, []);
  return { ...draft, ready, setClientId: (clientId: string | undefined) => change({ clientId }), setBody: (body: string) => change({ body, clientId: undefined }), setReplyTo: (replyTo: Message | null) => change({ replyTo, ...(current.current.value.replyTo?.id !== replyTo?.id ? { clientId: undefined } : {}) }) };
}
