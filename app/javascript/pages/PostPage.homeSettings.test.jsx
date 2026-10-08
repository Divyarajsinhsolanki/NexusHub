// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import PostPage from './PostPage';
import { normalizeHomePreferences } from '../utils/homeShortcuts';
vi.mock('../context/AuthContext', async () => ({ AuthContext: (await import('react')).createContext({}) }));
vi.mock('react-helmet-async', () => ({ Helmet: () => null }));
vi.mock('../components/PostForm', () => ({ default: () => <textarea aria-label="Write an update" /> }));
vi.mock('../components/PostList', () => ({ default: () => null }));
vi.mock('../components/api', () => ({
  fetchPostFeed: vi.fn(async () => ({ data: [], meta: {} })),
  fetchCalendarEvents: vi.fn(async () => ({ data: [] })),
  fetchProjects: vi.fn(async () => ({ data: [] })),
  getUsers: vi.fn(async () => ({ data: [] })),
  SchedulerAPI: { getTasks: vi.fn(async () => ({ data: [] })) },
}));
afterEach(cleanup);
const page = preferences => <MemoryRouter><AuthContext.Provider value={{ user: { id: 7, home_preferences: preferences } }}><PostPage /></AuthContext.Provider></MemoryRouter>;
it('shows selected shortcuts in saved order and updates all card visibility', async () => {
  const { rerender } = render(page({ shortcut_ids: ['projects', 'chat'] }));
  const rail = screen.getByRole('complementary', { name: 'Your workspace' });
  const quickAccess = within(rail).getByText('Quick access').closest('section');
  expect(within(quickAccess).getAllByRole('link').map(link => link.textContent)).toEqual(['Customize', 'Projects→', 'Team chat→']);
  expect(await within(rail).findByText('No upcoming birthdays in the next 30 days.')).toBeTruthy();
  rerender(page({ show_overview: false, show_shortcuts: false, show_due_tasks: false, show_tasks: false, show_projects: false, show_birthdays: false }));
  expect(within(rail).queryByText('Quick access')).toBeNull();
  expect(within(rail).queryByLabelText("Today's overview")).toBeNull();
  expect(within(rail).queryByText('My tasks')).toBeNull();
  expect(within(rail).queryByText('Projects')).toBeNull();
  expect(within(rail).getByText(/Sidebar cards are hidden/)).toBeTruthy();
});
it('keeps Customize available when there are no selected shortcuts', () => {
  render(page(normalizeHomePreferences({ shortcut_ids: [] })));
  expect(screen.getByText('No shortcuts selected. Choose links in Customize.')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Customize home shortcuts' }).getAttribute('href')).toBe('/settings?tab=home');
});

it('renders sidebar cards in the saved order while filtering hidden cards', () => {
  render(page({ card_order: ['show_projects', 'show_tasks', 'show_shortcuts', 'show_overview'], show_tasks: false }));
  const rail = screen.getByRole('complementary', { name: 'Your workspace' });
  expect([...rail.querySelectorAll('section > header')].map(header => header.querySelector('span').textContent.trim())).toEqual(['Projects', 'Quick access', 'Today’s overview', 'Today', 'Upcoming birthdays']);
});
