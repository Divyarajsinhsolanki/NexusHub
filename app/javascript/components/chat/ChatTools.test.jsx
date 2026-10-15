// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ fetchConversationMessages: vi.fn(), fetchScheduledMessages: vi.fn(), scheduleChatMessage: vi.fn(), cancelScheduledMessage: vi.fn(), pinChatMessage: vi.fn() }));
vi.mock('../api', () => mocks);
import ChatToolsDialog from './ChatTools';
import ChatMenu from './ChatMenu';
function ChatTools(props) {
  const [mode, setMode] = React.useState(null);
  return <><ChatMenu label="More actions" icon="…">{close => [['media', 'Shared media'], ['files', 'Shared files'], ['pins', 'Pinned messages'], ['scheduled', 'Scheduled messages']].map(([value, label]) => <button key={value} onClick={() => { close(); setMode(value); }}>{label}</button>)}</ChatMenu><ChatToolsDialog {...props} mode={mode} onModeChange={setMode} /></>;
}
beforeEach(() => {
  vi.clearAllMocks();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  mocks.fetchScheduledMessages.mockResolvedValue({ data: { data: [] } });
  mocks.scheduleChatMessage.mockResolvedValue({ data: { id: 1 } });
});
afterEach(cleanup);
const props = () => ({ conversationId: 7, onCloseThread: vi.fn(), onReply: vi.fn(), onOpen: vi.fn(), draft: { body: 'Draft', attachments: [] }, onScheduled: vi.fn(), readOnly: false });
it('opens pinned messages and supports unpinning', async () => {
  mocks.fetchConversationMessages.mockResolvedValue({ data: { data: [{ id: 10, body: 'Keep this', user_name: 'Author' }], meta: {} } });
  mocks.pinChatMessage.mockResolvedValue({});
  render(<ChatTools {...props()} />);
  fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
  fireEvent.click(screen.getByRole('button', { name: 'Pinned messages' }));
  expect(await screen.findByText('Keep this')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Unpin' }));
  await waitFor(() => expect(mocks.pinChatMessage).toHaveBeenCalledWith(7, 10, false));
});
it('loads a thread and replies to its root', async () => {
  const root = { id: 10, body: 'Root' };
  mocks.fetchConversationMessages.mockResolvedValue({ data: { data: [root], meta: { thread_root: root } } });
  const options = props();
  render(<ChatTools {...options} thread={{ id: 11, reply_to_id: 10 }} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Reply in thread' }));
  expect(options.onReply).toHaveBeenCalledWith(root);
  expect(mocks.fetchConversationMessages).toHaveBeenCalledWith(7, { limit: 50, thread_id: 10 });
});
it('schedules a draft with a timezone-aware instant and retries without duplicates', async () => {
  mocks.scheduleChatMessage.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({});
  const options = props();
  render(<ChatTools {...options} />);
  fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
  fireEvent.click(screen.getByRole('button', { name: 'Scheduled messages' }));
  await waitFor(() => expect(mocks.fetchScheduledMessages).toHaveBeenCalled());
  fireEvent.change(screen.getByLabelText('Scheduled send date and time'), { target: { value: '2030-01-01T09:00' } });
  const send = screen.getByRole('button', { name: 'Schedule message' });
  await waitFor(() => expect(send.disabled).toBe(false));
  fireEvent.click(send);
  await screen.findByRole('alert');
  fireEvent.click(send);
  await waitFor(() => expect(options.onScheduled).toHaveBeenCalledTimes(1));
  const first = mocks.scheduleChatMessage.mock.calls[0][1];
  const second = mocks.scheduleChatMessage.mock.calls[1][1];
  expect(first.get('message[client_id]')).toBe(second.get('message[client_id]'));
  expect(first.get('message[body]')).toBe('Draft');
  expect(first.get('message[send_at]')).toBe(new Date('2030-01-01T09:00').toISOString());
});

it('loads the shared media gallery with pagination and opens message context', async () => {
  mocks.fetchConversationMessages.mockResolvedValueOnce({ data: { data: [{ id: 12, body: 'Photo', attachments: [{ id: 1, filename: 'photo.png', content_type: 'image/png', url: '/photo' }] }], meta: { has_more: true, next_before_id: 12 } } }).mockResolvedValueOnce({ data: { data: [{ id: 9, body: 'Older photo' }], meta: {} } });
  const options = props();
  render(<ChatTools {...options} unreadId={9} onJumpUnread={options.onOpen} />);
  fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
  fireEvent.click(screen.getByRole('button', { name: 'Shared media' }));
  expect(await screen.findByAltText('photo.png')).toBeTruthy();
  expect(mocks.fetchConversationMessages).toHaveBeenCalledWith(7, { limit: 50, attachments: 'media' });
  fireEvent.click(screen.getByRole('button', { name: 'Load older messages' }));
  expect(await screen.findByText('Older photo')).toBeTruthy();
  expect(mocks.fetchConversationMessages).toHaveBeenLastCalledWith(7, { limit: 50, attachments: 'media', before_id: 12 });
  fireEvent.click(screen.getAllByRole('button', { name: 'Open in conversation' })[0]);
  expect(options.onOpen).toHaveBeenCalledWith(9);
});
