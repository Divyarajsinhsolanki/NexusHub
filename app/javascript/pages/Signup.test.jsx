// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
vi.mock('../context/AuthContext', () => ({ AuthContext: React.createContext({}) }));
vi.mock('../utils/formSubmit', () => ({ default: vi.fn() }));
vi.mock('../firebaseFlags', () => ({ firebaseEnabled: false }));
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { AuthContext } from '../context/AuthContext';
import submitForm from '../utils/formSubmit';
import { toast } from 'react-hot-toast';
import Signup from './Signup';
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

const submitSignup = () => {
  const switchToLogin = vi.fn();
  render(<MemoryRouter><AuthContext.Provider value={{}}><Signup embedded switchToLogin={switchToLogin} /></AuthContext.Provider></MemoryRouter>);
  for (const [label, value] of [['Company name', 'Acme'], ['First name', 'New'], ['Last name', 'Owner'], ['Email', 'new@example.test'], ['Password', 'Password!42']]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  fireEvent.submit(screen.getByLabelText('Company name').closest('form'));
  return switchToLogin;
};

it('sends company name and tells the owner to verify email before signing in', async () => {
  submitForm.mockResolvedValue({ confirmation_email_sent: true, message: 'Check your email to verify your account.' });
  const switchToLogin = submitSignup();
  await waitFor(() => expect(switchToLogin).toHaveBeenCalledOnce());
  expect(submitForm.mock.calls[0][2].get('auth[company_name]')).toBe('Acme');
  expect(toast.success).toHaveBeenCalledWith('Check your email to verify your account.');
});

it('reports confirmation delivery failure instead of claiming the account is ready', async () => {
  submitForm.mockResolvedValue({ confirmation_email_sent: false, message: 'Account created, but confirmation delivery failed. Contact support.' });
  submitSignup();
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Account created, but confirmation delivery failed. Contact support.'));
  expect(toast.success).not.toHaveBeenCalled();
});

it('opens the setup guide separately so entered signup details remain intact', () => {
  render(<MemoryRouter><AuthContext.Provider value={{}}><Signup embedded /></AuthContext.Provider></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Company name'), { target: { value: 'My company' } });
  const guide = screen.getByRole('link', { name: /Read the signup & company setup guide/ });
  expect(guide.getAttribute('href')).toBe('/getting-started');
  expect(guide.getAttribute('target')).toBe('_blank');
  expect(guide.getAttribute('rel')).toContain('noopener');
  expect(screen.getByLabelText('Company name').value).toBe('My company');
});
