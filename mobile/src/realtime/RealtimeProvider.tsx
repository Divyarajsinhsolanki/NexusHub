import NetInfo from '@react-native-community/netinfo';
import * as Sentry from '@sentry/react-native';
import { type Consumer, type Subscription } from '@rails/actioncable';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { endpoints } from '../api/endpoints';
import { useAuth } from '../auth/AuthProvider';
import type { ChannelIdentifier, RealtimeEvent, RealtimeState } from './types';
import { createMobileConsumer } from './nativeConsumer';

type Listener = (event: RealtimeEvent) => void;
type ChannelRecord = {
  identifier: ChannelIdentifier;
  listeners: Set<Listener>;
  confirmed: boolean;
  queue: Array<{ action: string; payload: Record<string, unknown> }>;
  subscription?: Subscription;
};

type RealtimeActions = {
  subscribe: (identifier: ChannelIdentifier, listener: Listener) => () => void;
  perform: (identifier: ChannelIdentifier, action: string, payload?: Record<string, unknown>) => boolean;
  reconnect: () => void;
};

type RealtimeContextValue = RealtimeActions & { state: RealtimeState };

const RealtimeActionsContext = createContext<RealtimeActions | null>(null);
const RealtimeStateContext = createContext<RealtimeState | null>(null);

export function RealtimeProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const [state, setState] = useState<RealtimeState>('idle');
  const [client, setClient] = useState<SharedRealtimeClient | null>(null);
  const clientRef = useRef<SharedRealtimeClient | null>(null);

  useEffect(() => {
    if (!user) {
      clientRef.current?.destroy();
      clientRef.current = null;
      setClient(null);
      setState('idle');
      return;
    }

    const client = new SharedRealtimeClient(setState);
    clientRef.current = client;
    setClient(client);
    client.start();

    const appState = AppState.addEventListener('change', (next) => client.setActive(next === 'active'));
    const netInfo = NetInfo.addEventListener((network) => client.setOnline(Boolean(network.isConnected && network.isInternetReachable !== false)));

    return () => {
      appState.remove();
      netInfo();
      client.destroy();
      if (clientRef.current === client) {
        clientRef.current = null;
        setClient(null);
      }
    };
  }, [user?.id]);

  const subscribe = useCallback((identifier: ChannelIdentifier, listener: Listener) => {
    if (!client) return () => undefined;
    return client.subscribe(identifier, listener);
  }, [client]);

  const perform = useCallback((identifier: ChannelIdentifier, action: string, payload: Record<string, unknown> = {}) => (
    client?.perform(identifier, action, payload) || false
  ), [client]);

  const reconnect = useCallback(() => client?.reconnect(), [client]);
  const actions = useMemo(() => ({ subscribe, perform, reconnect }), [perform, reconnect, subscribe]);
  return (
    <RealtimeActionsContext.Provider value={actions}>
      <RealtimeStateContext.Provider value={state}>{children}</RealtimeStateContext.Provider>
    </RealtimeActionsContext.Provider>
  );
}

export function useRealtimeActions() {
  const value = useContext(RealtimeActionsContext);
  if (!value) throw new Error('useRealtimeActions must be used inside RealtimeProvider');
  return value;
}

export function useRealtimeState() {
  const value = useContext(RealtimeStateContext);
  if (!value) throw new Error('useRealtimeState must be used inside RealtimeProvider');
  return value;
}

export function useRealtime(): RealtimeContextValue {
  const actions = useRealtimeActions();
  const state = useRealtimeState();
  return useMemo(() => ({ ...actions, state }), [actions, state]);
}

export function useRealtimeChannel(identifier: ChannelIdentifier | undefined, onEvent: Listener, enabled = true) {
  const { subscribe } = useRealtimeActions();
  const state = useRealtimeState();
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;
  const key = identifier ? identifierKey(identifier) : '';

  useEffect(() => {
    if (!identifier || !enabled) return;
    return subscribe(identifier, (event) => callbackRef.current(event));
  }, [enabled, key, subscribe]);

  return state;
}

export class SharedRealtimeClient {
  private active = AppState.currentState === 'active';
  private attempts = 0;
  private channels = new Map<string, ChannelRecord>();
  private connectPromise?: Promise<void>;
  private consumer?: Consumer;
  private destroyed = false;
  private online = true;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private generation = 0;

  constructor(private readonly onState: (state: RealtimeState) => void) {}

  start() {
    void this.connect();
  }

  subscribe(identifier: ChannelIdentifier, listener: Listener) {
    const key = identifierKey(identifier);
    let record = this.channels.get(key);
    if (!record) {
      record = { identifier, listeners: new Set(), confirmed: false, queue: [] };
      this.channels.set(key, record);
    }
    record.listeners.add(listener);
    if (this.consumer) this.createSubscription(record);
    if (!this.consumer) void this.connect();

    return () => {
      const current = this.channels.get(key);
      if (!current) return;
      current.listeners.delete(listener);
      if (current.listeners.size) return;
      current.subscription?.unsubscribe();
      this.channels.delete(key);
    };
  }

  perform(identifier: ChannelIdentifier, action: string, payload: Record<string, unknown>) {
    const record = this.channels.get(identifierKey(identifier));
    if (!record) return false;
    if (!record.subscription || !record.confirmed) {
      record.queue.push({ action, payload });
      if (record.queue.length > 50) record.queue.shift();
      if (!this.consumer) void this.connect();
      return false;
    }
    record.subscription.perform(action, payload);
    return true;
  }

  setActive(active: boolean) {
    if (this.active === active) { if (active) void this.connect(); return; }
    this.active = active;
    if (active) this.reconnect();
    else {
      this.clearReconnectTimer();
      this.teardownConsumer();
      this.onState('disconnected');
    }
  }

  setOnline(online: boolean) {
    if (this.online === online) { if (online) void this.connect(); return; }
    this.online = online;
    if (!online) {
      this.clearReconnectTimer();
      this.teardownConsumer();
      this.onState('disconnected');
    }
    else this.reconnect();
  }

  reconnect() {
    if (this.destroyed || !this.active || !this.online) return;
    this.clearReconnectTimer();
    this.teardownConsumer();
    void this.connect();
  }

  destroy() {
    this.destroyed = true;
    this.clearReconnectTimer();
    this.teardownConsumer();
    this.channels.clear();
    this.onState('idle');
  }

  private async connect() {
    if (this.destroyed || !this.online || !this.active || this.consumer) return;
    if (this.connectPromise) return this.connectPromise;
    this.onState('connecting');
    const generation = this.generation;

    this.connectPromise = (async () => {
      try {
        const credentials = await endpoints.realtimeToken();
        if (this.destroyed || !this.active || !this.online || generation !== this.generation) return;
        const url = new URL(credentials.url);
        if (!['ws:', 'wss:'].includes(url.protocol)) throw new Error('Invalid realtime URL');
        url.searchParams.set('token', credentials.token);
        this.consumer = createMobileConsumer(url.toString());
        this.channels.forEach((record) => this.createSubscription(record));
      } catch {
        if (!this.destroyed) {
          this.teardownConsumer();
          this.onState('disconnected');
          this.scheduleReconnect();
        }
      } finally {
        this.connectPromise = undefined;
        if (generation !== this.generation && !this.reconnectTimer) void this.connect();
      }
    })();

    return this.connectPromise;
  }

  private createSubscription(record: ChannelRecord) {
    if (!this.consumer || record.subscription) return;
    const consumer = this.consumer;
    const isCurrent = () => this.consumer === consumer && this.channels.get(identifierKey(record.identifier)) === record;
    record.confirmed = false;
    record.subscription = this.consumer.subscriptions.create(record.identifier, {
      connected: () => {
        if (!isCurrent()) return;
        this.attempts = 0;
        this.clearReconnectTimer();
        record.confirmed = true;
        this.flushQueue(record);
        this.onState('connected');
      },
      disconnected: () => {
        if (!isCurrent()) return;
        record.confirmed = false;
        this.onState('disconnected');
        this.scheduleReconnect();
      },
      rejected: () => {
        if (!isCurrent()) return;
        record.confirmed = false;
        record.queue = [];
        // An inaccessible thread must not repeatedly disconnect every other channel.
        this.onState([...this.channels.values()].some((channel) => channel.confirmed) ? 'connected' : 'disconnected');
        Sentry.captureMessage('Mobile realtime subscription rejected', { level: 'warning', tags: { channel: record.identifier.channel } });
      },
      received: (event: RealtimeEvent) => {
        if (!isCurrent() || !event || typeof event !== 'object' || typeof event.type !== 'string') return;
        record.listeners.forEach((listener) => {
          try { listener(event); } catch (error) {
            Sentry.captureException(error, { tags: { surface: 'mobile_realtime_listener' } });
          }
        });
      },
    });
  }

  private scheduleReconnect() {
    if (this.destroyed || !this.active || !this.online || this.reconnectTimer) return;
    this.attempts += 1;
    const delay = Math.min(750 * 2 ** this.attempts, 12_000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.teardownConsumer();
      void this.connect();
    }, delay);
  }

  private teardownConsumer() {
    this.generation += 1;
    const consumer = this.consumer;
    this.consumer = undefined;
    // Closing the shared socket removes all of its subscriptions server-side.
    // Sending an unsubscribe for every channel immediately before disconnect
    // races ActionCable and produces duplicate/unknown subscription commands.
    this.channels.forEach((record) => {
      record.confirmed = false;
      record.subscription = undefined;
    });
    consumer?.disconnect();
  }

  private flushQueue(record: ChannelRecord) {
    if (!record.subscription || !record.confirmed || !record.queue.length) return;
    const queued = record.queue.splice(0, record.queue.length);
    queued.forEach(({ action, payload }) => record.subscription?.perform(action, payload));
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
  }
}

function identifierKey(identifier: ChannelIdentifier) {
  if (identifier.channel === 'PresenceChannel') return 'PresenceChannel';
  if (identifier.channel === 'CallChannel') return `call:${identifier.public_id}`;
  return `chat:${identifier.conversation_id || 'user'}`;
}
