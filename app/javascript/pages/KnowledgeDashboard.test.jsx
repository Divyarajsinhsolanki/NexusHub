// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import KnowledgeDashboard from './KnowledgeDashboard';

const mocks = vi.hoisted(() => ({ createBookmark: vi.fn(), deleteBookmark: vi.fn(), markReviewed: vi.fn(), fetchItems: vi.fn(), fetchRuns: vi.fn(), archive: vi.fn() }));
const bookmark = { id: 8, card_type: 'mcp_knowledge_item', source_id: 'knowledge_item:1', collection_name: 'Reading list', next_reminder_at: '2025-01-01T00:00:00Z', payload: { title: 'Saved insight', summary: 'Useful context', body: 'Original saved content' } };
vi.mock('../context/KnowledgeBookmarksContext', () => ({
  KnowledgeBookmarksProvider: ({ children }) => children,
  useKnowledgeBookmarks: () => ({ bookmarks: [bookmark], dueBookmarks: [bookmark], collections: ['Reading list'], loading: false, createBookmark: mocks.createBookmark, deleteBookmark: mocks.deleteBookmark, markReviewed: mocks.markReviewed, findBookmark: () => null }),
}));
vi.mock('../components/api', () => ({ fetchKnowledgeItems: mocks.fetchItems, fetchKnowledgePromptRuns: mocks.fetchRuns, archiveKnowledgeItem: mocks.archive }));
vi.mock('../components/Knowledge3DRoom/Knowledge3DRoom', () => ({ default: () => <p>Optional room mounted</p> }));
vi.mock('../components/Knowledge/TodayInHistoryCard', () => ({ default: () => null }));
vi.mock('../components/Knowledge/QuoteOfTheDayCard', () => ({ default: () => null }));
vi.mock('../components/Knowledge/TopNewsCard', () => ({ default: () => null }));
vi.mock('../components/Knowledge/LocalHeadlinesCard', () => ({ default: () => null }));
vi.mock('../components/Knowledge/DailyFactCard', () => ({ default: () => null }));
vi.mock('../components/Knowledge/WordOfTheDayCard', () => ({ default: () => null }));
vi.mock('../components/Knowledge/RandomCodingTipCard', () => ({ default: () => null }));
vi.mock('../components/Knowledge/ScienceNewsCard', () => ({ default: () => null }));
vi.mock('../components/Knowledge/TechNewsCard', () => ({ default: () => null }));
vi.mock('../components/Knowledge/PolicyBriefCard', () => ({ default: () => null }));
vi.mock('../components/Knowledge/DevToolOfTheDayCard', () => ({ default: () => null }));
vi.mock('../components/Knowledge/OpenIssueSpotlightCard', () => ({ default: () => null }));
vi.mock('../components/Knowledge/TopGainersCard', () => ({ default: () => null }));
vi.mock('../components/Knowledge/TopVolumeStocksCard', () => ({ default: () => null }));
vi.mock('../components/Knowledge/TopBuyingStocksCard', () => ({ default: () => null }));
vi.mock('../components/Knowledge/IndianStockNewsCard', () => ({ default: () => null }));
vi.mock('../components/Knowledge/CommonEnglishWordCard', () => ({ default: () => null }));
vi.mock('../components/Knowledge/EnglishTenseCard', () => ({ default: () => null }));
vi.mock('../components/Knowledge/EnglishPhraseCard', () => ({ default: () => null }));
vi.mock('../components/Knowledge/ImageOfTheDayCard', () => ({ default: () => null }));
vi.mock('../components/Knowledge/DailyQuizCard', () => ({ default: () => null }));
vi.mock('../components/Knowledge/StudyReminderCard', () => ({ default: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchItems.mockResolvedValue({ data: [{ id: 1, active: true, title: 'Project signals', summary: 'A useful summary', body: 'Complete article text', category: 'tech' }, { id: 2, active: true, title: 'Daily learning', summary: 'Another summary', category: 'learning' }] });
  mocks.fetchRuns.mockResolvedValue({ data: [] });
  mocks.createBookmark.mockResolvedValue({ id: 9 });
});
afterEach(cleanup);

it('starts in the library and mounts the room only on request', async () => {
  render(<KnowledgeDashboard />);
  await screen.findByRole('heading', { name: 'Project signals' });
  expect(screen.queryByText('Optional room mounted')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '3D room' }));
  expect(await screen.findByText('Optional room mounted')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Library', exact: true }));
  expect(screen.queryByText('Optional room mounted')).toBeNull();
  expect(mocks.fetchItems).toHaveBeenCalledTimes(1);
});

it('searches generated content and clears an empty result', async () => {
  render(<KnowledgeDashboard />);
  await screen.findByRole('heading', { name: 'Project signals' });
  fireEvent.click(screen.getByRole('button', { name: /ChatGPT inbox/ }));
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search knowledge' }), { target: { value: 'complete article' } });
  expect(screen.getByRole('heading', { name: 'Project signals' })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Daily learning' })).toBeNull();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'not present' } });
  expect(screen.getByText('No matching items')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(screen.getByRole('heading', { name: 'Daily learning' })).toBeTruthy();
});

it('preserves saved content, collection selection and review actions', async () => {
  render(<KnowledgeDashboard />);
  await screen.findByRole('heading', { name: 'Project signals' });
  fireEvent.click(screen.getByRole('button', { name: /Reading list/ }));
  expect(screen.getByText('Original saved content')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Mark reviewed' }));
  await waitFor(() => expect(mocks.markReviewed).toHaveBeenCalledWith(8));
});

it('saves with collection and reminder settings using an accessible dialog', async () => {
  render(<KnowledgeDashboard />);
  await screen.findByRole('heading', { name: 'Project signals' });
  fireEvent.click(screen.getByRole('button', { name: /ChatGPT inbox/ }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Save', exact: true })[0]);
  const dialog = screen.getByRole('dialog', { name: 'Save to collection' });
  fireEvent.change(within(dialog).getByLabelText('Collection'), { target: { value: 'Engineering' } });
  fireEvent.change(within(dialog).getByLabelText('Review every (days)'), { target: { value: '14' } });
  fireEvent.submit(dialog);
  await waitFor(() => expect(mocks.createBookmark).toHaveBeenCalledWith(expect.objectContaining({ sourceId: 'knowledge_item:1', collectionName: 'Engineering', reminderIntervalDays: 14 })));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});
