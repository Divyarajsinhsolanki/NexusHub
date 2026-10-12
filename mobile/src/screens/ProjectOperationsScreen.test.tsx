import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { beforeEach, expect, jest, test } from '@jest/globals';
import { endpoints } from '../api/endpoints';
import { ProjectOperationsScreen } from './ProjectOperationsScreen';
const mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams, useRouter: () => ({ canGoBack: () => true, back: jest.fn(), replace: jest.fn() }) }));
jest.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 1 } }) }));
jest.mock('../components/Screen', () => ({ Screen: ({ children, header }: any) => <>{header}{children}</> }));
jest.mock('../api/endpoints', () => ({ endpoints: { projectOperations: jest.fn(), operationsMutation: jest.fn(), operationsHistory: jest.fn() } }));
const snapshot = { revision: 7, can_edit: true, encryption_available: true, environments: [{ id: 2, name: 'Production' }], members: [{ id: 1, name: 'Sam' }], items: [{ id: 3, name: 'API_TOKEN', kind: 'configuration', secret: true, comparison: 'environment_specific', status: 'match', details: { scope: 'env' }, entries: [{ id: 4, environment_id: 2, configured: true, status: 'configured' }] }], history: [], deployments: [{ id: 8, name: 'October release', project_environment_id: 2, owner_id: 1, time_zone: 'Asia/Kolkata', scheduled_at: '2030-01-01T03:30:00Z', status: 'planned', targets: [], recipient_ids: [], reminder_minutes: [60] }], series: [], summary: {} };
beforeEach(() => { jest.clearAllMocks(); Object.keys(mockParams).forEach(key => delete mockParams[key]); jest.mocked(endpoints.projectOperations).mockResolvedValue(snapshot as never); jest.mocked(endpoints.operationsMutation).mockResolvedValue({ revision: 8 }); });
async function setup() { const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }); const screen = await render(<QueryClientProvider client={client}><ProjectOperationsScreen projectId={12} /></QueryClientProvider>); await waitFor(() => expect(screen.getByRole('button', { name: 'Open API_TOKEN' })).toBeTruthy()); return { screen, close: async () => { await screen.unmount(); client.clear(); } }; }
test('shows all five sections and viewer records without edit actions', async () => {
  jest.mocked(endpoints.projectOperations).mockResolvedValue({ ...snapshot, can_edit: false } as never);
  const { screen, close } = await setup();
  for (const label of ['Configuration', 'Software versions', 'Services', 'Licenses', 'Deployments']) expect(screen.getByRole('button', { name: label })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Add record' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Open API_TOKEN' }));
  expect(screen.queryByRole('button', { name: 'Save record' })).toBeNull();
  await close();
});
test('sends metadata with the captured revision and retains a stale draft', async () => {
  jest.mocked(endpoints.operationsMutation).mockRejectedValue({ response: { status: 409 } });
  const { screen, close } = await setup();
  await fireEvent.press(screen.getByRole('button', { name: 'Open API_TOKEN' }));
  await fireEvent.changeText(screen.getByLabelText('Name'), 'NEW_TOKEN');
  await fireEvent.press(screen.getByRole('button', { name: 'Save record' }));
  await waitFor(() => expect(endpoints.operationsMutation).toHaveBeenCalledWith(12, 'operations/items/3', 'patch', expect.objectContaining({ revision: 7, item: expect.objectContaining({ name: 'NEW_TOKEN' }) })));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Close and refresh' })).toBeTruthy());
  expect(screen.getByLabelText('Name').props.value).toBe('NEW_TOKEN');
  expect(screen.queryByRole('button', { name: 'Save record' })).toBeNull();
  await close();
});
test('keeps secret values write-only and preserves unchanged values', async () => {
  const { screen, close } = await setup();
  await fireEvent.press(screen.getByRole('button', { name: 'Open API_TOKEN' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Production · configured' }));
  expect(screen.getByLabelText('Replace secret value').props.value).toBe('');
  await fireEvent.press(screen.getByRole('button', { name: 'Save environment entry' }));
  await waitFor(() => expect(endpoints.operationsMutation).toHaveBeenCalledWith(12, 'operations/items/3/entries/2', 'put', expect.objectContaining({ revision: 7, entry: { required: false, details: {} } })));
  await close();
});
test('opens deployment reminders directly and plans releases with timezone-correct dates', async () => {
  mockParams.section = 'deployments'; mockParams.record = '8';
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const screen = await render(<QueryClientProvider client={client}><ProjectOperationsScreen projectId={12} /></QueryClientProvider>);
  await waitFor(() => expect(screen.getByLabelText('Release name')).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: 'Save deployment' }));
  await waitFor(() => expect(endpoints.operationsMutation).toHaveBeenCalledWith(12, 'operations/deployments/8', 'patch', expect.objectContaining({ revision: 7, deployment: expect.objectContaining({ scheduled_at: '2030-01-01T03:30:00.000Z', project_environment_id: 2 }) })));
  await screen.unmount(); client.clear();
});
test('edits license reminders while preserving a stored key', async () => {
  jest.mocked(endpoints.projectOperations).mockResolvedValue({ ...snapshot, items: [...snapshot.items, { id: 5, name: 'Support license', kind: 'license', secret: true, comparison: 'environment_specific', status: 'active', license_key_configured: true, entries: [], details: { owner_id: 1, time_zone: 'Asia/Kolkata', expiry_date: '2030-12-01', reminder_days: [30], environment_ids: [2], recipient_ids: [1] } }] } as never);
  const { screen, close } = await setup();
  await fireEvent.press(screen.getByRole('button', { name: 'Licenses' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Open Support license' }));
  expect(screen.getByLabelText('Replace license key').props.value).toBe('');
  await fireEvent.changeText(screen.getByLabelText('Reminder days before expiry (30, 7, 1)'), '30, 7, 1');
  await fireEvent.press(screen.getByRole('button', { name: 'Save record' }));
  await waitFor(() => expect(endpoints.operationsMutation).toHaveBeenCalledWith(12, 'operations/items/5', 'patch', expect.objectContaining({ revision: 7, item: expect.objectContaining({ details: expect.objectContaining({ reminder_days: [30, 7, 1], environment_ids: [2], recipient_ids: [1] }) }) })));
  const payload = jest.mocked(endpoints.operationsMutation).mock.calls[0][3].item as any;
  expect(payload).not.toHaveProperty('license_key');
  await close();
});
test('software observations save expected and observed versions for the named environment', async () => {
  jest.mocked(endpoints.projectOperations).mockResolvedValue({ ...snapshot, items: [...snapshot.items, { id: 6, name: 'Ruby', kind: 'software', secret: false, comparison: 'must_match', status: 'unconfigured', entries: [], details: { ecosystem: 'runtime' } }] } as never);
  const { screen, close } = await setup();
  await fireEvent.press(screen.getByRole('button', { name: 'Software versions' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Open Ruby' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Production · Not configured' }));
  await fireEvent.changeText(screen.getByLabelText('Expected version'), '3.3.12');
  await fireEvent.changeText(screen.getByLabelText('Observed version'), '3.3.12');
  await fireEvent.press(screen.getByRole('button', { name: 'Save environment entry' }));
  await waitFor(() => expect(endpoints.operationsMutation).toHaveBeenCalledWith(12, 'operations/items/6/entries/2', 'put', expect.objectContaining({ revision: 7, entry: expect.objectContaining({ expected_version: '3.3.12', observed_version: '3.3.12', source: 'manual' }) })));
  await close();
});
