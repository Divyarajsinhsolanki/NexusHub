// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import PrivacyRequestQueue from './PrivacyRequestQueue';
import { AuthContext } from '../../context/AuthContext';
import api from '../api';
vi.mock('../../context/AuthContext', async () => ({ AuthContext: (await import('react')).createContext(null) }));
vi.mock('../api', () => ({ default: { get: vi.fn(), patch: vi.fn() } }));
beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);
it('does not expose the queue to workspace administrators', () => {
  render(<AuthContext.Provider value={{ user: { id: 1, site_admin: false } }}><PrivacyRequestQueue /></AuthContext.Provider>);
  expect(api.get).not.toHaveBeenCalled();
  expect(screen.queryByText('Privacy operator queue')).toBeNull();
});
it('records the operator review with an explicit identity check and concurrency version', async () => {
  const record = { reference: 'case', status: 'received', request_type: 'access', target_response_at: '2026-11-14', email_verified_at: '2026-10-15', lock_version: 2, details: { email: 'requester@example.test', details: 'Correct my records.' } };
  api.get.mockResolvedValue({ data: [record] }); api.patch.mockResolvedValue({});
  render(<AuthContext.Provider value={{ user: { id: 1, site_admin: true } }}><PrivacyRequestQueue /></AuthContext.Provider>);
  await screen.findByText('Correct my records.');
  fireEvent.change(screen.getByLabelText('Internal review / verification basis'), { target: { value: 'Confirmed authority via established channel.' } });
  fireEvent.click(screen.getByLabelText('Identity and representative authority have been verified proportionately'));
  fireEvent.click(screen.getByText('Save review'));
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/privacy_request_management/case', { privacy_request: { status: 'in_progress', response: '', operator_note: 'Confirmed authority via established channel.', identity_verified: true, lock_version: 2 } }));
});
