import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { beforeEach, expect, jest, test } from '@jest/globals';
import { endpoints } from '../api/endpoints';
import { KnowledgeScreen } from './KnowledgeScreen';
const mockParams: { itemId?: string; bookmark_id?: string } = {};
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams, useRouter: () => ({ canGoBack: () => true, back: jest.fn(), replace: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
jest.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 1, workspace: { id: 2 } } }) }));
jest.mock('../components/Screen', () => ({ Screen: ({ children, header }: any) => <>{header}{children}</> }));
jest.mock('../api/endpoints', () => ({ endpoints: {
  knowledgeItems: jest.fn(), knowledgeBookmarks: jest.fn(), knowledgePromptRuns: jest.fn(), knowledgeDiscovery: jest.fn(),
  createKnowledgeBookmark: jest.fn(), archiveKnowledgeItem: jest.fn(), markKnowledgeBookmarkReviewed: jest.fn(), deleteKnowledgeBookmark: jest.fn(),
} }));
jest.mock('../knowledge/catalog', () => {
  const actual = jest.requireActual('../knowledge/catalog') as any;
  return { ...actual, discoveryCards: actual.discoveryCards.filter((card: any) => ['coding_tip', 'dev_tool_of_the_day', 'local_headlines'].includes(card.key)) };
});
beforeEach(() => {
  jest.clearAllMocks(); delete mockParams.itemId; delete mockParams.bookmark_id;
  jest.mocked(endpoints.knowledgeItems).mockResolvedValue({ data: [] });
  jest.mocked(endpoints.knowledgeBookmarks).mockResolvedValue({ data: [] });
  jest.mocked(endpoints.knowledgePromptRuns).mockResolvedValue({ data: [] });
  jest.mocked(endpoints.knowledgeDiscovery).mockResolvedValue({ tip: 'Write focused tests' });
  jest.mocked(endpoints.createKnowledgeBookmark).mockResolvedValue({ id: 99 });
  jest.mocked(endpoints.markKnowledgeBookmarkReviewed).mockResolvedValue({ id: 99 });
});
async function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  const screen = await render(<QueryClientProvider client={client}><KnowledgeScreen /></QueryClientProvider>);
  return { screen, close: async () => { await screen.unmount(); client.clear(); } };
}
test('shows Discover cards with an empty generated feed and filters by title', async () => {
  const { screen, close } = await setup();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Open Coding tip' })).toBeTruthy());
  expect(screen.getByRole('button', { name: 'Open Developer tool of the day' })).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Search knowledge'), 'developer');
  expect(screen.queryByRole('button', { name: 'Open Coding tip' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Open Developer tool of the day' })).toBeTruthy();
  await close();
});
test('keeps discovery cards visible if workspace items fail to load', async () => {
  jest.mocked(endpoints.knowledgeItems).mockRejectedValue(new Error('Offline'));
  const { screen, close } = await setup();
  await waitFor(() => expect(screen.getByText(/Unable to load workspace cards/)).toBeTruthy());
  expect(screen.getByRole('button', { name: 'Open Coding tip' })).toBeTruthy();
  await close();
});
test('saves generated cards with web identity and a collection', async () => {
  const item = { id: 7, title: 'Generated lesson', summary: 'A useful lesson', body: 'Full lesson body', active: true, can_archive: false, generated_source: 'mcp' };
  jest.mocked(endpoints.knowledgeItems).mockImplementation(async active => ({ data: active ? [item] : [] }));
  const { screen, close } = await setup();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Open Generated lesson' })).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: 'Open Generated lesson' }));
  expect(screen.getByText('Full lesson body')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Archive card' })).toBeNull();
  await fireEvent.changeText(screen.getByLabelText('Knowledge collection'), 'My learning');
  await fireEvent.press(screen.getByRole('button', { name: 'Save card' }));
  await waitFor(() => expect(endpoints.createKnowledgeBookmark).toHaveBeenCalledWith(expect.objectContaining({ card_type: 'mcp_knowledge_item', source_id: 'knowledge_item:7', collection_name: 'My learning', reminder_interval_days: 7 })));
  await close();
});
test('opens web-saved tips and supports review due cards', async () => {
  jest.mocked(endpoints.knowledgeBookmarks).mockResolvedValue({ data: [{ id: 9, card_type: 'coding_tip', source_id: 'Write useful tests', payload: { tip: 'Write useful tests' }, collection_name: 'Engineering', next_reminder_at: '2020-01-01T00:00:00Z' }] });
  const { screen, close } = await setup();
  await waitFor(() => expect(screen.getByText('Review due (1)')).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: 'Review due (1)' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Open Coding tip' }));
  expect(screen.getAllByText('Write useful tests').length).toBeGreaterThan(0);
  await fireEvent.press(screen.getByRole('button', { name: 'Mark reviewed' }));
  await waitFor(() => expect(endpoints.markKnowledgeBookmarkReviewed).toHaveBeenCalledWith(9));
  await close();
});
test('opens a generated card targeted by a notification', async () => {
  mockParams.itemId = '7';
  jest.mocked(endpoints.knowledgeItems).mockImplementation(async active => ({ data: active ? [{ id: 7, title: 'Notification lesson', body: 'Read this body', active: true }] : [] }));
  const { screen, close } = await setup();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Close knowledge card' })).toBeTruthy());
  expect(screen.getAllByText('Read this body').length).toBeGreaterThan(0);
  await close();
});

test('retries a failed discovery source without hiding the library', async () => {
  jest.mocked(endpoints.knowledgeDiscovery).mockRejectedValue(new Error('Source unavailable'));
  const { screen, close } = await setup();
  await fireEvent.press(screen.getByRole('button', { name: 'Open Coding tip' }));
  await waitFor(() => expect(screen.getByText('This source is temporarily unavailable.')).toBeTruthy());
  jest.mocked(endpoints.knowledgeDiscovery).mockResolvedValue({ tip: 'Recovered content' });
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(screen.getAllByText('Recovered content').length).toBeGreaterThan(0));
  await close();
});
test('changes the region for local headlines', async () => {
  jest.mocked(endpoints.knowledgeDiscovery).mockImplementation(async (path, params) => path === '/news/local_headlines' ? { region: params?.region, articles: [{ title: 'Local story', url: 'https://example.com/story' }] } : { tip: 'A tip' });
  const { screen, close } = await setup();
  await fireEvent.press(screen.getByRole('button', { name: 'Open Local headlines' }));
  await fireEvent.press(screen.getByRole('button', { name: 'US' }));
  await waitFor(() => expect(endpoints.knowledgeDiscovery).toHaveBeenCalledWith('/news/local_headlines', { region: 'us' }, expect.anything()));
  await close();
});

test('opens the saved bookmark matched by search', async () => {
  mockParams.bookmark_id = '9';
  jest.mocked(endpoints.knowledgeBookmarks).mockResolvedValue({ data: [{ id: 9, card_type: 'coding_tip', source_id: 'Search tip', payload: { tip: 'Search tip body' } }] });
  const { screen, close } = await setup();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Mark reviewed' })).toBeTruthy());
  expect(screen.getAllByText('Search tip body').length).toBeGreaterThan(0);
  await close();
});
