// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import DynamicAdminTable from './DynamicAdminTable';
import { getRecords } from '../api';
vi.mock('../api', () => ({
  getMeta: vi.fn(async () => ({ data: [{ name: 'id', type: 'integer' }, { name: 'name', type: 'string' }] })),
  getRecords: vi.fn(async () => ({ data: { records: [], pagination: { total_pages: 1 } } })),
  createRecord: vi.fn(), updateRecord: vi.fn(), deleteRecord: vi.fn(), resetAdminUserPassword: vi.fn(),
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('applies a column filter and clears it', async () => {
  render(<DynamicAdminTable table="Role" />);
  await waitFor(() => expect(getRecords).toHaveBeenCalled());
  fireEvent.change(screen.getByLabelText('Filter column'), { target: { value: 'name' } });
  fireEvent.change(screen.getByLabelText('Filter records'), { target: { value: 'owner' } });
  fireEvent.click(screen.getByLabelText('Apply filter'));
  await waitFor(() => expect(getRecords).toHaveBeenLastCalledWith('Role', { page: 1, per_page: 10, q: 'owner', search_column: 'name' }));
  fireEvent.click(screen.getByLabelText('Clear filter'));
  await waitFor(() => expect(getRecords).toHaveBeenLastCalledWith('Role', { page: 1, per_page: 10 }));
});

it('hides write actions for read-only tables', async () => {
  getRecords.mockResolvedValueOnce({ data: { records: [{ id: 1, name: 'owner', admin_permissions: { update: false, destroy: false } }], permissions: { create: false }, pagination: { total_pages: 1 } } });
  render(<DynamicAdminTable table="Role" />);
  await screen.findByText('owner');
  expect(screen.queryByText('Add Record')).toBeNull();
  expect(screen.queryByLabelText('Edit Role record 1')).toBeNull();
  expect(screen.queryByLabelText('Delete Role record 1')).toBeNull();
});

it('keeps password reset available without allowing user edits', async () => {
  getRecords.mockResolvedValueOnce({ data: { records: [{ id: 2, name: 'Member', admin_permissions: { update: false, destroy: false, password_reset: true } }], permissions: { create: false }, pagination: { total_pages: 1 } } });
  render(<DynamicAdminTable table="User" />);
  await screen.findByText('Member');
  fireEvent.click(screen.getByLabelText('Edit User record 2'));
  await screen.findByText('Set a new password');
  expect(screen.queryByText('Save Changes')).toBeNull();
  expect(screen.queryByLabelText('Delete User record 2')).toBeNull();
  expect(screen.getByLabelText('New password').disabled).toBe(false);
});
