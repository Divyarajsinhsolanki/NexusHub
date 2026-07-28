import { render, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { Text } from 'react-native';
import { expect, jest, test } from '@jest/globals';

import { AuthProvider, useAuth } from './AuthProvider';
import { endpoints } from '../api/endpoints';

jest.mock('../api/endpoints', () => ({
  endpoints: {
    me: jest.fn(),
    login: jest.fn(),
    logout: jest.fn(),
  },
}));

function Probe() {
  const { user, isLoading } = useAuth();
  return <Text>{isLoading ? 'Loading' : user ? 'Signed in' : 'Signed out'}</Text>;
}

test('clears an expired stored session when profile hydration fails', async () => {
  const getItem = SecureStore.getItemAsync as jest.MockedFunction<typeof SecureStore.getItemAsync>;
  const deleteItem = SecureStore.deleteItemAsync as jest.MockedFunction<typeof SecureStore.deleteItemAsync>;
  getItem.mockResolvedValue(JSON.stringify({
    accessToken: 'expired',
    refreshToken: 'expired-refresh',
    accessTokenExpiresAt: 1,
    refreshTokenExpiresAt: 1,
  }));
  (endpoints.me as jest.MockedFunction<typeof endpoints.me>).mockRejectedValue(new Error('expired'));

  const screen = await render(<AuthProvider><Probe /></AuthProvider>);

  await waitFor(() => expect(screen.getByText('Signed out')).toBeTruthy());
  expect(deleteItem).toHaveBeenCalled();
});
