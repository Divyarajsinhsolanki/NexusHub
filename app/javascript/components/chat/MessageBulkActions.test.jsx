// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import MessageBulkActions from './MessageBulkActions';
import { pinChatMessage, deleteChatMessage } from '../api';
vi.mock('../api', () => ({ pinChatMessage: vi.fn(), deleteChatMessage: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const messages = [1, 2].map(id => ({ id, user_id: 5, body: `Message ${id}`, created_at: new Date().toISOString() }));
const props = () => ({ messages, selected: new Set([1, 2]), conversationId: 7, userId: 5, onSelection: vi.fn(), onClose: vi.fn(), onChanged: vi.fn(), onBusy: vi.fn() });
it('copies in chronological order without mutating messages', async () => {
  const writeText = vi.fn().mockResolvedValue();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  render(<MessageBulkActions {...props()} messages={[...messages].reverse()} />);
  fireEvent.click(screen.getByText('Copy selected messages'));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith('Message 1\n\nMessage 2'));
  expect(pinChatMessage).not.toHaveBeenCalled();
});
it('keeps failed items selected and applies successful updates', async () => {
  pinChatMessage.mockResolvedValueOnce({ data: messages[0] }).mockRejectedValueOnce(new Error('offline'));
  const p = props(); render(<MessageBulkActions {...p} />);
  fireEvent.click(screen.getByText('Pin selected messages'));
  await waitFor(() => expect(p.onSelection).toHaveBeenCalledWith(new Set([2])));
  expect(p.onChanged).toHaveBeenCalledWith(7, messages[0]);
  expect(p.onClose).not.toHaveBeenCalled();
});
it('prevents deletion of other users messages and hides mutations in demo', () => {
  const p = props(); const view = render(<MessageBulkActions {...p} userId={99} />);
  expect(screen.getByText('Delete selected messages').disabled).toBe(true);
  expect(deleteChatMessage).not.toHaveBeenCalled();
  view.rerender(<MessageBulkActions {...p} readOnly />);
  expect(screen.queryByText('Pin selected messages')).toBeNull();
  expect(screen.getByText('Copy selected messages').disabled).toBe(false);
});
it('requires confirmation before deleting owned messages', async () => {
  vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  deleteChatMessage.mockImplementation(async (_conversation, id) => ({ data: { id, deleted_at: new Date().toISOString() } }));
  const p = props(); render(<MessageBulkActions {...p} />);
  fireEvent.click(screen.getByText('Delete selected messages'));
  expect(deleteChatMessage).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Delete selected messages'));
  await waitFor(() => expect(p.onClose).toHaveBeenCalled());
  expect(deleteChatMessage).toHaveBeenCalledTimes(2);
});
it('stops additional requests after leaving the conversation', async () => {
  let resolve;
  pinChatMessage.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const p = props(); const view = render(<MessageBulkActions {...p} />);
  fireEvent.click(screen.getByText('Pin selected messages'));
  fireEvent.click(screen.getByText('Pin selected messages'));
  expect(pinChatMessage).toHaveBeenCalledTimes(1);
  view.unmount(); resolve({ data: messages[0] });
  await new Promise(done => setTimeout(done, 0));
  expect(pinChatMessage).toHaveBeenCalledTimes(1);
  expect(p.onSelection).not.toHaveBeenCalled();
});
it('caps select loaded at 100 and excludes deleted, pending and system messages', () => {
  const p = props();
  render(<MessageBulkActions {...p} selected={new Set()} messages={[
    { id: -1 }, { id: 900, deleted_at: '2026-01-01' }, { id: 901, message_type: 'system' },
    ...Array.from({ length: 105 }, (_, index) => ({ id: index + 1 })),
  ]} />);
  fireEvent.click(screen.getByText('Select loaded messages'));
  expect([...p.onSelection.mock.calls.at(-1)[0]]).toEqual(Array.from({ length: 100 }, (_, index) => index + 1));
});
