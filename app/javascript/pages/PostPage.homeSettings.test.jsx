// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { Link, MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import PostPage from './PostPage';
import { fetchPost, fetchPostFeed } from '../components/api';
import { normalizeHomePreferences } from '../utils/homeShortcuts';
vi.mock('../context/AuthContext', async () => ({ AuthContext: (await import('react')).createContext({}) }));
vi.mock('react-helmet-async', () => ({ Helmet: () => null }));
vi.mock('../components/PostForm', () => ({ default: () => <textarea aria-label="Write an update" /> }));
vi.mock('../components/PostList', () => ({ default: ({ posts }) => <div>{posts.map(post => <p key={post.id}>{post.message}</p>)}</div> }));
vi.mock('../components/api', () => ({
  fetchPost: vi.fn(async () => ({ data: { id: 901, message: "Shared post", created_at: "2026-10-10T07:00:00Z", user: { id: 7 } } })),
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

it('loads an exact shared post independently of feed pagination', async () => {
  render(<MemoryRouter initialEntries={['/posts?post_id=901']}><AuthContext.Provider value={{ user: { id: 7 } }}><PostPage /></AuthContext.Provider></MemoryRouter>);
  expect(fetchPost).toHaveBeenCalledWith('901');
});

it('does not merge an older page into a shared post after navigation', async () => {
  let finishPage;
  fetchPostFeed.mockResolvedValueOnce({ data: [{ id: 1, message: 'Feed post', created_at: '2026-10-10T07:00:00Z', user: { id: 7 } }], meta: { next_page: 2 } });
  fetchPostFeed.mockImplementationOnce(() => new Promise(resolve => { finishPage = resolve; }));
  render(<MemoryRouter initialEntries={['/home']}><Link to="/home?post_id=901">Open shared post</Link><AuthContext.Provider value={{ user: { id: 7 } }}><PostPage /></AuthContext.Provider></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Load more updates' }));
  await waitFor(() => expect(finishPage).toBeTypeOf('function'));
  fireEvent.click(screen.getByText('Open shared post'));
  await screen.findByText('Shared post');
  await act(async () => finishPage({ data: [{ id: 2, message: 'Stale page post', created_at: '2026-10-09T07:00:00Z', user: { id: 7 } }], meta: {} }));
  expect(screen.queryByText('Stale page post')).toBeNull();
  expect(screen.getByText('Shared post')).toBeTruthy();
});
