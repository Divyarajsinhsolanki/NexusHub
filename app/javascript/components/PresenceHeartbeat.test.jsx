// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../context/AuthContext', () => ({ AuthContext: React.createContext({ user: null }) }));
vi.mock('./api', () => ({ updatePresence: vi.fn(async () => ({})) }));
import { AuthContext } from '../context/AuthContext';
import { updatePresence } from './api';
import PresenceHeartbeat from './PresenceHeartbeat';
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });
it('publishes outside Chat and immediately on returning to a visible online tab', async () => {
  vi.useFakeTimers();
  let visible = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visible });
  render(<AuthContext.Provider value={{ user: { id: 1 } }}><PresenceHeartbeat /></AuthContext.Provider>);
  await act(async () => {});
  expect(updatePresence).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(updatePresence).toHaveBeenCalledTimes(2);
  visible = 'hidden';
  await act(async () => { await vi.advanceTimersByTimeAsync(150_000); });
  expect(updatePresence).toHaveBeenCalledTimes(2);
  visible = 'visible';
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(updatePresence).toHaveBeenCalledTimes(3);
});
it('stops after logout or unmount and skips demo accounts', async () => {
  vi.useFakeTimers();
  const view = render(<AuthContext.Provider value={{ user: { id: 1, demo_account: true } }}><PresenceHeartbeat /></AuthContext.Provider>);
  expect(updatePresence).not.toHaveBeenCalled();
  view.rerender(<AuthContext.Provider value={{ user: { id: 1 } }}><PresenceHeartbeat /></AuthContext.Provider>);
  await act(async () => {});
  view.rerender(<AuthContext.Provider value={{ user: null }}><PresenceHeartbeat /></AuthContext.Provider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(90_000); window.dispatchEvent(new Event('focus')); });
  expect(updatePresence).toHaveBeenCalledTimes(1);
});
