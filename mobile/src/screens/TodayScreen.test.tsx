import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { beforeEach, expect, jest, test } from '@jest/globals';
import TodayScreen from '../../app/(tabs)/today';
import { endpoints } from '../api/endpoints';
import type { HomeData, Task } from '../api/types';
const mockPush = jest.fn();
let mockDemo = false;
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 1, first_name: 'Alex', demo_account: mockDemo } }) }));
jest.mock('../components/Screen', () => ({ Screen: ({ children, header }: any) => <>{header}{children}</> }));
jest.mock('../api/endpoints', () => ({ endpoints: { home: jest.fn(), homeByTaskFilter: jest.fn(), updateTask: jest.fn() } }));
const task = { id: 7, title: 'Prepare release', status: 'todo', type: 'general', end_date: '2026-10-16' } as Task;
const data: HomeData = { as_of_date: '2026-10-16', summary: { open_tasks: 8, due_today: 2, overdue_tasks: 3, active_projects: 1, work_minutes_today: 10, unread_notifications: 0 }, tasks: [task] };
beforeEach(() => {
  jest.clearAllMocks(); mockDemo = false;
  jest.mocked(endpoints.home).mockResolvedValue(data);
  jest.mocked(endpoints.homeByTaskFilter).mockResolvedValue({ ...data, tasks: [] });
  jest.mocked(endpoints.updateTask).mockResolvedValue({ ...task, status: 'completed' });
});
async function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  const screen = await render(<QueryClientProvider client={client}><TodayScreen /></QueryClientProvider>);
  await screen.findByText('Hello, Alex');
  return { screen, client, close: async () => { await screen.unmount(); client.clear(); } };
}
test('defaults to all open, opens task details, and routes shortcuts', async () => {
  const { screen, close } = await setup();
  await screen.findByText('Prepare release');
  expect(screen.getByRole('button', { name: 'All open, 8 tasks' }).props.accessibilityState.selected).toBe(true);
  await fireEvent.press(screen.getByLabelText('Inspect Prepare release'));
  expect(mockPush).toHaveBeenLastCalledWith('/work?taskId=7');
  for (const [label, route] of [['All tasks', '/work?mode=tasks'], ['Chat', '/inbox?mode=chat'], ['Log work', '/work?mode=logs'], ['Search Nexus Hub', '/search'], ['Create', '/create']]) {
    await fireEvent.press(screen.getByLabelText(label)); expect(mockPush).toHaveBeenLastCalledWith(route);
  }
  await close();
});
test('switches filters without showing previous results while loading', async () => {
  let resolve!: (value: HomeData) => void;
  jest.mocked(endpoints.homeByTaskFilter).mockImplementation(() => new Promise(done => { resolve = done; }));
  const { screen, client, close } = await setup();
  await screen.findByText('Prepare release');
  await fireEvent.press(screen.getByLabelText('Due today, 2 tasks'));
  expect(screen.queryByText('Prepare release')).toBeNull();
  expect(screen.getByText('Loading your tasks')).toBeTruthy();
  await act(async () => { resolve({ ...data, tasks: [] }); });
  await screen.findByText('Nothing due today');
  expect(endpoints.homeByTaskFilter).toHaveBeenCalledWith('due_today');
  expect(client.getQueryData(['home', 'due_today'])).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('All open, 8 tasks'));
  await screen.findByText('Prepare release'); await close();
});
test('shows filter-specific empty states and refreshes every cached home variant after status changes', async () => {
  const { screen, client, close } = await setup();
  await screen.findByText('Prepare release');
  await fireEvent.press(screen.getByLabelText('Overdue, 3 tasks'));
  await screen.findByText('No overdue tasks');
  await fireEvent.press(screen.getByLabelText('All open, 8 tasks'));
  await fireEvent.press(screen.getByRole('tab', { name: 'Done' }));
  await waitFor(() => expect(endpoints.updateTask).toHaveBeenCalledWith(7, 'completed'));
  await waitFor(() => expect(client.getQueryState(['home', 'overdue'])?.isInvalidated).toBe(true));
  await close();
});
test('keeps cached tasks visible after refresh failure with a retry action', async () => {
  const { screen, client, close } = await setup();
  await screen.findByText('Prepare release');
  jest.mocked(endpoints.home).mockRejectedValue(new Error('Offline'));
  await act(async () => { await client.refetchQueries({ queryKey: ['home'], exact: true }); });
  await screen.findByText('Couldn’t refresh. Showing your saved tasks.');
  expect(screen.getByText('Prepare release')).toBeTruthy();
  jest.mocked(endpoints.home).mockResolvedValue(data);
  await fireEvent.press(screen.getByText('Try again'));
  await waitFor(() => expect(screen.queryByText('Couldn’t refresh. Showing your saved tasks.')).toBeNull());
  await close();
});
test('offers retry on initial failure and keeps demo tasks read only', async () => {
  mockDemo = true;
  jest.mocked(endpoints.home).mockRejectedValueOnce(new Error('Offline'));
  const { screen, close } = await setup();
  await screen.findByText('Unable to load');
  await fireEvent.press(screen.getByText('Try again'));
  await screen.findByText('Prepare release');
  expect(screen.queryByLabelText('Create')).toBeNull();
  expect(screen.queryByRole('tab', { name: 'Done' })).toBeNull();
  expect(screen.getByLabelText('Inspect Prepare release')).toBeTruthy();
  await close();
});
