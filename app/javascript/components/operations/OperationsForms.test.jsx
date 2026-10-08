// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../lib/operationsApi', () => ({ operationsApi: { previewImport: vi.fn() } }));
import { operationsApi } from '../../lib/operationsApi';
import ImportDrawer from './ImportDrawer';
import ItemEditor from './ItemEditor';

const snapshot = { revision: 7, can_edit: true, encryption_available: true, environments: [{ id: 1, name: 'Development' }, { id: 2, name: 'Production' }], items: [], members: [], history: [] };
const file = (name, content) => Object.assign(new File([content], name), { text: async () => content });
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

describe('Reviewed imports', () => {
  it('keeps ENV values hidden and commits only the reviewed selection at the preview revision', async () => {
    const content = 'DATABASE_URL=do-not-display-this-secret\nLOG_LEVEL=info\n';
    const onCommit = vi.fn(async () => ({}));
    const onClose = vi.fn();
    operationsApi.previewImport.mockResolvedValue({ data: { revision: 8, rows: [{ name: 'DATABASE_URL', exists: true, secret: true, action: 'update' }, { name: 'LOG_LEVEL', exists: false, secret: true, action: 'create' }] } });
    const props = { projectId: 4, snapshot, onCommit, onClose, format: 'env' };
    const view = render(<ImportDrawer {...props} />);
    fireEvent.change(screen.getByLabelText(/Choose file/), { target: { files: [file('.env', content)] } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Preview import' }).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Preview import' }));
    await screen.findByText('2 records found');
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog').textContent).not.toContain('do-not-display-this-secret');
    fireEvent.click(screen.getByRole('checkbox', { name: /^DATABASE_URL/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Public value' }));
    view.rerender(<ImportDrawer {...props} snapshot={{ ...snapshot, revision: 99 }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Import 1 selected' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onCommit).toHaveBeenCalledWith({ format: 'env', environment_id: 1, content, revision: 8, selected_keys: ['LOG_LEVEL'], public_keys: ['LOG_LEVEL'], version_destination: 'observed' });
  });

  it('requires a new preview when changing between installed and expected version destinations', async () => {
    const content = 'name,observed_version,expected_version\nRedis,6,7\n';
    const onCommit = vi.fn(async () => ({}));
    operationsApi.previewImport.mockResolvedValueOnce({ data: { revision: 8, rows: [{ name: 'Redis', exists: true, action: 'update', observed_version: '6' }] } }).mockResolvedValueOnce({ data: { revision: 9, rows: [{ name: 'Redis', exists: true, action: 'update', expected_version: '7' }] } });
    render(<ImportDrawer projectId={4} snapshot={snapshot} format="versions" environmentId={2} onCommit={onCommit} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Choose file/), { target: { files: [file('versions.csv', content)] } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Preview import' }).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Preview import' }));
    await screen.findByText('Observed: 6');
    expect(operationsApi.previewImport).toHaveBeenLastCalledWith(4, { format: 'versions', environment_id: 2, content, version_destination: 'observed' });
    fireEvent.change(screen.getByLabelText('Version destination'), { target: { value: 'expected' } });
    expect(screen.queryByRole('button', { name: 'Import 1 selected' })).toBeNull();
    expect(decodeURIComponent(screen.getByRole('link', { name: 'Download CSV template' }).getAttribute('href'))).toContain('name,expected_version');
    fireEvent.click(screen.getByRole('button', { name: 'Preview import' }));
    await screen.findByText('Expected: 7');
    expect(operationsApi.previewImport).toHaveBeenLastCalledWith(4, { format: 'versions', environment_id: 2, content, version_destination: 'expected' });
    fireEvent.click(screen.getByRole('button', { name: 'Import 1 selected' }));
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ revision: 9, environment_id: 2, version_destination: 'expected', selected_keys: ['Redis'] })));
  });
});

describe('Operation records', () => {
  it('saves multiple service endpoints with linked per-environment credential IDs', async () => {
    const item = { id: 11, kind: 'service', name: 'Payment provider', comparison: 'environment_specific', details: {}, entries: [{ environment_id: 2, details: { endpoint: 'https://api.example.test', endpoints: [{ label: 'API', url: 'https://api.example.test' }], credential_item_ids: [] } }] };
    const onSave = vi.fn(async () => ({ revision: 8 }));
    render(<ItemEditor kind="service" item={item} environmentId={2} snapshot={{ ...snapshot, items: [{ id: 10, name: 'PAYMENT_KEY', kind: 'configuration', secret: true }] }} onSave={onSave} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add endpoint' }));
    fireEvent.change(screen.getAllByLabelText('Label')[1], { target: { value: 'Authentication' } });
    fireEvent.change(screen.getAllByLabelText('Endpoint URL')[1], { target: { value: 'https://auth.example.test' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'PAYMENT_KEY' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(11, expect.objectContaining({ kind: 'service', name: 'Payment provider' }), { environmentId: '2', payload: { required: false, details: { endpoints: [{ label: 'API', url: 'https://api.example.test' }, { label: 'Authentication', url: 'https://auth.example.test' }], credential_item_ids: [10] } } }, '', 7));
  });

  it('confirms matching installed software explicitly and uses that mutation revision for subsequent edits', async () => {
    const item = { id: 12, kind: 'software', name: 'Redis', comparison: 'environment_specific', details: {}, entries: [{ environment_id: 2, expected_version: '7', observed_version: '7', details: {} }] };
    const onVerifyEntry = vi.fn(async () => ({ revision: 8 }));
    const onSave = vi.fn(async () => ({ revision: 9 }));
    const props = { kind: 'software', item, environmentId: 2, snapshot, onVerifyEntry, onSave, onClose: vi.fn() };
    const view = render(<ItemEditor {...props} />);
    view.rerender(<ItemEditor {...props} snapshot={{ ...snapshot, revision: 99 }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm installed version' }));
    await screen.findByText(/Verified by Project member/);
    expect(onVerifyEntry).toHaveBeenCalledWith(12, '2', 7);
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Caching' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(12, expect.objectContaining({ description: 'Caching' }), null, '', 8));
  });
});
