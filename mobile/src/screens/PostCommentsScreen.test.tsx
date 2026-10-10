import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { beforeEach, expect, jest, test } from '@jest/globals';
import PostCommentsScreen from '../../app/(tabs)/inbox/post/[id]';
import { endpoints } from '../api/endpoints';

const mockBack = jest.fn();
let mockDemo = false;
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ id: '12' }), useRouter: () => ({ back: mockBack }) }));
jest.mock('../components/Screen', () => ({ Screen: ({ children, header }: any) => <>{header}{children}</> }));
jest.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 1, first_name: 'Alex', last_name: 'Morgan', full_name: 'Alex Morgan', demo_account: mockDemo } }) }));
jest.mock('../api/endpoints', () => ({ endpoints: { post: jest.fn(), postComments: jest.fn(), createComment: jest.fn(), deleteComment: jest.fn() } }));
const author = { id: 1, first_name: 'Alex', last_name: 'Morgan' };
const comment = { id: 7, body: 'Existing comment', created_at: '2026-10-10T08:00:00Z', can_delete: true, user: author };
const post = { id: 12, message: 'Original team update', created_at: '2026-10-10T07:00:00Z', likes_count: 2, comments_count: 1, user: author };

beforeEach(() => {
  jest.clearAllMocks();
  mockDemo = false;
  jest.mocked(endpoints.post).mockResolvedValue(post as never);
  jest.mocked(endpoints.postComments).mockResolvedValue({ data: [comment] } as never);
  jest.mocked(endpoints.createComment).mockResolvedValue({ ...comment, id: 8, body: 'My comment' } as never);
  jest.mocked(endpoints.deleteComment).mockResolvedValue(undefined);
});
async function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  client.setQueryData(['posts'], { data: [post] });
  const screen = await render(<QueryClientProvider client={client}><PostCommentsScreen /></QueryClientProvider>);
  await waitFor(() => expect(screen.getByText('Original team update')).toBeTruthy());
  return { screen, client, close: async () => { await screen.unmount(); client.clear(); } };
}

test('shows parent post and sends the captured comment after clearing the composer', async () => {
  let resolve!: (value: any) => void;
  jest.mocked(endpoints.createComment).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  const { screen, close } = await setup();
  await fireEvent.changeText(screen.getByLabelText('Comment'), '  My comment  ');
  await fireEvent.press(screen.getByRole('button', { name: 'Send comment' }));
  await waitFor(() => expect(endpoints.createComment).toHaveBeenCalledWith(12, 'My comment'));
  expect(screen.getByLabelText('Comment').props.value).toBe('');
  expect(screen.getByText('Sending…')).toBeTruthy();
  expect(screen.getByLabelText('Comment').props.editable).toBe(false);
  await act(async () => resolve({ ...comment, id: 8, body: 'My comment' }));
  await close();
});

test('failed sending restores the draft and removes its optimistic comment', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.mocked(endpoints.createComment).mockRejectedValueOnce(new Error('Offline'));
  const { screen, client, close } = await setup();
  await fireEvent.changeText(screen.getByLabelText('Comment'), 'Keep my draft');
  await fireEvent.press(screen.getByRole('button', { name: 'Send comment' }));
  await waitFor(() => expect(screen.getByLabelText('Comment').props.value).toBe('Keep my draft'));
  expect((client.getQueryData(['post-comments', 12]) as any).data.some((row: any) => row.id < 0)).toBe(false);
  expect(alert).toHaveBeenCalledWith('Comment not sent', expect.any(String));
  await close(); alert.mockRestore();
});

test('asks before deleting and reports deletion failures', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.mocked(endpoints.deleteComment).mockRejectedValueOnce(new Error('Offline'));
  const { screen, close } = await setup();
  await fireEvent.press(screen.getByRole('button', { name: 'Delete comment by Alex Morgan' }));
  expect(endpoints.deleteComment).not.toHaveBeenCalled();
  const confirm = alert.mock.calls[0][2]!.find((button) => button.text === 'Delete')!;
  await act(async () => confirm.onPress!());
  await waitFor(() => expect(alert).toHaveBeenCalledWith('Unable to delete comment', expect.any(String)));
  expect(screen.getByText('Existing comment')).toBeTruthy();
  await close(); alert.mockRestore();
});

test('demo discussions remain readable without mutation controls', async () => {
  mockDemo = true;
  const { screen, close } = await setup();
  expect(screen.getByText('Existing comment')).toBeTruthy();
  expect(screen.queryByLabelText('Comment')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Delete comment by Alex Morgan' })).toBeNull();
  expect(screen.getByText('Comments are read only in the demo.')).toBeTruthy();
  await close();
});
