// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AccountLifecycle from './AccountLifecycle';
import api from '../api';
vi.mock('../api', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const status = { status: 'none', retention: 'Personal data is removed after seven days.', can_delete: true, needs_transfer: true, successors: [{ id: 8, name: 'Next Owner' }] };
it('requires verification, confirmation and successor before scheduling', async () => {
  api.get.mockResolvedValue({ data: { data: status } });
  api.post.mockResolvedValue({ data: { data: { ...status, status: 'verification_pending' } } });
  render(<AccountLifecycle />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Delete Account' }).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Delete Account' }));
  fireEvent.click(screen.getByRole('button', { name: 'Send verification code' }));
  const confirm = await screen.findByRole('button', { name: 'Confirm account deletion' });
  expect(confirm.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Email verification code'), { target: { value: '123456' } });
  fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), { target: { value: 'DELETE' } });
  expect(confirm.disabled).toBe(true);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '8' } });
  fireEvent.click(confirm);
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/account/deletion', { verification_code: '123456', confirmation: 'DELETE', successor_id: '8' }));
});
it('shows a pending deletion and lets the user cancel without re-verifying', async () => {
  api.get.mockResolvedValue({ data: { data: { ...status, status: 'scheduled', delete_after: '2026-10-20T10:00:00Z', receipt_id: 'reference' } } });
  api.delete.mockResolvedValue({ data: { data: { ...status, status: 'cancelled' } } });
  render(<AccountLifecycle />);
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel account deletion' }));
  await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/account/deletion'));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Cancel account deletion' })).toBeNull());
});
