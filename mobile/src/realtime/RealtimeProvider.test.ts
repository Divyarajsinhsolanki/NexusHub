import { createMobileConsumer as createConsumer } from './nativeConsumer';
import { afterEach, describe, expect, jest, test } from '@jest/globals';

import { endpoints } from '../api/endpoints';
import { SharedRealtimeClient } from './RealtimeProvider';

jest.mock('./nativeConsumer', () => {
  const { jest: jestGlobals } = require('@jest/globals');
  return { createMobileConsumer: jestGlobals.fn() };
});
jest.mock('../api/endpoints', () => {
  const { jest: jestGlobals } = require('@jest/globals');
  return { endpoints: { realtimeToken: jestGlobals.fn() } };
});
jest.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: null }) }));
jest.mock('@sentry/react-native', () => ({ captureException: jest.fn(), captureMessage: jest.fn() }));

afterEach(() => { jest.clearAllMocks(); jest.useRealTimers(); });

describe('SharedRealtimeClient', () => {
  test('does not replace a healthy socket for repeated foreground or network events', async () => {
    const disconnect = jest.fn();
    jest.mocked(endpoints.realtimeToken).mockResolvedValue({ token: 'token', expires_at: 60, url: 'wss://example.test/cable' });
    jest.mocked(createConsumer).mockReturnValue({ disconnect, subscriptions: { create: jest.fn(() => ({ unsubscribe: jest.fn() })) } } as never);
    const client = new SharedRealtimeClient(jest.fn());
    client.setActive(true);
    client.subscribe({ channel: 'ChatChannel' }, jest.fn());
    await flushPromises();
    client.setActive(true);
    client.setOnline(true);
    client.setOnline(true);
    await flushPromises();
    expect(createConsumer).toHaveBeenCalledTimes(1);
    expect(disconnect).not.toHaveBeenCalled();
    client.destroy();
  });

  test('keeps healthy user subscriptions connected when a thread is rejected', async () => {
    jest.useFakeTimers();
    const handlers: Array<{ connected: () => void; rejected: () => void }> = [];
    jest.mocked(endpoints.realtimeToken).mockResolvedValue({ token: 'token', expires_at: 60, url: 'wss://example.test/cable' });
    jest.mocked(createConsumer).mockReturnValue({ disconnect: jest.fn(), subscriptions: { create: jest.fn((_id: unknown, callbacks: { connected: () => void; rejected: () => void }) => { handlers.push(callbacks); return { unsubscribe: jest.fn() }; }) } } as never);
    const state = jest.fn();
    const client = new SharedRealtimeClient(state);
    client.setActive(true);
    client.subscribe({ channel: 'ChatChannel' }, jest.fn());
    client.subscribe({ channel: 'ChatChannel', conversation_id: 99 }, jest.fn());
    await flushPromises();
    handlers[0].connected();
    handlers[1].rejected();
    expect(state).toHaveBeenLastCalledWith('connected');
    await jest.advanceTimersByTimeAsync(30_000);
    expect(createConsumer).toHaveBeenCalledTimes(1);
    client.destroy();
  });

  test('queues actions during a disconnect and ignores callbacks from the replaced socket', async () => {
    const handlers: Array<{ connected: () => void; disconnected: () => void }> = [];
    const perform = jest.fn();
    jest.mocked(endpoints.realtimeToken).mockResolvedValue({ token: 'token', expires_at: 60, url: 'wss://example.test/cable' });
    jest.mocked(createConsumer).mockImplementation(() => ({ disconnect: jest.fn(), subscriptions: { create: jest.fn((_id: unknown, callbacks: { connected: () => void; disconnected: () => void }) => { handlers.push(callbacks); return { perform, unsubscribe: jest.fn() }; }) } }) as never);
    const state = jest.fn();
    const client = new SharedRealtimeClient(state);
    client.setActive(true);
    const identifier = { channel: 'ChatChannel' as const, conversation_id: 7 };
    client.subscribe(identifier, jest.fn());
    await flushPromises();
    handlers[0].connected();
    handlers[0].disconnected();
    expect(client.perform(identifier, 'typing', { is_typing: true })).toBe(false);
    expect(perform).not.toHaveBeenCalled();
    client.reconnect();
    await flushPromises();
    handlers[1].connected();
    expect(perform).toHaveBeenCalledTimes(1);
    state.mockClear();
    handlers[0].disconnected();
    expect(state).not.toHaveBeenCalled();
    client.destroy();
  });

  test('isolates bad payloads and failing listeners', async () => {
    let receive: (event: unknown) => void = () => undefined;
    jest.mocked(endpoints.realtimeToken).mockResolvedValue({ token: 'token', expires_at: 60, url: 'wss://example.test/cable' });
    jest.mocked(createConsumer).mockReturnValue({ disconnect: jest.fn(), subscriptions: { create: jest.fn((_id: unknown, handlers: { received: (event: unknown) => void }) => { receive = handlers.received; return { unsubscribe: jest.fn() }; }) } } as never);
    const client = new SharedRealtimeClient(jest.fn());
    client.setActive(true);
    client.subscribe({ channel: 'ChatChannel' }, () => { throw new Error('Bad listener'); });
    const healthy = jest.fn();
    client.subscribe({ channel: 'ChatChannel' }, healthy);
    await flushPromises();
    expect(() => receive(null)).not.toThrow();
    expect(() => receive({ type: 'message_created' })).not.toThrow();
    expect(healthy).toHaveBeenCalledTimes(1);
    client.destroy();
  });

  test('discards an in-flight token request when backgrounded', async () => {
    let resolveToken: (value: { token: string; expires_at: number; url: string }) => void = () => undefined;
    jest.mocked(endpoints.realtimeToken).mockImplementation(() => new Promise((resolve) => { resolveToken = resolve; }));
    const client = new SharedRealtimeClient(jest.fn());
    client.setActive(true);
    client.subscribe({ channel: 'ChatChannel' }, jest.fn());
    client.setActive(false);
    resolveToken({ token: 'token', expires_at: 60, url: 'wss://example.test/cable' });
    await flushPromises();
    expect(createConsumer).not.toHaveBeenCalled();
    client.destroy();
  });

  test('shares one consumer and one subscription for duplicate listeners', async () => {
    const unsubscribe = jest.fn();
    const createSubscription = jest.fn(() => ({ perform: jest.fn(), unsubscribe }));
    const disconnect = jest.fn();
    jest.mocked(endpoints.realtimeToken).mockResolvedValue({ token: 'short-lived-token', expires_at: Date.now() + 60_000, url: 'wss://example.test/cable' });
    jest.mocked(createConsumer).mockReturnValue({ disconnect, subscriptions: { create: createSubscription } } as never);
    const client = new SharedRealtimeClient(jest.fn());
    client.setActive(true);
    const identifier = { channel: 'ChatChannel' as const, conversation_id: 7 };
    const first = client.subscribe(identifier, jest.fn());
    const second = client.subscribe(identifier, jest.fn());

    await flushPromises();

    expect(endpoints.realtimeToken).toHaveBeenCalledTimes(1);
    expect(createConsumer).toHaveBeenCalledTimes(1);
    expect(createSubscription).toHaveBeenCalledTimes(1);
    first();
    expect(unsubscribe).not.toHaveBeenCalled();
    second();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    client.destroy();
  });

  test('disconnects the socket while backgrounded and reconnects on foreground', async () => {
    const disconnect = jest.fn();
    jest.mocked(endpoints.realtimeToken).mockResolvedValue({ token: 'token', expires_at: Date.now() + 60_000, url: 'wss://example.test/cable' });
    jest.mocked(createConsumer).mockImplementation(() => ({ disconnect, subscriptions: { create: jest.fn(() => ({ unsubscribe: jest.fn() })) } }) as never);
    const client = new SharedRealtimeClient(jest.fn());
    client.setActive(true);
    client.subscribe({ channel: 'ChatChannel' }, jest.fn());
    await flushPromises();

    client.setActive(false);
    expect(disconnect).toHaveBeenCalledTimes(1);
    client.setActive(true);
    await flushPromises();
    expect(endpoints.realtimeToken).toHaveBeenCalledTimes(2);
    client.destroy();
  });

  test('queues channel actions until the subscription is connected', async () => {
    let callbacks: { connected: () => void } | undefined;
    const perform = jest.fn();
    const createSubscription = jest.fn((_identifier, handlers: { connected: () => void }) => {
      callbacks = handlers;
      return { perform, unsubscribe: jest.fn() };
    });
    jest.mocked(endpoints.realtimeToken).mockResolvedValue({ token: 'token', expires_at: Date.now() + 60_000, url: 'wss://example.test/cable' });
    jest.mocked(createConsumer).mockReturnValue({ disconnect: jest.fn(), subscriptions: { create: createSubscription } } as never);
    const client = new SharedRealtimeClient(jest.fn());
    const identifier = { channel: 'ChatChannel' as const, conversation_id: 7 };
    client.setActive(true);
    client.subscribe(identifier, jest.fn());

    expect(client.perform(identifier, 'typing', { conversation_id: 7, is_typing: true })).toBe(false);
    await flushPromises();
    expect(perform).not.toHaveBeenCalled();

    callbacks?.connected();
    expect(perform).toHaveBeenCalledWith('typing', { conversation_id: 7, is_typing: true });
    expect(client.perform(identifier, 'typing', { conversation_id: 7, is_typing: false })).toBe(true);
    expect(perform).toHaveBeenLastCalledWith('typing', { conversation_id: 7, is_typing: false });
    client.destroy();
  });
});

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
