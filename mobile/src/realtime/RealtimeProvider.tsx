import NetInfo from '@react-native-community/netinfo';
import { createConsumer, type Consumer, type Subscription } from '@rails/actioncable';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { endpoints } from '../api/endpoints';
import { useAuth } from '../auth/AuthProvider';
import type { ChannelIdentifier, RealtimeEvent, RealtimeState } from './types';

type Listener = (event: RealtimeEvent) => void;
type ChannelRecord = {
  identifier: ChannelIdentifier;
  listeners: Set<Listener>;
  subscription?: Subscription;
};

type RealtimeContextValue = {
  state: RealtimeState;
  subscribe: (identifier: ChannelIdentifier, listener: Listener) => () => void;
  perform: (identifier: ChannelIdentifier, action: string, payload?: Record<string, unknown>) => boolean;
  reconnect: () => void;
};

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

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
  const value = useMemo(() => ({ state, subscribe, perform, reconnect }), [perform, reconnect, state, subscribe]);
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime() {
  const value = useContext(RealtimeContext);
  if (!value) throw new Error('useRealtime must be used inside RealtimeProvider');
  return value;
}

export function useRealtimeChannel(identifier: ChannelIdentifier | undefined, onEvent: Listener, enabled = true) {
  const realtime = useRealtime();
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;
  const key = identifier ? identifierKey(identifier) : '';

  useEffect(() => {
    if (!identifier || !enabled) return;
    return realtime.subscribe(identifier, (event) => callbackRef.current(event));
  }, [enabled, key, realtime.subscribe]);

  return realtime.state;
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

  constructor(private readonly onState: (state: RealtimeState) => void) {}

  start() {
    void this.connect();
  }

  subscribe(identifier: ChannelIdentifier, listener: Listener) {
    const key = identifierKey(identifier);
    let record = this.channels.get(key);
    if (!record) {
      record = { identifier, listeners: new Set() };
      this.channels.set(key, record);
      if (this.consumer) this.createSubscription(record);
    }
    record.listeners.add(listener);
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
    const subscription = this.channels.get(identifierKey(identifier))?.subscription;
    if (!subscription) return false;
    subscription.perform(action, payload);
    return true;
  }

  setActive(active: boolean) {
    this.active = active;
    if (active) this.reconnect();
    else {
      this.clearReconnectTimer();
      this.teardownConsumer();
      this.onState('disconnected');
    }
  }

  setOnline(online: boolean) {
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

    this.connectPromise = (async () => {
      try {
        const credentials = await endpoints.realtimeToken();
        if (this.destroyed || !this.active || !this.online) return;
        const separator = credentials.url.includes('?') ? '&' : '?';
        const url = credentials.url.includes('token=') ? credentials.url : `${credentials.url}${separator}token=${encodeURIComponent(credentials.token)}`;
        this.consumer = createConsumer(url);
        this.channels.forEach((record) => this.createSubscription(record));
        this.attempts = 0;
      } catch {
        if (!this.destroyed) {
          this.onState('disconnected');
          this.scheduleReconnect();
        }
      } finally {
        this.connectPromise = undefined;
      }
    })();

    return this.connectPromise;
  }

  private createSubscription(record: ChannelRecord) {
    if (!this.consumer || record.subscription) return;
    record.subscription = this.consumer.subscriptions.create(record.identifier, {
      connected: () => {
        this.attempts = 0;
        this.clearReconnectTimer();
        this.onState('connected');
      },
      disconnected: () => {
        this.onState('disconnected');
        this.scheduleReconnect();
      },
      rejected: () => {
        this.onState('disconnected');
        this.scheduleReconnect(true);
      },
      received: (event: RealtimeEvent) => record.listeners.forEach((listener) => listener(event)),
    });
  }

  private scheduleReconnect(rejected = false) {
    if (this.destroyed || !this.active || !this.online || this.reconnectTimer) return;
    this.attempts += 1;
    const delay = rejected ? Math.min(1_000 * 2 ** this.attempts, 20_000) : Math.min(750 * 2 ** this.attempts, 12_000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.teardownConsumer();
      void this.connect();
    }, delay);
  }

  private teardownConsumer() {
    this.channels.forEach((record) => {
      record.subscription?.unsubscribe();
      record.subscription = undefined;
    });
    this.consumer?.disconnect();
    this.consumer = undefined;
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
  }
}

function identifierKey(identifier: ChannelIdentifier) {
  if (identifier.channel === 'CallChannel') return `call:${identifier.public_id}`;
  return `chat:${identifier.conversation_id || 'user'}`;
}
