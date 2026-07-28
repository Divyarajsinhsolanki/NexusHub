import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { expect, jest, test } from '@jest/globals';

import LoginScreen from '../../app/login';
import { useAuth } from '@/src/auth/AuthProvider';

jest.mock('@/src/auth/AuthProvider', () => ({ useAuth: jest.fn() }));

test('submits validated credentials', async () => {
  const signIn = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  (useAuth as jest.MockedFunction<typeof useAuth>).mockReturnValue({
    user: null,
    isLoading: false,
    signIn,
    signInWithGoogle: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    signUp: jest.fn() as never,
    forgotPassword: jest.fn() as never,
    resetPassword: jest.fn() as never,
    signOut: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    refreshUser: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    startImpersonation: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    stopImpersonation: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  });
  const screen = await render(<LoginScreen />);

  await fireEvent.changeText(screen.getByLabelText('Email'), 'mobile@example.com');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'Password!42');
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

  await waitFor(() => expect(signIn).toHaveBeenCalledWith('mobile@example.com', 'Password!42'));
});
