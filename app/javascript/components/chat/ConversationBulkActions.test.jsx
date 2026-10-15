// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../api', () => ({ deleteConversation: vi.fn(), muteConversation: vi.fn(), unmuteConversation: vi.fn() }));
import { deleteConversation, muteConversation } from '../api';
import ConversationBulkActions from './ConversationBulkActions';
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const options = () => ({ selected: new Set([1, 2]), visibleIds: [1, 2], onSelection: vi.fn(), onUpdated: vi.fn(), onRemoved: vi.fn(), onClose: vi.fn() });
it('confirms inbox-only deletion and retains failed selections', async () => {
  deleteConversation.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('Offline'));
  const props = options();
  render(<ConversationBulkActions {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Delete selected for me' }));
  expect(deleteConversation).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm delete for me' }));
  await screen.findByRole('alert');
  expect(props.onRemoved).toHaveBeenCalledWith(1);
  expect(props.onSelection).toHaveBeenCalledWith(new Set([2]));
  expect(props.onClose).not.toHaveBeenCalled();
});
it('applies the selected mute duration to every selected conversation', async () => {
  muteConversation.mockImplementation(id => Promise.resolve({ data: { id, muted: true } }));
  const props = options();
  render(<ConversationBulkActions {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Mute selected' }));
  fireEvent.click(screen.getByRole('button', { name: '1 week' }));
  await waitFor(() => expect(props.onClose).toHaveBeenCalledOnce());
  expect(muteConversation).toHaveBeenCalledWith(1, '1w');
  expect(muteConversation).toHaveBeenCalledWith(2, '1w');
  expect(props.onUpdated).toHaveBeenCalledTimes(2);
});
