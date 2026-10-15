// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
vi.mock('./api', () => ({ createWorkspaceInvitation: vi.fn(), fetchWorkspaceInvitations: vi.fn(), resendWorkspaceInvitation: vi.fn(), revokeWorkspaceInvitation: vi.fn(), previewWorkspaceOffboarding: vi.fn(), offboardWorkspaceMember: vi.fn(), previewWorkspaceInvitation: vi.fn(), acceptWorkspaceInvitation: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ AuthContext: React.createContext({}) }));
vi.mock('./ui/AuthLayout', () => ({ default: ({ children }) => <div>{children}</div> }));
import * as api from './api';
import WorkspaceInviteDialog from './WorkspaceInviteDialog';
import WorkspaceInvitationsPanel from './WorkspaceInvitationsPanel';
import WorkspaceOffboardingDialog from './WorkspaceOffboardingDialog';
import AcceptWorkspaceInvitation from '../pages/AcceptWorkspaceInvitation';
import { AuthContext } from '../context/AuthContext';
afterEach(cleanup);
beforeEach(() => { vi.resetAllMocks(); window.history.replaceState(null, '', '/'); });

it('invites by email and approved roles without collecting an employee password', async () => {
  api.createWorkspaceInvitation.mockResolvedValue({ data: { id: 1, delivery_status: 'queued' } });
  const created = vi.fn();
  render(<WorkspaceInviteDialog roles={['member', 'admin']} projects={[]} onClose={vi.fn()} onCreated={created} />);
  expect(screen.queryByLabelText(/password/i)).toBeNull();
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'new@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }));
  await waitFor(() => expect(created).toHaveBeenCalled());
  expect(api.createWorkspaceInvitation).toHaveBeenCalledWith(expect.objectContaining({ email: 'new@example.test', role_names: ['member'] }));
});

it('exposes resend and revoke without rendering secret invitation tokens', async () => {
  api.fetchWorkspaceInvitations.mockResolvedValue({ data: [{ id: 1, email: 'new@example.test', roles: ['member'], status: 'pending', delivery_status: 'queued', expires_at: '2026-10-22T00:00:00Z' }] });
  api.resendWorkspaceInvitation.mockResolvedValue({});
  api.revokeWorkspaceInvitation.mockResolvedValue({});
  render(<WorkspaceInvitationsPanel />);
  fireEvent.click(await screen.findByRole('button', { name: 'Resend' }));
  await waitFor(() => expect(api.resendWorkspaceInvitation).toHaveBeenCalledWith(1));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Revoke' }).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
  await waitFor(() => expect(api.revokeWorkspaceInvitation).toHaveBeenCalledWith(1));
});

it('requires explicit offboarding confirmation and an ownership successor', async () => {
  api.previewWorkspaceOffboarding.mockResolvedValue({ data: { name: 'Alex', needs_transfer: true, retained: 'Company records are retained.', successors: [{ id: 3, name: 'Pat' }] } });
  api.offboardWorkspaceMember.mockResolvedValue({ data: { offboarded: true } });
  const done = vi.fn();
  render(<WorkspaceOffboardingDialog user={{ id: 2, first_name: 'Alex', workspace_membership: { id: 7 } }} onClose={vi.fn()} onOffboarded={done} />);
  const successor = await screen.findByRole('combobox', { name: /Transfer ownership/ });
  const button = screen.getByRole('button', { name: 'Offboard employee' });
  expect(button.disabled).toBe(true);
  fireEvent.change(successor, { target: { value: '3' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Type OFFBOARD to confirm' }), { target: { value: 'OFFBOARD' } });
  fireEvent.click(button);
  await waitFor(() => expect(done).toHaveBeenCalled());
  expect(api.offboardWorkspaceMember).toHaveBeenCalledWith(7, { successor_id: '3', confirmation: 'OFFBOARD' });
});

it('accepts the fragment token with the recipient-chosen password and clears the URL on success', async () => {
  window.history.replaceState(null, '', '/invitations/accept#token=secret-link-token');
  api.previewWorkspaceInvitation.mockResolvedValue({ data: { email: 'recipient@example.test', workspace_name: 'Acme', roles: ['member'], existing_account: false } });
  api.acceptWorkspaceInvitation.mockResolvedValue({ data: { accepted: true } });
  render(<HelmetProvider><MemoryRouter><AuthContext.Provider value={{ user: null }}><AcceptWorkspaceInvitation /></AuthContext.Provider></MemoryRouter></HelmetProvider>);
  await screen.findByText(/Join/);
  await screen.findByLabelText('First name');
  for (const [label, value] of [['First name', 'New'], ['Last name', 'Employee'], ['Choose password', 'Password!42'], ['Confirm password', 'Password!42']]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));
  await screen.findByText('You’re ready to join');
  expect(api.acceptWorkspaceInvitation).toHaveBeenCalledWith('secret-link-token', expect.objectContaining({ password: 'Password!42' }));
  expect(window.location.hash).toBe('');
});
