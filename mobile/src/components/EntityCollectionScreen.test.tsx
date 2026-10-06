import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { beforeEach, expect, jest, test } from '@jest/globals';

import { endpoints } from '../api/endpoints';
import { draftStore } from '../storage/draftStore';
import { EntityCollectionScreen } from './EntityCollectionScreen';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
jest.mock('./Screen', () => ({ Screen: ({ children, header }: any) => <>{header}{children}</> }));
jest.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 5, workspace: { id: 1 } } }) }));
jest.mock('../api/endpoints', () => ({ endpoints: { resource: jest.fn(), updateResource: jest.fn(), createResource: jest.fn(), deleteResource: jest.fn() } }));
jest.mock('../storage/draftStore', () => ({ draftStore: { get: jest.fn(), set: jest.fn(), remove: jest.fn() } }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(endpoints.resource).mockResolvedValue({ data: [] } as never);
  jest.mocked(draftStore.get).mockResolvedValue(null);
  jest.mocked(draftStore.set).mockResolvedValue(undefined);
  jest.mocked(draftStore.remove).mockResolvedValue(undefined);
  jest.mocked(endpoints.createResource).mockResolvedValue({ id: 9 } as never);
});

async function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const screen = await render(<QueryClientProvider client={client}><EntityCollectionScreen title="People" subtitle="Directory" path="/users" wrapper="user" primary="full_name" fields={[{ key: 'first_name', label: 'First name', required: true }, { key: 'password', label: 'Password', secure: true, createOnly: true }]} /></QueryClientProvider>);
  return { screen, client };
}

test('validates editable fields rather than the computed display name and never stores passwords', async () => {
  const { screen, client } = await setup();
  await fireEvent.press(screen.getByLabelText('Create People'));
  await waitFor(() => expect(screen.getByLabelText('First name').props.editable).toBe(true));
  await fireEvent.changeText(screen.getByLabelText('First name'), 'Divyaraj');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'private-password');
  expect(jest.mocked(draftStore.set).mock.calls.at(-1)?.[1]).toEqual({ first_name: 'Divyaraj' });
  jest.mocked(draftStore.remove).mockRejectedValue(new Error('Storage unavailable'));
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(endpoints.createResource).toHaveBeenCalledWith('/users', 'user', { first_name: 'Divyaraj', password: 'private-password' }));
  await waitFor(() => expect(screen.queryByLabelText('First name')).toBeNull());
  await screen.unmount();
  client.clear();
});

test('a dismissed editor cannot restore its draft into the next editor', async () => {
  let resolveOld!: (value: any) => void;
  jest.mocked(draftStore.get).mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
  const { screen, client } = await setup();
  await fireEvent.press(screen.getByLabelText('Create People'));
  await fireEvent.press(screen.getByLabelText('Close editor'));
  await fireEvent.press(screen.getByLabelText('Create People'));
  await waitFor(() => expect(screen.getByLabelText('First name').props.editable).toBe(true));
  await fireEvent.changeText(screen.getByLabelText('First name'), 'Current draft');
  await act(async () => resolveOld({ first_name: 'Stale draft' }));
  expect(screen.getByLabelText('First name').props.value).toBe('Current draft');
  await screen.unmount();
  client.clear();
});
