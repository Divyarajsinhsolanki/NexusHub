// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import GroupProfile from './GroupProfile';
import { updateConversation } from '../api';
vi.mock('../api', () => ({ updateConversation: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const group = { id: 7, conversation_type: 'group', description: 'Design notes', can_edit_group: true, can_edit_group_info: true, members_can_edit_group_info: false };
it('allows managers to save description, photo and member permissions', async () => {
  const updated = vi.fn();
  updateConversation.mockResolvedValue({ data: { ...group, description: 'New notes', members_can_edit_group_info: true } });
  render(<GroupProfile conversation={group} onUpdated={updated} />);
  fireEvent.click(screen.getByRole('button', { name: 'Edit group info' }));
  fireEvent.change(screen.getByLabelText('Group description'), { target: { value: 'New notes' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /Allow all group members/ }));
  const photo = new File(['png'], 'group.png', { type: 'image/png' });
  fireEvent.change(screen.getByLabelText('Group photo'), { target: { files: [photo] } });
  fireEvent.click(screen.getByRole('button', { name: 'Save group info' }));
  await waitFor(() => expect(updated).toHaveBeenCalledOnce());
  const form = updateConversation.mock.calls[0][1];
  expect(form.get('conversation[description]')).toBe('New notes');
  expect(form.get('conversation[members_can_edit_group_info]')).toBe('true');
  expect(form.get('conversation[group_photo]').name).toBe('group.png');
});
it('permits members to edit info without exposing or submitting admin settings', async () => {
  updateConversation.mockResolvedValue({ data: group });
  render(<GroupProfile conversation={{ ...group, can_edit_group: false }} onUpdated={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Edit group info' }));
  expect(screen.queryByRole('checkbox', { name: /Allow all group members/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Save group info' }));
  await waitFor(() => expect(updateConversation).toHaveBeenCalledOnce());
  expect(updateConversation.mock.calls[0][1].has('conversation[members_can_edit_group_info]')).toBe(false);
});
it('hides editing from restricted and read-only members', () => {
  const view = render(<GroupProfile conversation={{ ...group, can_edit_group: false, can_edit_group_info: false }} onUpdated={vi.fn()} />);
  expect(screen.queryByRole('button', { name: 'Edit group info' })).toBeNull();
  view.rerender(<GroupProfile conversation={group} onUpdated={vi.fn()} readOnly />);
  expect(screen.queryByRole('button', { name: 'Edit group info' })).toBeNull();
});
it('keeps drafts and displays server errors without closing the editor', async () => {
  updateConversation.mockRejectedValue({ response: { data: { errors: ['Permission changed'] } } });
  render(<GroupProfile conversation={group} onUpdated={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Edit group info' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save group info' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Permission changed');
  expect(screen.getByLabelText('Group description').value).toBe('Design notes');
});
