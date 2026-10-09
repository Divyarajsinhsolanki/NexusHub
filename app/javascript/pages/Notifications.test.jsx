// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), read: vi.fn(), readAll: vi.fn(), listener: null }));
vi.mock('../components/api', () => ({ fetchNotifications: mocks.fetch, markNotificationRead: mocks.read, markAllNotificationsRead: mocks.readAll }));
vi.mock('../lib/chatCable', () => ({ subscribeToUserChat: vi.fn((listener) => { mocks.listener = listener; return { unsubscribe: vi.fn() }; }) }));
import Notifications from './Notifications';
const notice = (id, extra = {}) => ({ id, action: 'task_assigned', message: `Assignment ${id}`, created_at: '2026-10-09T12:00:00Z', read_at: null, deep_link: '/projects/7?taskId=3', ...extra });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetch.mockImplementation(async ({ page }) => ({ data: { notifications: [notice(page === 2 ? 1 : 21)], meta: { total_pages: 2, unread_count: 21 } } }));
  mocks.read.mockResolvedValue({ data: { unread_count: 20 } });
});
afterEach(cleanup);
it('loads older history without losing the first page and opens web record links', async () => {
  render(<MemoryRouter><Notifications /></MemoryRouter>);
  await screen.findByText('Assignment 21');
  expect(screen.getByRole('link', { name: 'Open record' }).getAttribute('href')).toBe('/projects/7/dashboard?taskId=3');
  fireEvent.click(screen.getByRole('button', { name: 'Load older notifications' }));
  await screen.findByText('Assignment 1');
  expect(screen.getByText('Assignment 21')).toBeTruthy();
  expect(mocks.fetch).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
});
it('receives live notifications and synchronizes read state from another device', async () => {
  render(<MemoryRouter><Notifications /></MemoryRouter>);
  await screen.findByText('Assignment 21');
  act(() => mocks.listener({ type: 'notification_received', notification: notice(22) }));
  expect(screen.getByText('Assignment 22')).toBeTruthy();
  act(() => mocks.listener({ type: 'notifications_read', notification_id: 22, read_at: '2026-10-09T12:01:00Z', unread_count: 21 }));
  expect(screen.getAllByText('Read').length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: 'Unread' }));
  await waitFor(() => expect(mocks.fetch).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'unread', page: 1 })));
});
it('keeps a realtime arrival when the initial response arrives later, without duplicates', async () => {
  let resolve;
  mocks.fetch.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  render(<MemoryRouter><Notifications /></MemoryRouter>);
  await waitFor(() => expect(mocks.listener).toBeTypeOf('function'));
  act(() => mocks.listener({ type: 'notification_received', notification: notice(22) }));
  await act(async () => resolve({ data: { notifications: [notice(22), notice(21)], meta: { unread_count: 2, next_before_id: null } } }));
  expect(screen.getAllByText('Assignment 22')).toHaveLength(1);
  expect(screen.getByText('Assignment 21')).toBeTruthy();
});
it('does not restore unread state when a read event precedes the initial response', async () => {
  let resolve;
  mocks.fetch.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  render(<MemoryRouter><Notifications /></MemoryRouter>);
  await waitFor(() => expect(mocks.listener).toBeTypeOf('function'));
  act(() => mocks.listener({ type: 'notifications_read', notification_id: 21, read_at: '2026-10-09T12:01:00Z', unread_count: 0 }));
  await act(async () => resolve({ data: { notifications: [notice(21)], meta: { unread_count: 1, next_before_id: null } } }));
  expect(screen.getByText('Assignment 21')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Mark read' })).toBeNull();
});
it('uses the same unread cursor after marking the displayed page read', async () => {
  mocks.fetch.mockImplementation(async ({ before_id }) => ({ data: {
    notifications: [notice(before_id ? 1 : 21)],
    meta: { unread_count: 2, next_before_id: before_id ? null : 21 },
  } }));
  render(<MemoryRouter><Notifications /></MemoryRouter>);
  await screen.findByText('Assignment 21');
  fireEvent.click(screen.getByRole('button', { name: 'Unread' }));
  await waitFor(() => expect(mocks.fetch).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'unread' })));
  await screen.findByText('Assignment 21');
  fireEvent.click(screen.getByRole('button', { name: 'Mark read' }));
  await waitFor(() => expect(screen.queryByText('Assignment 21')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'Load older notifications' }));
  await screen.findByText('Assignment 1');
  expect(mocks.fetch).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: true, before_id: 21, status: 'unread' }));
});
it('refreshes the first page with a numeric page parameter', async () => {
  render(<MemoryRouter><Notifications /></MemoryRouter>);
  await screen.findByText('Assignment 21');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh feed' }));
  await waitFor(() => expect(mocks.fetch).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 })));
});
it('deduplicates string IDs and keeps delayed already-read arrivals out of the unread lane', async () => {
  mocks.fetch.mockResolvedValue({ data: { notifications: [notice(21)], meta: { unread_count: 1, next_before_id: null } } });
  render(<MemoryRouter><Notifications /></MemoryRouter>);
  await screen.findByText('Assignment 21');
  act(() => mocks.listener({ type: 'notification_received', notification: notice('21') }));
  expect(screen.getAllByText('Assignment 21')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Unread' }));
  await screen.findByText('Assignment 21');
  act(() => mocks.listener({ type: 'notifications_read', notification_id: 22, read_at: '2026-10-09T12:01:00Z', unread_count: 1 }));
  act(() => mocks.listener({ type: 'notification_received', notification: notice(22) }));
  expect(screen.queryByText('Assignment 22')).toBeNull();
  expect(screen.getByText('1 unread notifications are still live in the feed.')).toBeTruthy();
});
