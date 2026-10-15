// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ChatMenu from './ChatMenu';
afterEach(cleanup);
it('opens on demand, navigates actions, and restores focus on Escape', () => {
  render(<ChatMenu label="Call" icon="☎"><button>Voice call</button><button disabled>Unavailable</button><button>Video call</button></ChatMenu>);
  const trigger = screen.getByRole('button', { name: 'Call' });
  expect(screen.queryByText('Voice call')).toBeNull();
  fireEvent.click(trigger);
  expect(document.activeElement).toBe(screen.getByText('Voice call'));
  fireEvent.keyDown(document.activeElement, { key: 'ArrowDown' });
  expect(document.activeElement).toBe(screen.getByText('Video call'));
  fireEvent.keyDown(document.activeElement, { key: 'Home' });
  expect(document.activeElement).toBe(screen.getByText('Voice call'));
  fireEvent.keyDown(document.activeElement, { key: 'Escape' });
  expect(screen.queryByText('Voice call')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
it('closes after selection and on outside pointer interaction', () => {
  const select = vi.fn();
  render(<ChatMenu label="More" icon="…">{close => <button onClick={() => { select(); close(); }}>Files</button>}</ChatMenu>);
  const trigger = screen.getByRole('button', { name: 'More' });
  fireEvent.click(trigger);
  fireEvent.click(screen.getByText('Files'));
  expect(select).toHaveBeenCalledOnce();
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(trigger);
  fireEvent.pointerDown(document.body);
  expect(screen.queryByText('Files')).toBeNull();
});
