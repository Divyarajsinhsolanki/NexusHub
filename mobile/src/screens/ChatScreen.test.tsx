import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { expect, jest, test } from '@jest/globals';

import ChatRoute from '../../app/(tabs)/inbox/chat/[id]';
import { endpoints } from '../api/endpoints';
import { mobileQueryKeys } from '../cache/mobileCache';

const mockPerform = jest.fn();
jest.mock('@sentry/react-native', () => ({ captureException: jest.fn(), addBreadcrumb: jest.fn(), captureMessage: jest.fn() }));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '7' }),
  usePathname: () => '/chat/7',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 5, full_name: 'Mobile user' } }) }));
jest.mock('../realtime/useChatRealtime', () => ({ useChatRealtime: () => 'connected' }));
jest.mock('../realtime/RealtimeProvider', () => ({ useRealtimeActions: () => ({ perform: mockPerform }) }));
jest.mock('../api/endpoints', () => ({ endpoints: { createMessage: jest.fn(), updateConversationReceipt: jest.fn(async () => undefined) } }));
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
