import { createConsumer } from '@rails/actioncable';
import { afterEach, describe, expect, jest, test } from '@jest/globals';

import { endpoints } from '../api/endpoints';
import { SharedRealtimeClient } from './RealtimeProvider';

jest.mock('@rails/actioncable', () => {
  const { jest: jestGlobals } = require('@jest/globals');
  return { createConsumer: jestGlobals.fn() };
});
jest.mock('../api/endpoints', () => {
  const { jest: jestGlobals } = require('@jest/globals');
  return { endpoints: { realtimeToken: jestGlobals.fn() } };
});
jest.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: null }) }));

afterEach(() => { jest.clearAllMocks(); });

describe('SharedRealtimeClient', () => {
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
});

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
