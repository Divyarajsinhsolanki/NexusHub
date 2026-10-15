// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import PageLoader from './PageLoader';
import SpinnerOverlay from './SpinnerOverlay';
import LoadingIndicator from './LoadingIndicator';
afterEach(cleanup);
it('announces the operation once without reporting fake numeric progress', () => {
  render(<PageLoader title="Documents" message="Loading documents…" />);
  const status = screen.getByRole('status');
  expect(status.getAttribute('aria-busy')).toBe('true');
  expect(status.textContent).toContain('Loading documents…');
  expect(screen.queryByRole('progressbar')).toBeNull();
});
it('uses the same accessible status for blocking requests and inline loading', () => {
  const view = render(<SpinnerOverlay message="Saving changes…" />);
  expect(screen.getByRole('status').textContent).toContain('Saving changes…');
  expect(view.container.querySelector('.workspace-loading--overlay')).toBeTruthy();
  view.rerender(<LoadingIndicator label="Uploading…" />);
  expect(screen.getByRole('status').textContent).toBe('Uploading…');
});
