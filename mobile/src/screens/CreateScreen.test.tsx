import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { beforeEach, expect, jest, test } from '@jest/globals';

import CreateScreen from '../../app/create';
import { endpoints } from '../api/endpoints';
import { draftStore } from '../storage/draftStore';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({}), useRouter: () => ({ back: mockBack }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
jest.mock('@react-native-community/datetimepicker', () => require('react-native').View);
jest.mock('expo-crypto', () => ({ randomUUID: () => 'message-client-id' }));
jest.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 5, workspace: { id: 1 } } }) }));
jest.mock('../api/endpoints', () => ({ endpoints: { projects: jest.fn(), conversations: jest.fn(), createTask: jest.fn(), createMessage: jest.fn() } }));
jest.mock('../storage/draftStore', () => ({ draftStore: { get: jest.fn(), set: jest.fn(), remove: jest.fn() } }));
jest.mock('expo-haptics', () => ({ NotificationFeedbackType: { Success: 'success' }, notificationAsync: jest.fn(async () => { throw new Error('No haptics'); }), impactAsync: jest.fn(async () => undefined), ImpactFeedbackStyle: { Light: 'light' } }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(endpoints.projects).mockResolvedValue([{ id: 1, name: 'Project' }] as never);
  jest.mocked(endpoints.conversations).mockResolvedValue({ data: [{ id: 7, title: 'Chat' }] } as never);
  jest.mocked(endpoints.createTask).mockResolvedValue({ id: 1 } as never);
  jest.mocked(draftStore.get).mockResolvedValue(null);
  jest.mocked(draftStore.set).mockResolvedValue(undefined);
  jest.mocked(draftStore.remove).mockRejectedValue(new Error('No storage'));
});

async function setup(inboxCache?: unknown) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  if (inboxCache) client.setQueryData(['conversations'], inboxCache);
  const screen = await render(<QueryClientProvider client={client}><CreateScreen /></QueryClientProvider>);
  return { screen, client };
}

test('message creation does not reuse the paginated inbox cache', async () => {
  const inbox = { pages: [{ data: [{ id: 99, title: 'Cached chat' }] }], pageParams: [undefined] };
  const { screen, client } = await setup(inbox);
  await fireEvent.press(screen.getByRole('tab', { name: 'Message' }));
  await waitFor(() => expect(endpoints.conversations).toHaveBeenCalled());
  expect(client.getQueryData(['conversations'])).toEqual(inbox);
  await screen.unmount(); client.clear();
});

test('personal tasks stay personal and successful saves survive storage and haptic failures', async () => {
  const { screen, client } = await setup();
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  await waitFor(() => expect(screen.getByLabelText('Title').props.editable).toBe(true));
  await fireEvent.changeText(screen.getByLabelText('Title'), 'Personal task');
  await fireEvent.press(screen.getByRole('button', { name: 'Create Task' }));
  await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
  expect(endpoints.createTask).toHaveBeenCalledWith({ title: 'Personal task', description: '', type: 'general', status: 'todo' });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['project-tasks'] });
  expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['conversations'] });
  await screen.unmount(); client.clear();
});

test('late task drafts cannot overwrite a post or be saved in its draft', async () => {
  let resolveOld!: (value: any) => void;
  jest.mocked(draftStore.get).mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
  const { screen, client } = await setup();
  await fireEvent.press(screen.getByRole('tab', { name: 'Post' }));
  await waitFor(() => expect(screen.getByLabelText('Message').props.editable).toBe(true));
  await fireEvent.changeText(screen.getByLabelText('Message'), 'New post');
  await act(async () => resolveOld({ title: 'Old task', description: 'Old details' }));
  expect(screen.getByLabelText('Message').props.value).toBe('New post');
  expect(jest.mocked(draftStore.set).mock.calls.some(([identity, value]) => identity.key === 'create:post' && (value as any).title === 'Old task')).toBe(false);
  await screen.unmount(); client.clear();
});
