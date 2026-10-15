// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it } from 'vitest';
import GettingStarted from './GettingStarted';
afterEach(cleanup);
const show = () => render(<MemoryRouter><GettingStarted /></MemoryRouter>);
it('walks through owner setup and marks only reviewed guide steps', () => {
  show();
  expect(screen.getByRole('link', { name: 'Create a workspace' }).getAttribute('href')).toBe('/signup');
  expect(screen.getByRole('tabpanel').textContent).toContain('Create your company workspace');
  fireEvent.click(screen.getByRole('button', { name: /Got it, next step/ }));
  expect(screen.getByRole('tabpanel').textContent).toContain('Verify your email and sign in');
  expect(screen.getByRole('progressbar').getAttribute('value')).toBe('1');
  fireEvent.click(screen.getByRole('tab', { name: /Secure account/ }));
  fireEvent.click(screen.getByText('Good to know'));
  expect(screen.getByRole('tabpanel').textContent).toContain('Each recovery code works once');
});
it('switches to invitation steps without offering to create another company', () => {
  show(); fireEvent.click(screen.getByRole('button', { name: /I’m joining my team/ }));
  expect(screen.getAllByRole('tab')).toHaveLength(3);
  expect(screen.getByRole('tabpanel').textContent).toContain('Do not create a separate workspace');
  expect(screen.queryByRole('link', { name: 'Create a workspace' })).toBeNull();
  expect(screen.getByRole('link', { name: 'Sign in to your account' }).getAttribute('href')).toBe('/login');
  fireEvent.click(screen.getByRole('button', { name: /Got it, next step/ }));
  expect(screen.getByRole('tabpanel').textContent).toContain('Open your invitation email');
  fireEvent.click(screen.getByRole('button', { name: /I’m setting up my company/ }));
  expect(screen.getByRole('progressbar').getAttribute('value')).toBe('0');
});
it('supports keyboard step navigation and keeps focus on the selected tab', () => {
  show(); const first = screen.getByRole('tab', { name: /Create workspace/ });
  fireEvent.keyDown(first, { key: 'ArrowDown' });
  const second = screen.getByRole('tab', { name: /Verify email/ });
  expect(document.activeElement).toBe(second);
  expect(second.getAttribute('aria-selected')).toBe('true');
  expect(screen.getByRole('tabpanel').id).toBe(second.getAttribute('aria-controls'));
  fireEvent.keyDown(second, { key: 'End' });
  expect(screen.getByRole('tabpanel').textContent).toContain('Set up your first work');
});
