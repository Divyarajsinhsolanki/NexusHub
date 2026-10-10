import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { beforeEach, expect, jest, test } from '@jest/globals';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { endpoints } from '../api/endpoints';
import { SettingsScreen } from './SettingsScreen';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockRefresh = jest.fn(async () => undefined);
let mockDemo = false;
jest.mock('expo-router', () => ({ useLocalSearchParams: jest.fn(() => ({})), useRouter: jest.fn() }));
jest.mock('expo-notifications', () => ({ getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })), requestPermissionsAsync: jest.fn() }));
jest.mock('../notifications/PushRegistrar', () => ({ registerCurrentPushDevice: jest.fn() }));
jest.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 1, demo_account: mockDemo, preferences: { dark_mode: false, landing_page: 'projects' } }, refreshUser: mockRefresh }) }));
jest.mock('../api/endpoints', () => ({ endpoints: { updateMe: jest.fn(async () => undefined), changePassword: jest.fn(async () => undefined) } }));
jest.mock('../components/Screen', () => ({ Screen: ({ children, header }: any) => <>{header}{children}</> }));

beforeEach(() => {
  jest.clearAllMocks();
  mockDemo = false;
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  jest.mocked(useRouter).mockReturnValue({ push: mockPush, replace: mockReplace, back: mockBack } as never);
});

async function setup(section?: string) {
  jest.mocked(useLocalSearchParams).mockReturnValue(section ? { section } : {});
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const screen = await render(<QueryClientProvider client={client}><SettingsScreen /></QueryClientProvider>);
  return { screen, close: async () => { await screen.unmount(); client.clear(); } };
}

test('overview shows six destinations without a long list of controls', async () => {
  const { screen, close } = await setup();
  expect(screen.getAllByRole('button', { name: /^Open / })).toHaveLength(6);
  expect(screen.queryByRole('switch')).toBeNull();
  expect(screen.queryByLabelText('Current password')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Open Appearance' }));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/more/settings', params: { section: 'appearance' } });
  await close();
});

test('appearance saves the theme and returns to the settings overview', async () => {
  const { screen, close } = await setup('appearance');
  expect(screen.queryByLabelText('Push notifications')).toBeNull();
  await fireEvent(screen.getByLabelText('Dark mode'), 'valueChange', true);
  await waitFor(() => expect(endpoints.updateMe).toHaveBeenCalledWith({ dark_mode: true }));
  await fireEvent.press(screen.getByRole('button', { name: 'Back to settings' }));
  expect(mockReplace).toHaveBeenCalledWith('/more/settings');
  await close();
});

test('start page has a dedicated selection screen', async () => {
  const { screen, close } = await setup('start');
  expect(screen.queryByLabelText('Dark mode')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'People' }));
  await waitFor(() => expect(endpoints.updateMe).toHaveBeenCalledWith({ landing_page: 'users' }));
  await close();
});

test('quiet hours are separate from push categories', async () => {
  const { screen, close } = await setup('quiet');
  expect(screen.getByLabelText('Quiet hours')).toBeTruthy();
  expect(screen.queryByLabelText('Message previews')).toBeNull();
  expect(screen.queryByLabelText('Chat push notifications')).toBeNull();
  await close();
});

test('security retains device access and password changes', async () => {
  const { screen, close } = await setup('security');
  await fireEvent.press(screen.getByRole('button', { name: 'Device sessions' }));
  expect(mockPush).toHaveBeenCalledWith('/more/profile');
  await fireEvent.changeText(screen.getByLabelText('Current password'), 'old-password');
  await fireEvent.changeText(screen.getByLabelText('New password'), 'new-password');
  await fireEvent.changeText(screen.getByLabelText('Confirm new password'), 'new-password');
  await fireEvent.press(screen.getByRole('button', { name: 'Update password' }));
  await waitFor(() => expect(endpoints.changePassword).toHaveBeenCalledWith({ current_password: 'old-password', password: 'new-password', password_confirmation: 'new-password' }));
  await close();
});

test('demo keeps settings read only', async () => {
  mockDemo = true;
  const { screen, close } = await setup('appearance');
  expect(screen.getByLabelText('Dark mode').props.disabled).toBe(true);
  expect(screen.getByText(/Changes are disabled/)).toBeTruthy();
  await close();
});


test('activity alerts and push categories retain their save behavior', async () => {
  const alerts = await setup('alerts');
  expect(alerts.screen.queryByLabelText('Dark mode')).toBeNull();
  await fireEvent(alerts.screen.getByLabelText('Comments'), 'valueChange', false);
  await waitFor(() => expect(endpoints.updateMe).toHaveBeenCalledWith({ notification_preferences: { commented: false } }));
  await alerts.close();
  const push = await setup('push');
  expect(push.screen.queryByLabelText('Quiet hours')).toBeNull();
  await fireEvent(push.screen.getByLabelText('Chat push notifications'), 'valueChange', false);
  await waitFor(() => expect(endpoints.updateMe).toHaveBeenCalledWith({ push_notification_settings: expect.objectContaining({ categories: expect.objectContaining({ chat: false, audio_calls: true }) }) }));
  await push.close();
});
