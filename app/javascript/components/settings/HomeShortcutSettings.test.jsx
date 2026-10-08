// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AuthContext } from '../../context/AuthContext';
import HomeShortcutSettings from './HomeShortcutSettings';
import api from '../api';
import { normalizeHomePreferences } from '../../utils/homeShortcuts';
vi.mock('../api', () => ({ default: { post: vi.fn() } }));
vi.mock('../../context/AuthContext', async () => ({ AuthContext: (await import('react')).createContext({}) }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('saves visibility, chosen links, and reordered links to the account', async () => {
  api.post.mockResolvedValue({ data: { home_preferences: normalizeHomePreferences({ show_shortcuts: false, shortcut_ids: ['chat', 'pdf-master', 'projects'] }) } });
  const setUser = vi.fn();
  render(<AuthContext.Provider value={{ user: { id: 7 }, setUser }}><HomeShortcutSettings /></AuthContext.Provider>);
  fireEvent.click(screen.getByRole('button', { name: 'Move PDF Master up' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Knowledge library' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Projects' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Show Quick access on Home' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save Home settings' }));
  await waitFor(() => expect(setUser).toHaveBeenCalledOnce());
  expect(api.post).toHaveBeenCalledWith('/update_profile', { auth: { home_preferences: normalizeHomePreferences({ show_shortcuts: false, shortcut_ids: ['chat', 'pdf-master', 'projects'] }) } });
});
it('keeps the draft and does not change account state after a failed save', async () => {
  api.post.mockRejectedValue(new Error('offline'));
  const setUser = vi.fn();
  render(<AuthContext.Provider value={{ user: { id: 7 }, setUser }}><HomeShortcutSettings /></AuthContext.Provider>);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Team chat' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save Home settings' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save Home settings' }).disabled).toBe(false));
  expect(setUser).not.toHaveBeenCalled();
  expect(screen.getByRole('checkbox', { name: 'Team chat' }).checked).toBe(false);
});

it('updates context from the server response and saves card visibility', async () => {
  const saved = normalizeHomePreferences({ show_overview: false, shortcut_ids: ['projects'] });
  api.post.mockResolvedValue({ data: { home_preferences: saved } });
  const setUser = vi.fn();
  render(<AuthContext.Provider value={{ user: { id: 7 }, setUser }}><HomeShortcutSettings /></AuthContext.Provider>);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Show Today’s overview on Home' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save Home settings' }));
  await waitFor(() => expect(setUser).toHaveBeenCalledOnce());
  expect(setUser.mock.calls[0][0]({ id: 7 }).home_preferences).toEqual(saved);
  expect(screen.getByRole('checkbox', { name: 'Projects' }).checked).toBe(true);
  expect(screen.getByRole('checkbox', { name: 'Team chat' }).checked).toBe(false);
  expect(api.post.mock.calls[0][1].auth.home_preferences.show_overview).toBe(false);
});
it('preserves unsaved changes when session refresh supplies identical saved preferences', () => {
  const setUser = vi.fn();
  const { rerender } = render(<AuthContext.Provider value={{ user: { id: 7, home_preferences: {} }, setUser }}><HomeShortcutSettings /></AuthContext.Provider>);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Team chat' }));
  rerender(<AuthContext.Provider value={{ user: { id: 7, home_preferences: {} }, setUser }}><HomeShortcutSettings /></AuthContext.Provider>);
  expect(screen.getByRole('checkbox', { name: 'Team chat' }).checked).toBe(false);
});

it('rearranges sidebar cards with keyboard drag and drop and saves the order', async () => {
  const saved = normalizeHomePreferences({ card_order: ['show_shortcuts', 'show_overview'] });
  api.post.mockResolvedValue({ data: { home_preferences: saved } });
  render(<AuthContext.Provider value={{ user: { id: 7 }, setUser: vi.fn() }}><HomeShortcutSettings /></AuthContext.Provider>);
  const handle = screen.getByRole('button', { name: 'Rearrange Today’s overview' });
  handle.focus();
  fireEvent.keyDown(handle, { key: ' ', code: 'Space', keyCode: 32 });
  await waitFor(() => expect(screen.getByText(/You have lifted an item/)).toBeTruthy());
  fireEvent.keyDown(handle, { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 });
  fireEvent.keyDown(handle, { key: ' ', code: 'Space', keyCode: 32 });
  await waitFor(() => expect(screen.getByText(/You have dropped the item/)).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: 'Save Home settings' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledOnce());
  expect(api.post.mock.calls[0][1].auth.home_preferences.card_order.slice(0, 2)).toEqual(['show_shortcuts', 'show_overview']);
});
