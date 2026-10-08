// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../lib/operationsApi', () => ({ operationsApi: { observations: vi.fn() } }));
import { operationsApi } from '../../lib/operationsApi';
import DeploymentEditor, { timeInZone } from './DeploymentEditor';

const snapshot = { revision: 7, can_edit: true, environments: [{ id: 1, name: 'Development' }, { id: 2, name: 'Production' }], items: [{ id: 12, name: 'Redis', kind: 'software', entries: [{ environment_id: 1, expected_version: '6' }, { environment_id: 2, expected_version: '7' }] }], members: [{ id: 5, name: 'Active colleague' }] };
const deployed = { id: 20, name: 'October release', project_environment_id: 2, status: 'deployed', time_zone: 'Asia/Kolkata', scheduled_at: '2026-10-08T04:30:00Z', deployed_at: '2026-10-08T05:00:00Z', targets: [{ item_id: 12, name: 'Redis', expected_version: '7' }], verification: [{ item_id: 12, name: 'Redis', expected_version: '7', observed_version: null, status: 'missing' }] };
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

describe('Deployment planning and verification', () => {
  it('starts with the selected environment baseline and saves local time as an instant', async () => {
    const onSave = vi.fn(async () => ({ revision: 8 }));
    render(<DeploymentEditor projectId={4} snapshot={snapshot} environmentId={2} onSave={onSave} onClose={vi.fn()} />);
    expect(screen.getByLabelText('Redis release target').value).toBe('7');
    fireEvent.change(screen.getByLabelText('Deployment name'), { target: { value: 'November release' } });
    fireEvent.change(screen.getByLabelText('Time zone'), { target: { value: 'Asia/Kolkata' } });
    fireEvent.change(screen.getByLabelText(/Scheduled date and time/), { target: { value: '2026-11-10T10:00' } });
    fireEvent.change(screen.getByLabelText('Redis release target'), { target: { value: '7.2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save deployment' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(undefined, expect.objectContaining({ name: 'November release', project_environment_id: 2, time_zone: 'Asia/Kolkata', scheduled_at: '2026-11-10T04:30:00.000Z', targets: [{ item_id: 12, expected_version: '7.2' }] }), false, 7));
  });

  it('edits recurring schedules and lets departed members be removed from reminders', async () => {
    const record = { id: 30, name: 'Weekly release', project_environment_id: 2, time_zone: 'Asia/Kolkata', frequency: 'weekly', weekdays: [1], day_of_month: null, local_time: '10:00', starts_on: '2026-10-09', ends_on: null, targets: deployed.targets, owner_id: 99, recipient_ids: [5, 99], reminder_minutes: [60] };
    const onSave = vi.fn(async () => ({ revision: 8 }));
    const props = { projectId: 4, snapshot, record, isSeries: true, onSave, onClose: vi.fn() };
    const view = render(<DeploymentEditor {...props} />);
    expect(screen.getByRole('checkbox', { name: 'Unavailable member #99' }).checked).toBe(true);
    expect(screen.getByLabelText('Owner').value).toBe('99');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Unavailable member #99' }));
    fireEvent.change(screen.getByLabelText('Owner'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Repeat'), { target: { value: 'monthly' } });
    expect(screen.getByLabelText('Day of month').value).toBe('1');
    fireEvent.change(screen.getByLabelText('Day of month'), { target: { value: '15' } });
    view.rerender(<DeploymentEditor {...props} snapshot={{ ...snapshot, revision: 99 }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save future dates' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(30, expect.objectContaining({ frequency: 'monthly', day_of_month: 15, local_time: '10:00', owner_id: 5, recipient_ids: [5], ends_on: null }), true, 7));
  });

  it('records post-deployment observations before allowing verification and advances its own revision', async () => {
    const onAction = vi.fn(async () => ({ revision: 8 }));
    const props = { projectId: 4, snapshot, record: deployed, onAction, onClose: vi.fn() };
    const view = render(<DeploymentEditor {...props} />);
    expect(screen.getByRole('button', { name: 'Verify release' }).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Redis installed version'), { target: { value: '7' } });
    expect(screen.getByRole('button', { name: 'Verify release' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Record checked versions' }));
    await waitFor(() => expect(screen.getByLabelText('Redis installed version').value).toBe(''));
    expect(onAction).toHaveBeenCalledWith(20, 'observations', { revision: 7, observations: [{ item_id: 12, observed_version: '7', source: 'manual' }] });
    view.rerender(<DeploymentEditor {...props} record={{ ...deployed, verification: [{ ...deployed.verification[0], observed_version: '7', status: 'match' }] }} snapshot={{ ...snapshot, revision: 8 }} />);
    expect(screen.getByRole('button', { name: 'Verify release' }).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Verify release' }));
    await waitFor(() => expect(onAction).toHaveBeenLastCalledWith(20, 'verify', { revision: 8 }));
  });

  it('uses the reviewed CSV revision and selected targets for imported observations', async () => {
    const content = 'name,observed_version,source\nRedis,7,manual\n';
    const onAction = vi.fn(async () => ({ revision: 12 }));
    operationsApi.observations.mockResolvedValue({ data: { revision: 11, rows: [{ item_id: 12, name: 'Redis', observed_version: '7' }] } });
    render(<DeploymentEditor projectId={4} snapshot={snapshot} record={deployed} onAction={onAction} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Import checked versions CSV' }));
    const file = Object.assign(new File([content], 'observations.csv'), { text: async () => content });
    fireEvent.change(screen.getByLabelText('Checked versions CSV'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Preview checked versions' }).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Preview checked versions' }));
    await screen.findByRole('checkbox', { name: 'Redis · 7' });
    expect(operationsApi.observations).toHaveBeenCalledWith(4, 20, { content, preview: true });
    expect(onAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Redis · 7' }));
    expect(screen.getByRole('button', { name: 'Record 0 selected observations' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Redis · 7' }));
    fireEvent.click(screen.getByRole('button', { name: 'Record 1 selected observations' }));
    await waitFor(() => expect(onAction).toHaveBeenCalledWith(20, 'observations', { content, revision: 11, selected_item_ids: [12] }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Import post-deployment observations' })).toBeNull());
  });
});

describe('Deployment wall-clock times', () => {
  it('uses the earlier instant when daylight-saving time repeats', () => {
    expect(timeInZone('2026-11-01T01:30', 'America/New_York')).toBe('2026-11-01T05:30:00.000Z');
  });
  it('rejects a time skipped by a daylight-saving clock change', () => {
    expect(() => timeInZone('2026-03-08T02:30', 'America/New_York')).toThrow('does not exist');
  });
  it('supports half-hour offsets without relying on the browser timezone', () => {
    expect(timeInZone('2026-11-10T10:00', 'Asia/Kolkata')).toBe('2026-11-10T04:30:00.000Z');
  });
  it('rejects an invalid timezone instead of silently using local time', () => {
    expect(() => timeInZone('2026-11-10T10:00', 'Invalid/Zone')).toThrow('valid IANA time zone');
  });
});
