import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { beforeEach, expect, jest, test } from '@jest/globals';

import { endpoints } from '../api/endpoints';
import type { Sprint, Task } from '../api/types';
import { TaskEditor } from './TaskEditor';

jest.mock('../api/endpoints', () => ({ endpoints: { createTask: jest.fn(), updateTask: jest.fn(), deleteTask: jest.fn() } }));

const sprint: Sprint = { id: 4, project_id: 1, name: 'Sprint 4', start_date: '2026-08-01', end_date: '2026-08-14', status: 'active', progress: 0, task_count: 1 };
const task: Task = { id: 11, task_id: 'APP-11', title: 'Existing task', type: 'Code', status: 'todo', project_id: 1, sprint_id: 4, developer_id: 5 };

beforeEach(() => {
  jest.clearAllMocks();
  (endpoints.createTask as jest.MockedFunction<typeof endpoints.createTask>).mockResolvedValue({ ...task, id: 12, type: 'qa' });
  (endpoints.updateTask as jest.MockedFunction<typeof endpoints.updateTask>).mockResolvedValue(task);
});

async function renderEditor(element: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false }, mutations: { gcTime: Infinity, retry: false } } });
  const screen = await render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
  return { client, screen };
}

test('creates a task with board defaults', async () => {
  const onSaved = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const { client, screen } = await renderEditor(<TaskEditor defaults={{ type: 'qa', status: 'inprogress', sprint_id: 4, assigned_to_user: 5, qa_assigned: 'Mobile User' }} members={[{ id: 5, name: 'Mobile User' }]} onClose={jest.fn()} onSaved={onSaved} projectId={1} sprints={[sprint]} visible />);

  await fireEvent.changeText(screen.getByLabelText('Title'), 'Verify board flow');
  await fireEvent.press(screen.getByRole('button', { name: 'Create task' }));

  await waitFor(() => expect(endpoints.createTask).toHaveBeenCalledWith(expect.objectContaining({ title: 'Verify board flow', project_id: 1, sprint_id: 4, type: 'qa', status: 'inprogress', assigned_to_user: 5, qa_assigned: 'Mobile User' })));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  await screen.unmount();
  client.clear();
});

test('updates an existing task from the same editor', async () => {
  const onSaved = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const { client, screen } = await renderEditor(<TaskEditor members={[{ id: 5, name: 'Mobile User' }]} onClose={jest.fn()} onSaved={onSaved} projectId={1} sprints={[sprint]} task={task} />);

  await fireEvent.changeText(screen.getByLabelText('Title'), 'Updated task');
  await fireEvent.press(screen.getByRole('button', { name: 'Save task' }));

  await waitFor(() => expect(endpoints.updateTask).toHaveBeenCalledWith(11, expect.objectContaining({ title: 'Updated task', project_id: 1, sprint_id: 4 })));
  await screen.unmount();
  client.clear();
});
