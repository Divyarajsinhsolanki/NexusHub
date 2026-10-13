import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { beforeEach, expect, jest, test } from '@jest/globals';
import { endpoints } from '../api/endpoints';
import { AccountLifecycle } from './AccountLifecycle';
const mockStatus = { status: 'none', retention: 'Seven-day waiting period.', can_delete: true, needs_transfer: true, successors: [{ id: 8, name: 'Next Owner' }] };
jest.mock('../api/endpoints', () => ({ endpoints: {
  accountStatus: jest.fn(async () => mockStatus),
  requestDeletionCode: jest.fn(async () => ({ ...mockStatus, status: 'verification_pending' })),
  scheduleAccountDeletion: jest.fn(async () => ({ ...mockStatus, status: 'scheduled', delete_after: '2026-10-20T10:00:00Z', receipt_id: 'reference' })),
  cancelAccountDeletion: jest.fn(async () => ({ ...mockStatus, status: 'cancelled' })),
} }));
beforeEach(() => { jest.clearAllMocks(); });
async function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  const screen = await render(<QueryClientProvider client={client}><AccountLifecycle /></QueryClientProvider>);
  return { screen, close: async () => { await screen.unmount(); client.clear(); } };
}
test('mobile verifies and schedules deletion with an explicit successor', async () => {
  const { screen, close } = await setup();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Delete Account' }).props.accessibilityState.disabled).toBe(false));
  await fireEvent.press(screen.getByRole('button', { name: 'Delete Account' }));
  await fireEvent.press(screen.getByRole('radio'));
  await fireEvent.press(screen.getByRole('button', { name: 'Send verification code' }));
  await screen.findByLabelText('Email verification code');
  await fireEvent.changeText(screen.getByLabelText('Email verification code'), '123456');
  await fireEvent.changeText(screen.getByLabelText('Type DELETE to confirm'), 'DELETE');
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm account deletion' }));
  await waitFor(() => expect(endpoints.scheduleAccountDeletion).toHaveBeenCalledWith({ verification_code: '123456', confirmation: 'DELETE', successor_id: 8 }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Cancel account deletion' }));
  await waitFor(() => expect(endpoints.cancelAccountDeletion).toHaveBeenCalled());
  await close();
});
