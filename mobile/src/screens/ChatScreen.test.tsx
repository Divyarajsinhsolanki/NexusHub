import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { expect, jest, test } from '@jest/globals';

import ChatRoute from '../../app/(tabs)/inbox/chat/[id]';
import { endpoints } from '../api/endpoints';
import { mobileQueryKeys } from '../cache/mobileCache';

const mockCopy = jest.fn(async (_text: unknown) => undefined);
jest.mock('expo-clipboard', () => ({ setStringAsync: (...args: unknown[]) => mockCopy(args[0]) }));
const mockPerform = jest.fn();
let mockRouteParams: { id: string; messageId?: string } = { id: '7' };
let mockChatEvent: (event: any) => void;
jest.mock('@sentry/react-native', () => ({ captureException: jest.fn(), addBreadcrumb: jest.fn(), captureMessage: jest.fn() }));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockRouteParams,
  usePathname: () => '/chat/7',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 5, full_name: 'Mobile user' } }) }));
jest.mock('../realtime/useChatRealtime', () => ({ useChatRealtime: (_id: number, callback: (event: any) => void) => { mockChatEvent = callback; return 'connected'; } }));
jest.mock('../realtime/RealtimeProvider', () => ({ useRealtimeActions: () => ({ perform: mockPerform }) }));
jest.mock('../api/endpoints', () => ({ endpoints: { messageContext: jest.fn(), createMessage: jest.fn(), updateConversationReceipt: jest.fn(async () => undefined) } }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'stable-client-draft' }));

test('opens a cached chat safely and sends an idempotent message', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, gcTime: Infinity, retry: false }, mutations: { gcTime: Infinity } } });
  client.setQueryData(mobileQueryKeys.conversation(7), { id: 7, title: 'Team chat', participants: { obsolete: true } });
  client.setQueryData(mobileQueryKeys.messages(7), {
    pageParams: [undefined],
    pages: [{ data: [null, { id: 10, body: 'Message from web', user_id: '2', user_name: { obsolete: true }, created_at: '2026-10-06T00:00:00Z' }] }],
  });
  jest.mocked(endpoints.createMessage).mockResolvedValue({ id: 11, body: 'Reply from mobile', user_id: 5, client_id: 'stable-client-draft', created_at: '2026-10-06T00:01:00Z' });
  const screen = await render(<QueryClientProvider client={client}><ChatRoute /></QueryClientProvider>);
  expect(screen.getByText('Team chat')).toBeTruthy();
  expect(screen.getByText(/Message from web/)).toBeTruthy();
  await fireEvent.changeText(screen.getByPlaceholderText('Message'), 'Reply from mobile');
  await fireEvent.press(screen.getByRole('button', { name: 'Send message' }));
  await waitFor(() => expect(endpoints.createMessage).toHaveBeenCalledTimes(1));
  const form = jest.mocked(endpoints.createMessage).mock.calls[0][1];
  expect(form.get('message[client_id]')).toBe('stable-client-draft');
  expect(form.get('message[body]')).toBe('Reply from mobile');
  await waitFor(() => expect(screen.getByText(/Reply from mobile/)).toBeTruthy());
  await screen.unmount();
  client.clear();
});

test('long press can select a reply and preserve its target when sending', async () => {
  jest.clearAllMocks();
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, gcTime: Infinity, retry: false }, mutations: { gcTime: Infinity } } });
  client.setQueryData(mobileQueryKeys.conversation(7), { id: 7, title: 'Replies', participants: [] });
  client.setQueryData(mobileQueryKeys.messages(7), { pageParams: [undefined], pages: [{ data: [{ id: 10, body: 'Original message', user_id: 2, user_name: 'Teammate', created_at: '2026-10-06T00:00:00Z' }] }] });
  jest.mocked(endpoints.createMessage).mockResolvedValue({ id: 11, body: 'Quoted reply', user_id: 5, created_at: '2026-10-06T00:01:00Z', reply_to: { id: 10, body: 'Original message', user_id: 2, user_name: 'Teammate' } });
  const screen = await render(<QueryClientProvider client={client}><ChatRoute /></QueryClientProvider>);
  await fireEvent(screen.getByText(/Original message/), 'longPress');
  await fireEvent.press(screen.getByRole('button', { name: 'Reply to message' }));
  expect(screen.getByText('Reply to Teammate')).toBeTruthy();
  await fireEvent.changeText(screen.getByPlaceholderText('Message'), 'Quoted reply');
  await fireEvent.press(screen.getByRole('button', { name: 'Send message' }));
  await waitFor(() => expect(endpoints.createMessage).toHaveBeenCalledTimes(1));
  expect(jest.mocked(endpoints.createMessage).mock.calls[0][1].get('message[reply_to_id]')).toBe('10');
  await screen.unmount(); client.clear();
});

test('typing refreshes across a long burst and combines group participants', async () => {
  jest.clearAllMocks();
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, gcTime: Infinity, retry: false } } });
  client.setQueryData(mobileQueryKeys.conversation(7), { id: 7, title: 'Typing group', conversation_type: 'group', participants: [] });
  client.setQueryData(mobileQueryKeys.messages(7), { pageParams: [undefined], pages: [{ data: [] }] });
  const screen = await render(<QueryClientProvider client={client}><ChatRoute /></QueryClientProvider>);
  const now = jest.spyOn(Date, 'now');
  now.mockReturnValue(10000);
  await fireEvent.changeText(screen.getByPlaceholderText('Message'), 'Hi');
  now.mockReturnValue(11200);
  await fireEvent.changeText(screen.getByPlaceholderText('Message'), 'Hi team');
  expect(mockPerform.mock.calls.filter(([, action, payload]: any[]) => action === 'typing' && payload.is_typing)).toHaveLength(2);
  await act(() => {
    mockChatEvent({ type: 'typing_indicator', conversation_id: 7, user_id: 2, user_name: 'Anita', is_typing: true });
    mockChatEvent({ type: 'typing_indicator', conversation_id: 7, user_id: 3, user_name: 'Sam', is_typing: true });
  });
  expect(screen.getByText('Several people are typing…')).toBeTruthy();
  await act(() => mockChatEvent({ type: 'typing_indicator', conversation_id: 7, user_id: 3, is_typing: false }));
  expect(screen.getByText('Anita is typing…')).toBeTruthy();
  await fireEvent.changeText(screen.getByPlaceholderText('Message'), '');
  expect(mockPerform).toHaveBeenLastCalledWith({ channel: 'ChatChannel', conversation_id: 7 }, 'typing', { conversation_id: 7, is_typing: false });
  now.mockRestore();
  await screen.unmount(); client.clear();
});

test('opens at unread messages without marking the latest read until jumping down', async () => {
  jest.clearAllMocks();
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, gcTime: Infinity, retry: false }, mutations: { gcTime: Infinity } } });
  client.setQueryData(mobileQueryKeys.conversation(7), { id: 7, title: 'Unread thread', unread_count: 1, first_unread_message_id: 12, participants: [{ id: 5, name: 'Mobile user', last_read_message_id: 10 }] });
  client.setQueryData(mobileQueryKeys.messages(7), { pageParams: [undefined], pages: [{ data: [{ id: 10, body: 'Read message', user_id: 2, created_at: '2026-10-06T00:00:00Z' }, { id: 12, body: 'Unread message', user_id: 2, created_at: '2026-10-06T00:01:00Z' }] }] });
  const screen = await render(<QueryClientProvider client={client}><ChatRoute /></QueryClientProvider>);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Jump to new messages' })).toBeTruthy());
  expect(jest.mocked(endpoints.updateConversationReceipt).mock.calls.some(call => call[1] === 12 && call[2] === 'read')).toBe(false);
  await fireEvent.press(screen.getByRole('button', { name: 'Jump to new messages' }));
  await waitFor(() => expect(endpoints.updateConversationReceipt).toHaveBeenCalledWith(7, 12, 'read'));
  await screen.unmount(); client.clear();
});

test('offers all web reactions and sends an added emoji', async () => {
  jest.clearAllMocks();
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, gcTime: Infinity, retry: false }, mutations: { gcTime: Infinity } } });
  client.setQueryData(mobileQueryKeys.conversation(7), { id: 7, title: 'Reactions', participants: [] });
  client.setQueryData(mobileQueryKeys.messages(7), { pageParams: [undefined], pages: [{ data: [{ id: 10, body: 'React here', user_id: 2, user_name: 'Teammate', created_at: '2026-10-06T00:00:00Z' }] }] });
  Object.assign(endpoints, { reactToMessage: jest.fn(async () => ({ reactions: { '🚀': 1 } })) });
  const screen = await render(<QueryClientProvider client={client}><ChatRoute /></QueryClientProvider>);
  await fireEvent(screen.getByText(/React here/), 'longPress');
  expect(screen.getAllByRole('button', { name: /^React / })).toHaveLength(25);
  await fireEvent.press(screen.getByRole('button', { name: 'React 🚀' }));
  await waitFor(() => expect(endpoints.reactToMessage).toHaveBeenCalledWith(7, 10, '🚀'));
  await screen.unmount();
  client.clear();
});
test('inserts workspace mention and task suggestions without losing composer text', async () => {
  jest.clearAllMocks();
  Object.assign(endpoints, {
    users: jest.fn(async () => ({ data: [{ id: 2, name: 'Sam', email: 'sam@example.test' }], meta: {} })),
    tasks: jest.fn(async () => ({ data: [{ id: 7, task_id: 'AC-7', title: 'Fix calendar', project_id: 4 }], meta: {} })),
  });
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, gcTime: Infinity, retry: false }, mutations: { gcTime: Infinity } } });
  client.setQueryData(mobileQueryKeys.conversation(7), { id: 7, title: 'Mentions', participants: [] });
  client.setQueryData(mobileQueryKeys.messages(7), { pageParams: [undefined], pages: [{ data: [] }] });
  const screen = await render(<QueryClientProvider client={client}><ChatRoute /></QueryClientProvider>);
  const input = screen.getByPlaceholderText('Message');
  await fireEvent.changeText(input, 'Hello @sa');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Insert @sam' })).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: 'Insert @sam' }));
  expect(input.props.value).toBe('Hello @sam ');
  await fireEvent.changeText(input, 'Hello @sam check #AC');
  await fireEvent.press(screen.getByRole('button', { name: 'Insert #AC-7' }));
  expect(input.props.value).toBe('Hello @sam check #AC-7 ');
  await screen.unmount(); client.clear();
});


test('a push target loads older message context instead of only the latest page', async () => {
  jest.clearAllMocks();
  mockRouteParams = { id: '7', messageId: '8' };
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, gcTime: Infinity, retry: false } } });
  client.setQueryData(mobileQueryKeys.conversation(7), { id: 7, title: 'Notification target', participants: [] });
  client.setQueryData(mobileQueryKeys.messages(7), { pageParams: [undefined], pages: [{ data: [] }] });
  jest.mocked(endpoints.messageContext).mockResolvedValue({ data: [{ id: 8, body: 'Older message from the push', user_id: 2, user_name: 'Teammate', created_at: '2026-10-06T00:00:00Z' }] } as never);
  const screen = await render(<QueryClientProvider client={client}><ChatRoute /></QueryClientProvider>);
  await waitFor(() => expect(endpoints.messageContext).toHaveBeenCalledWith(7, 8));
  await waitFor(() => expect(screen.getByText(/Older message from the push/)).toBeTruthy());
  await screen.unmount(); client.clear(); mockRouteParams = { id: '7' };
});

test('copies the full message from the long-press menu', async () => {
  jest.clearAllMocks();
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, gcTime: Infinity, retry: false } } });
  client.setQueryData(mobileQueryKeys.conversation(7), { id: 7, title: 'Copy', participants: [] });
  client.setQueryData(mobileQueryKeys.messages(7), { pageParams: [undefined], pages: [{ data: [{ id: 10, body: 'Copy this entire message', user_id: 2, created_at: '2026-10-06T00:00:00Z' }] }] });
  const screen = await render(<QueryClientProvider client={client}><ChatRoute /></QueryClientProvider>);
  await fireEvent(screen.getByText(/Copy this entire message/), 'longPress');
  await fireEvent.press(screen.getByRole('button', { name: 'Copy message' }));
  expect(mockCopy).toHaveBeenCalledWith('Copy this entire message');
  await screen.unmount(); client.clear();
});
