import { fireEvent, render } from '@testing-library/react-native';
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { Alert } from 'react-native';

import { useAuth } from '../auth/AuthProvider';
import { DemoBanner } from './DemoBanner';

const mockPush = jest.fn();
const signOut = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../auth/AuthProvider', () => ({ useAuth: jest.fn() }));

beforeEach(() => {
  mockPush.mockClear();
  signOut.mockClear();
  (useAuth as jest.MockedFunction<typeof useAuth>).mockReturnValue({
    user: {
      id: 1,
      email: 'demo@example.com',
      first_name: 'Demo',
      last_name: 'User',
      full_name: 'Demo User',
      job_title: 'Reviewer',
      avatar_color: '#2563eb',
      demo_account: true,
      roles: ['member'],
      workspace: { id: 1, name: 'Demo Workspace', slug: 'demo' },
    },
    isLoading: false,
    signIn: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    signInWithGoogle: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    signInDemo: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    signUp: jest.fn() as never,
    forgotPassword: jest.fn() as never,
    resetPassword: jest.fn() as never,
    signOut,
    refreshUser: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    startImpersonation: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    stopImpersonation: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('opens the demo tour from the banner', async () => {
  const screen = await render(<DemoBanner />);

  fireEvent.press(screen.getByRole('button', { name: 'Open guided demo tour' }));

  expect(mockPush).toHaveBeenCalledWith('/more/demo');
});

test('shows a visible demo sign-out action and confirms before signing out', async () => {
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    buttons?.find((button) => button.text === 'Sign out')?.onPress?.();
  });
  const screen = await render(<DemoBanner />);

  expect(screen.getByText('Sign out')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Sign out of demo' }));

  expect(signOut).toHaveBeenCalled();
});
