// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../components/api', () => ({
  fetchProjectEnvironments: vi.fn(async () => ({ data: [{ id: 1, name: 'Production', url: 'https://example.test' }] })),
  fetchProjectVaultItems: vi.fn(async () => ({ data: { items: [
    { id: 1, title: 'Login secret', content: 'password', category: 'Credential', project_environment_id: 1 },
    { id: 2, title: 'API token', content: 'token', category: 'Token' },
    { id: 3, title: 'Production server', content: 'server', category: 'Server' },
    { id: 4, title: 'Database host', content: 'database', category: 'Database' },
    { id: 5, title: 'Deployment command', content: 'deploy', category: 'Command' },
    { id: 6, title: 'Project note', content: 'note', category: 'Note' },
  ] } })),
  createProjectEnvironment: vi.fn(), updateProjectEnvironment: vi.fn(), deleteProjectEnvironment: vi.fn(),
  createProjectVaultItem: vi.fn(), updateProjectVaultItem: vi.fn(), deleteProjectVaultItem: vi.fn(),
}));
import ProjectVault from './ProjectVault';
afterEach(cleanup);
it('keeps credentials separate while preserving access to tokens and infrastructure', async () => {
  render(<ProjectVault projectId={1} />);
  await screen.findByText('Production');
  fireEvent.click(screen.getByRole('button', { name: /^Credentials/ }));
  await screen.findByRole('heading', { name: 'Login secret' });
  for (const title of ['API token', 'Production server', 'Database host', 'Deployment command', 'Project note']) {
    expect(screen.queryByRole('heading', { name: title })).toBeNull();
  }
  fireEvent.click(screen.getByRole('button', { name: /^Commands & Tokens/ }));
  await screen.findByRole('heading', { name: 'API token' });
  expect(screen.getByRole('heading', { name: 'Deployment command' })).toBeTruthy();
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Login secret' })).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: /^Servers & Databases/ }));
  await screen.findByRole('heading', { name: 'Production server' });
  expect(screen.getByRole('heading', { name: 'Database host' })).toBeTruthy();
});
