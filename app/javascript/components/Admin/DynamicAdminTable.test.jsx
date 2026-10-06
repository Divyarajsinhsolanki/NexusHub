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
