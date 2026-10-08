// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import AuthPage from './AuthPage';
vi.mock('../context/AuthContext', () => ({ AuthContext: React.createContext({}) }));
vi.mock('../firebaseFlags', () => ({ firebaseEnabled: false }));
vi.mock('../components/ui/AuthWorkspaceScene', () => ({ default: () => <div data-testid="auth-scene">Workspace scene</div> }));
vi.mock('../components/api', () => ({ requestPasswordReset: vi.fn() }));
afterEach(cleanup);
const LocationProbe = () => <output data-testid="location">{useLocation().pathname + useLocation().search}</output>;
it('switches login, signup, and password recovery content without remounting the auth shell', () => {
  render(<MemoryRouter initialEntries={['/login?return_to=%2Fprojects']}><AuthContext.Provider value={{ isAuthenticated: false }}><AuthPage /><LocationProbe /></AuthContext.Provider></MemoryRouter>);
  const scene = screen.getByTestId('auth-scene');
  fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));
  expect(screen.getByTestId('auth-scene')).toBe(scene);
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
  expect(screen.getByTestId('auth-scene')).toBe(scene);
  fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
  expect(screen.getByRole('button', { name: 'Send reset email' })).toBeTruthy();
  expect(screen.getByTestId('auth-scene')).toBe(scene);
  fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }));
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
  expect(screen.getByTestId('auth-scene')).toBe(scene);
  expect(screen.getByTestId('location').textContent).toBe('/login?return_to=%2Fprojects');
});
it('supports opening password recovery directly', () => {
  render(<MemoryRouter initialEntries={['/forgot-password']}><AuthContext.Provider value={{ isAuthenticated: false }}><AuthPage mode="forgot-password" /></AuthContext.Provider></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }));
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
});
