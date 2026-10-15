// @vitest-environment jsdom
import React, { StrictMode } from 'react';
import { fireEvent, render, screen, cleanup, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import PrivacyRequests from './PrivacyRequests';
import api from '../components/api';
vi.mock('../components/api', () => ({ default: { post: vi.fn() } }));
beforeEach(() => { vi.clearAllMocks(); window.history.replaceState(null, '', '/privacy-requests'); });
afterEach(cleanup);
it('submits a request without account authentication and clears entered personal details', async () => {
  api.post.mockResolvedValue({ data: { message: 'Check your email.', reference: 'case-reference' } });
  render(<PrivacyRequests />);
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'requester@example.test' } });
  fireEvent.change(screen.getByLabelText('What would you like us to review?'), { target: { value: 'Please correct my records.' } });
  fireEvent.click(screen.getByText('Submit privacy request'));
  await screen.findByRole('status');
  expect(api.post).toHaveBeenCalledWith('/privacy_requests', { privacy_request: { name: '', email: 'requester@example.test', request_type: 'access', details: 'Please correct my records.', country: '' } }, { skipAuthRetry: true });
  expect(screen.getByLabelText('Email address').value).toBe('');
});
it('keeps private links out of the address bar and requires an explicit verify action', async () => {
  window.history.replaceState(null, '', '/privacy-requests#verify=PRIVATE');
  api.post.mockResolvedValue({ data: { tracking_token: 'TRACK', request: { reference: 'case-reference', status: 'received', target_response_at: '2026-11-14T00:00:00Z' } } });
  render(<StrictMode><PrivacyRequests /></StrictMode>);
  expect(window.location.hash).toBe('');
  expect(api.post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Verify email and view request'));
  await screen.findByText('Reference: case-reference');
  expect(api.post).toHaveBeenCalledWith('/privacy_requests/verify', { token: 'PRIVATE' }, { skipAuthRetry: true });
  fireEvent.click(screen.getByText('Refresh request status'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/privacy_requests/status', { token: 'TRACK' }, { skipAuthRetry: true }));
});
it('shows actionable errors without discarding the entered request', async () => {
  api.post.mockRejectedValue({ response: { data: { error: 'Please try again shortly.' } } });
  render(<PrivacyRequests />);
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'requester@example.test' } });
  fireEvent.change(screen.getByLabelText('What would you like us to review?'), { target: { value: 'Please review my data.' } });
  fireEvent.click(screen.getByText('Submit privacy request'));
  expect((await screen.findByRole('alert')).textContent).toBe('Please try again shortly.');
  expect(screen.getByLabelText('Email address').value).toBe('requester@example.test');
});
