import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { expect, jest, test, beforeEach } from '@jest/globals';
import * as Clipboard from 'expo-clipboard';
import { MessageBulkActions } from './MessageBulkActions';
import { endpoints } from '../../api/endpoints';
import type { Message } from '../../api/types';
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('../../api/endpoints', () => ({ endpoints: { pinMessage: jest.fn(), deleteMessage: jest.fn() } }));
beforeEach(() => { jest.clearAllMocks(); });
const messages = [1, 2].map(id => ({ id, user_id: 5, body: `Message ${id}`, created_at: new Date().toISOString() })) as Message[];
const props = () => ({ messages, selected: new Set([1, 2]), conversationId: 7, userId: 5, readOnly: false, onSelection: jest.fn(), onClose: jest.fn(), onChanged: jest.fn(), onBusy: jest.fn() });
test('copies selected messages in order', async () => {
  (Clipboard.setStringAsync as jest.Mock).mockResolvedValue(undefined as never);
  const screen = await render(<MessageBulkActions {...props()} messages={[...messages].reverse()} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Copy selected messages' }));
  await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith('Message 1\n\nMessage 2'));
  await screen.unmount();
});
test('retains only failed items for retry', async () => {
  (endpoints.pinMessage as jest.Mock).mockResolvedValueOnce(messages[0] as never).mockRejectedValueOnce(new Error('offline') as never);
  const p = props(); const screen = await render(<MessageBulkActions {...p} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Pin selected messages' }));
  await waitFor(() => expect(p.onSelection).toHaveBeenCalledWith(new Set([2])));
  expect(p.onChanged).toHaveBeenCalledWith(messages[0]);
  expect(p.onClose).not.toHaveBeenCalled();
  await screen.unmount();
});
test('keeps demo selection read only', async () => {
  const screen = await render(<MessageBulkActions {...props()} readOnly />);
  expect(screen.queryByRole('button', { name: 'Delete selected messages' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Copy selected messages' })).toBeTruthy();
  await screen.unmount();
});
