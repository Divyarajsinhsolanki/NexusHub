import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { expect, jest, test } from '@jest/globals';

import ChatRoute from '../../app/(tabs)/inbox/chat/[id]';
import { endpoints } from '../api/endpoints';
import { mobileQueryKeys } from '../cache/mobileCache';

const mockPerform = jest.fn();
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
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, gcTime: Infinity, retry: false } } });
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
