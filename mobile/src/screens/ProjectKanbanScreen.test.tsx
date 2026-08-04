import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { beforeEach, expect, jest, test } from '@jest/globals';

import { endpoints } from '../api/endpoints';
import type { Task, User } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { ProjectKanbanScreen } from './ProjectKanbanScreen';

const mockBack = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack, push: jest.fn() }) }));
jest.mock('@react-native-community/netinfo', () => ({ useNetInfo: () => ({ isConnected: true, isInternetReachable: true }) }));
jest.mock('../api/endpoints', () => ({ endpoints: { project: jest.fn(), sprints: jest.fn(), tasks: jest.fn(), updateTask: jest.fn(), createTask: jest.fn(), deleteTask: jest.fn() } }));
jest.mock('../auth/AuthProvider', () => ({ useAuth: jest.fn() }));
jest.mock('../components/Screen', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { Screen: ({ children, header }: { children: React.ReactNode; header?: React.ReactNode }) => React.createElement(View, null, header, children) };
});
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View },
    runOnJS: (callback: (...args: unknown[]) => unknown) => callback,
    useAnimatedStyle: (callback: () => object) => callback(),
    useSharedValue: (value: unknown) => ({ value }),
    withSpring: (value: unknown) => value,
  };
});
jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const chain = () => {
    const gesture: Record<string, unknown> = {};
    ['enabled', 'activateAfterLongPress', 'onStart', 'onUpdate', 'onEnd', 'onFinalize'].forEach((name) => { gesture[name] = () => gesture; });
    return gesture;
  };
  return { Gesture: { Pan: chain }, GestureDetector: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children) };
});

const user: User = {
  id: 5,
  email: 'mobile@example.com',
  first_name: 'Mobile',
  last_name: 'User',
  full_name: 'Mobile User',
  job_title: 'Engineer',
  avatar_color: '#2563eb',
  roles: ['member'],
  workspace: { id: 1, name: 'Mobile Workspace', slug: 'mobile-workspace' },
};
const task: Task = { id: 11, task_id: 'APP-11', title: 'Build native board', type: 'Code', status: 'todo', project_id: 1, sprint_id: 4, developer_id: 5, assigned_to_user: 5, end_date: '2026-08-05' };

beforeEach(() => {
  jest.clearAllMocks();
  (useAuth as jest.MockedFunction<typeof useAuth>).mockReturnValue({
    user,
    isLoading: false,
    signIn: jest.fn() as never,
    signInWithGoogle: jest.fn() as never,
    signInDemo: jest.fn() as never,
    signUp: jest.fn() as never,
    forgotPassword: jest.fn() as never,
    resetPassword: jest.fn() as never,
    signOut: jest.fn() as never,
    refreshUser: jest.fn() as never,
    startImpersonation: jest.fn() as never,
    stopImpersonation: jest.fn() as never,
  });
  (endpoints.project as jest.MockedFunction<typeof endpoints.project>).mockResolvedValue({ id: 1, name: 'Apollo', status: 'running', sprint_count: 1, task_count: 1, qa_mode_enabled: true, users: [{ id: 5, name: 'Mobile User' }] });
  (endpoints.sprints as jest.MockedFunction<typeof endpoints.sprints>).mockResolvedValue([{ id: 4, project_id: 1, name: 'Sprint 4', start_date: '2026-08-01', end_date: '2026-08-14', status: 'active', progress: 0, task_count: 1 }]);
  (endpoints.tasks as jest.MockedFunction<typeof endpoints.tasks>).mockImplementation(async (params = {}) => ({
    data: params.status === 'todo' || params.due_from ? [task] : [],
    meta: { current_page: 1, next_page: null, total_pages: 1, total_count: params.status === 'todo' ? 1 : params.due_from ? 1 : 0, per_page: Number(params.per_page || 30) },
  }));
  (endpoints.updateTask as jest.MockedFunction<typeof endpoints.updateTask>).mockImplementation(async (_id, statusOrInput) => ({ ...task, status: typeof statusOrInput === 'string' ? statusOrInput : task.status }));
});

async function renderBoard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  const screen = await render(<QueryClientProvider client={client}><ProjectKanbanScreen projectId={1} /></QueryClientProvider>);
  return { client, screen };
}

test('renders the full dashboard and moves a task through the accessible sheet', async () => {
  const { client, screen } = await renderBoard();

  expect(await screen.findByText('Build native board')).toBeTruthy();
  expect(screen.getByText('Due date heatmap')).toBeTruthy();
  expect(screen.getByText('Progress overview')).toBeTruthy();

  await fireEvent.press(screen.getByRole('button', { name: 'Move Build native board' }));
  expect(screen.getByText('Move task')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'In progress' }));

  await waitFor(() => expect(endpoints.updateTask).toHaveBeenCalledWith(11, 'inprogress'));
  await waitFor(() => expect(client.isMutating()).toBe(0));
  await screen.unmount();
  client.clear();
});

test('passes QA and My task filters to the paginated task queries', async () => {
  const { client, screen } = await renderBoard();
  await screen.findByText('Build native board');

  await fireEvent.press(screen.getByRole('tab', { name: 'QA' }));
  await fireEvent.press(screen.getByRole('tab', { name: 'My tasks' }));

  await waitFor(() => expect(endpoints.tasks).toHaveBeenCalledWith(expect.objectContaining({ mine: true, type: 'qa', sprint_id: 4, project_id: 1 })));
  await screen.unmount();
  client.clear();
});

test('loads the next page for the active phone lane', async () => {
  (endpoints.tasks as jest.MockedFunction<typeof endpoints.tasks>).mockImplementation(async (params = {}) => ({
    data: params.status === 'todo' ? [params.page === 2 ? { ...task, id: 12, task_id: 'APP-12', title: 'Second board task' } : task] : [],
    meta: { current_page: Number(params.page || 1), next_page: params.status === 'todo' && params.page === 1 ? 2 : null, total_pages: params.status === 'todo' ? 2 : 1, total_count: params.status === 'todo' ? 2 : 0, per_page: Number(params.per_page || 30) },
  }));
  const { client, screen } = await renderBoard();
  await screen.findByText('Build native board');

  await fireEvent(screen.getByTestId('kanban-active-lane'), 'onEndReached');

  await waitFor(() => expect(endpoints.tasks).toHaveBeenCalledWith(expect.objectContaining({ page: 2, status: 'todo' })));
  await screen.unmount();
  client.clear();
});

test('restores the source lane when a task move fails', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  (endpoints.updateTask as jest.MockedFunction<typeof endpoints.updateTask>).mockRejectedValueOnce(new Error('network failed'));
  const { client, screen } = await renderBoard();
  await screen.findByText('Build native board');

  await fireEvent.press(screen.getByRole('button', { name: 'Move Build native board' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Completed' }));

  await waitFor(() => expect(alert).toHaveBeenCalledWith('Unable to move task', 'network failed'));
  await waitFor(() => expect(client.isMutating()).toBe(0));
  expect(screen.getByText('Build native board')).toBeTruthy();
  alert.mockRestore();
  await screen.unmount();
  client.clear();
});

test('shows the no-sprint state without task queries', async () => {
  (endpoints.sprints as jest.MockedFunction<typeof endpoints.sprints>).mockResolvedValueOnce([]);
  const { client, screen } = await renderBoard();

  expect(await screen.findByText('No sprints yet')).toBeTruthy();
  expect(screen.getByText('Create a sprint before organizing project work on the board.')).toBeTruthy();
  await screen.unmount();
  client.clear();
});

test('keeps demo boards read only while allowing task inspection', async () => {
  (useAuth as jest.MockedFunction<typeof useAuth>).mockReturnValue({
    user: { ...user, demo_account: true },
    isLoading: false,
    signIn: jest.fn() as never,
    signInWithGoogle: jest.fn() as never,
    signInDemo: jest.fn() as never,
    signUp: jest.fn() as never,
    forgotPassword: jest.fn() as never,
    resetPassword: jest.fn() as never,
    signOut: jest.fn() as never,
    refreshUser: jest.fn() as never,
    startImpersonation: jest.fn() as never,
    stopImpersonation: jest.fn() as never,
  });
  const { client, screen } = await renderBoard();
  await screen.findByText('Build native board');

  expect(screen.queryByRole('button', { name: 'Create board task' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Move Build native board' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Inspect Build native board' }));
  expect(screen.getByText('Task details')).toBeTruthy();

  await screen.unmount();
  client.clear();
});
