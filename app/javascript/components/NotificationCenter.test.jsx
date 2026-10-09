// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), listener: null, toast: vi.fn() }));
vi.mock('./api', () => ({ fetchNotifications: mocks.fetch, markNotificationRead: vi.fn(), markAllNotificationsRead: vi.fn() }));
vi.mock('../lib/chatCable', () => ({ subscribeToUserChat: vi.fn(listener => { mocks.listener = listener; return { unsubscribe: vi.fn() }; }) }));
vi.mock('../context/AuthContext', async () => ({ AuthContext: (await import('react')).createContext({ user: { id: 1 } }) }));
vi.mock('react-hot-toast', () => ({ toast: mocks.toast }));
vi.mock('@headlessui/react', async () => {
  const React = await import('react');
  const Popover = ({ children }) => children({ open: true, close: vi.fn() });
  Popover.Button = props => React.createElement('button', props);
  Popover.Panel = props => React.createElement('div', props);
  return { Popover, Transition: ({ children }) => children };
});
import NotificationCenter from './NotificationCenter';
const notice = id => ({ id, message: `Notice ${id}`, action: 'assigned', read_at: null, created_at: '2026-10-09T00:00:00Z' });
beforeEach(() => { vi.clearAllMocks(); mocks.listener = null; });
afterEach(cleanup);

it('keeps live arrivals when the initial response resolves and deduplicates delayed broadcasts', async () => {
  let resolve;
  mocks.fetch.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  mocks.fetch.mockResolvedValue({ data: { notifications: [notice(3), notice(2), notice(1)], meta: { unread_count: 3 } } });
  render(<MemoryRouter><NotificationCenter /></MemoryRouter>);
  await waitFor(() => expect(mocks.listener).toBeTypeOf('function'));
  act(() => mocks.listener({ type: 'notification_received', notification: notice(3) }));
  await act(async () => resolve({ data: { notifications: [notice(2), notice(1)], meta: { unread_count: 2 } } }));
  await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
  act(() => mocks.listener({ type: 'notification_received', notification: notice('2') }));
  expect(screen.getAllByText('Notice 3')).toHaveLength(1);
  expect(screen.getAllByText('Notice 2')).toHaveLength(1);
  expect(screen.getByText('Notice 1')).toBeTruthy();
});

it('preserves read acknowledgements preceding the initial response or a delayed arrival', async () => {
  let resolve;
  mocks.fetch.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  mocks.fetch.mockResolvedValue({ data: { notifications: [notice(1)], meta: { unread_count: 0 } } });
  render(<MemoryRouter><NotificationCenter /></MemoryRouter>);
  await waitFor(() => expect(mocks.listener).toBeTypeOf('function'));
  act(() => mocks.listener({ type: 'notifications_read', notification_ids: [1, 2], read_at: '2026-10-09T01:00:00Z', unread_count: 0 }));
  await act(async () => resolve({ data: { notifications: [notice(1)], meta: { unread_count: 1 } } }));
  act(() => mocks.listener({ type: 'notification_received', notification: notice(2) }));
  expect(screen.getByText('Notice 1')).toBeTruthy();
  expect(screen.getByText('Notice 2')).toBeTruthy();
  expect(screen.queryByTitle('Mark as read')).toBeNull();
  expect(screen.queryByText('Mark all as read')).toBeNull();
});
