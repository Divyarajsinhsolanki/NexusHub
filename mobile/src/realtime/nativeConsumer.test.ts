import { adapters } from '@rails/actioncable';
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';

import { createMobileConsumer } from './nativeConsumer';

const originalWebSocket = adapters.WebSocket;
class TestSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = 1;
  protocol = 'actioncable-v1-json';
  close = jest.fn();
  send = jest.fn();
}

beforeEach(() => {
  jest.useFakeTimers();
  adapters.WebSocket = TestSocket as unknown as typeof WebSocket;
});
afterEach(() => {
  adapters.WebSocket = originalWebSocket;
  jest.clearAllTimers();
  jest.useRealTimers();
});

test('opens and closes the real ActionCable consumer without browser visibility APIs', () => {
  const consumer = createMobileConsumer('wss://example.test/cable?token=test');
  expect(() => consumer.subscriptions.create('ChatChannel')).not.toThrow();
  expect(jest.getTimerCount()).toBeGreaterThan(0);
  expect(() => consumer.disconnect()).not.toThrow();
  expect(jest.getTimerCount()).toBe(0);
});

test('closes connecting sockets and prevents subscription timers from surviving teardown', () => {
  class ConnectingSocket extends TestSocket { readyState = 0; }
  adapters.WebSocket = ConnectingSocket as unknown as typeof WebSocket;
  const consumer = createMobileConsumer('wss://example.test/cable');
  consumer.subscriptions.create('ChatChannel');
  const socket = (consumer as unknown as { connection: { webSocket: ConnectingSocket } }).connection.webSocket;
  consumer.disconnect();
  expect(socket.close).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});
