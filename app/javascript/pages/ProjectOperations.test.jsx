// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
vi.mock('../lib/operationsApi', () => ({ operationsApi: {
  snapshot: vi.fn(), updateItem: vi.fn(), saveEnvironment: vi.fn(), deleteEnvironment: vi.fn(),
} }));
import { operationsApi } from '../lib/operationsApi';
import ProjectOperations from './ProjectOperations';

const environments = [{ id: 1, name: 'Development' }, { id: 2, name: 'Production' }, { id: 3, name: 'Staging' }];
const snapshot = overrides => ({ revision: 7, can_edit: true, encryption_available: true, environments, items: [], members: [], history: [], deployments: [], series: [], summary: {}, ...overrides });
const config = overrides => ({ id: 10, kind: 'configuration', name: 'PAYMENT_KEY', description: '', category: '', secret: true, comparison: 'environment_specific', status: 'match', details: {}, entries: [{ environment_id: 1, configured: true, required: true, details: {} }], comparisons: [], ...overrides });
const mount = (query = '') => render(<MemoryRouter initialEntries={[`/projects/4/dashboard?tab=environments${query}`]}><ProjectOperations projectId={4} /></MemoryRouter>);
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

describe('Project environment workspace', () => {
  it('preserves the revision and entered secret in an open draft after a background refresh', async () => {
    operationsApi.snapshot.mockResolvedValue({ data: snapshot({ items: [config()] }) });
    operationsApi.updateItem.mockRejectedValue({ response: { status: 409 } });
    mount('&record=10');
    await screen.findByRole('dialog');
    const secret = screen.getByLabelText(/Replace secret/);
    expect(secret.value).toBe('');
    expect(secret.type).toBe('password');
    fireEvent.change(secret, { target: { value: 'new-local-secret' } });
    operationsApi.snapshot.mockResolvedValue({ data: snapshot({ revision: 8, items: [config({ description: 'Changed by another member' })] }) });
    await act(async () => { fireEvent.focus(window); });
    expect(operationsApi.snapshot).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByRole('alert');
    expect(operationsApi.updateItem).toHaveBeenCalledWith(4, 10, expect.objectContaining({ revision: 7, item: expect.objectContaining({ description: '', entries: [{ environment_id: 1, required: true, details: {}, value: 'new-local-secret' }] }) }));
    expect(screen.getByRole('alert').textContent).toContain('Someone updated this project');
    expect(secret.value).toBe('new-local-secret');
  });

  it('keeps revision protection across raw environment saves and empty delete responses', async () => {
    let current = snapshot({ environments: [] });
    operationsApi.snapshot.mockImplementation(async () => ({ data: current }));
    operationsApi.saveEnvironment.mockImplementation(async (_projectId, id, payload) => {
      const environment = { ...payload.project_environment, id: id || 20 + current.environments.length };
      current = { ...current, revision: current.revision + 1, environments: [...current.environments, environment] };
      return { data: environment };
    });
    operationsApi.deleteEnvironment.mockImplementation(async (_projectId, id) => {
      current = { ...current, revision: current.revision + 1, environments: current.environments.filter(environment => environment.id !== id) };
      return { data: '' };
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Environments', exact: true }));
    for (const [name, revision] of [['Development', 7], ['Production', 8]]) {
      fireEvent.change(screen.getByLabelText('Environment name'), { target: { value: name } });
      fireEvent.click(screen.getByRole('button', { name: 'Add environment', exact: true }));
      await waitFor(() => expect(screen.getByLabelText('Environment name').value).toBe(''));
      expect(operationsApi.saveEnvironment).toHaveBeenLastCalledWith(4, undefined, expect.objectContaining({ revision }));
    }
    fireEvent.click(screen.getByRole('button', { name: 'Delete Development' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete environment' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Confirm delete environment' })).toBeNull());
    expect(operationsApi.deleteEnvironment).toHaveBeenCalledWith(4, 20, { revision: 9 });
    fireEvent.change(screen.getByLabelText('Environment name'), { target: { value: 'QA' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add environment', exact: true }));
    await waitFor(() => expect(operationsApi.saveEnvironment).toHaveBeenLastCalledWith(4, undefined, expect.objectContaining({ revision: 10 })));
  });

  it('does not replace an unfinished environment edit revision when deleting a different environment', async () => {
    let current = snapshot();
    operationsApi.snapshot.mockImplementation(async () => ({ data: current }));
    operationsApi.deleteEnvironment.mockImplementation(async () => { current = snapshot({ revision: 9, environments: environments.filter(env => env.id !== 2) }); return { data: '' }; });
    operationsApi.saveEnvironment.mockRejectedValue({ response: { status: 409 } });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Environments', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit Development' }));
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'My draft' } });
    current = snapshot({ revision: 8, environments: environments.map(env => env.id === 1 ? { ...env, description: 'Another member changed this' } : env) });
    await act(async () => { fireEvent.focus(window); });
    fireEvent.click(screen.getByRole('button', { name: 'Delete Production' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete environment' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Confirm delete environment' })).toBeNull());
    expect(operationsApi.deleteEnvironment).toHaveBeenCalledWith(4, 2, { revision: 8 });
    fireEvent.click(screen.getByRole('button', { name: 'Save environment' }));
    await screen.findByRole('alert');
    expect(operationsApi.saveEnvironment).toHaveBeenCalledWith(4, 1, expect.objectContaining({ revision: 7, project_environment: expect.objectContaining({ description: 'My draft' }) }));
  });

  it('filters differences by the two selected environments and compares secret metadata only', async () => {
    const sameInPair = config({ comparisons: [{ left_environment_id: 1, right_environment_id: 2, equal: true }, { left_environment_id: 1, right_environment_id: 3, equal: false }], entries: environments.map(env => ({ environment_id: env.id, configured: true })) });
    const differentInPair = config({ ...sameInPair, id: 11, name: 'API_TOKEN', comparisons: [{ left_environment_id: 1, right_environment_id: 2, equal: false }] });
    operationsApi.snapshot.mockResolvedValue({ data: snapshot({ items: [sameInPair, differentInPair] }) });
    mount('&compare=true&left=1&right=2&filter=differences');
    const table = await screen.findByRole('table');
    expect(within(table).queryByText('PAYMENT_KEY')).toBeNull();
    expect(within(table).getByText('API_TOKEN')).toBeTruthy();
    expect(within(table).getByText('Different')).toBeTruthy();
    expect(within(table).queryByText('Same')).toBeNull();
  });

  it('filters license coverage while keeping shared licenses in every environment', async () => {
    const license = (id, name, coverage) => ({ id, name, kind: 'license', status: 'active', details: { environment_ids: coverage }, entries: [] });
    operationsApi.snapshot.mockResolvedValue({ data: snapshot({ items: [license(11, 'Shared editor', []), license(12, 'Production monitor', [2]), license(13, 'Development tooling', [1])] }) });
    mount('&section=licenses&environment=2');
    await screen.findByRole('heading', { name: 'Shared editor' });
    expect(screen.getByRole('heading', { name: 'Production monitor' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Development tooling' })).toBeNull();
  });

  it('applies environment and search scope to recurring schedules', async () => {
    const series = (id, name, environment) => ({ id, name, active: true, project_environment_id: environment, frequency: 'weekly', local_time: '10:00', time_zone: 'UTC' });
    operationsApi.snapshot.mockResolvedValue({ data: snapshot({ series: [series(1, 'Production release', 2), series(2, 'Development release', 1), series(3, 'Production maintenance', 2)] }) });
    mount('&section=deployments&environment=2&q=release');
    await screen.findByText('Production release');
    expect(screen.queryByText('Development release')).toBeNull();
    expect(screen.queryByText('Production maintenance')).toBeNull();
  });

  it('allows viewers to inspect entries without writable controls', async () => {
    operationsApi.snapshot.mockResolvedValue({ data: snapshot({ can_edit: false, items: [config()] }) });
    mount();
    const cell = await screen.findByRole('button', { name: 'PAYMENT_KEY in Development' });
    expect(screen.queryByRole('button', { name: 'Add variable or setting' })).toBeNull();
    fireEvent.click(cell);
    const field = screen.getByLabelText('Variable name');
    expect(field.closest('fieldset').disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete', exact: true })).toBeNull();
  });
});
