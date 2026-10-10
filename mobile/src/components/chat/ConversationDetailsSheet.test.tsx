import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { expect, jest, test } from '@jest/globals';
import { endpoints } from '../../api/endpoints';
import { ConversationDetailsSheet } from './ConversationDetailsSheet';

jest.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 1 } }) }));
jest.mock('../../api/endpoints', () => ({ endpoints: {
  conversationSummary: jest.fn(async () => ({ id: 12, title: 'Design team', conversation_type: 'group', participants: [], can_delete_for_everyone: true })),
  deleteConversationForEveryone: jest.fn(async () => undefined),
} }));

test('confirms deletion with readable chat text and keeps the API identifier internal', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const removed = jest.fn();
  const screen = await render(<QueryClientProvider client={client}><ConversationDetailsSheet conversationId={12} visible onClose={jest.fn()} onConversationRemoved={removed} /></QueryClientProvider>);
  await waitFor(() => expect(screen.getByLabelText('Delete confirmation')).toBeTruthy());
  expect(screen.getByText(/Type DELETE.*Design team/)).toBeTruthy();
  expect(screen.queryByText(/DELETE 12/)).toBeNull();
  expect(screen.getByLabelText('Delete confirmation').props.placeholder).toBe('DELETE');
  await fireEvent.press(screen.getByRole('button', { name: 'Delete conversation for everyone' }));
  expect(endpoints.deleteConversationForEveryone).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText('Delete confirmation'), 'DELETE');
  await fireEvent.press(screen.getByRole('button', { name: 'Delete conversation for everyone' }));
  await waitFor(() => expect(endpoints.deleteConversationForEveryone).toHaveBeenCalledWith(12, 'DELETE 12'));
  expect(removed).toHaveBeenCalled();
  await screen.unmount();
  client.clear();
});
