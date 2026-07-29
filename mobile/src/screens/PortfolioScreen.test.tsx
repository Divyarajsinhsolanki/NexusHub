import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render } from '@testing-library/react-native';
import { expect, jest, test } from '@jest/globals';

import { endpoints } from '../api/endpoints';
import { PortfolioScreen } from './PortfolioScreen';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: mockPush, replace: jest.fn() }) }));
jest.mock('@react-native-community/netinfo', () => ({ useNetInfo: () => ({ isConnected: true, isInternetReachable: true }) }));
jest.mock('../api/endpoints', () => ({ endpoints: { portfolio: jest.fn() } }));

test('shows the published portfolio before login and exposes authentication actions', async () => {
  (endpoints.portfolio as jest.MockedFunction<typeof endpoints.portfolio>).mockResolvedValue({
    profile: {
      full_name: 'Divyaraj Sinh',
      headline: 'Product engineer',
      location: 'India',
      summary: 'Building focused software products.',
      skills: ['Rails', 'React Native'],
      engineering_highlights: ['Stable APIs and accessible interfaces'],
    },
    projects: [{
      id: 1,
      title: 'Nexus Hub',
      slug: 'nexus-hub',
      summary: 'A complete delivery workspace.',
      stack: ['Rails', 'Expo'],
      features: [],
      featured: true,
    }],
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const screen = await render(<QueryClientProvider client={queryClient}><PortfolioScreen publicMode /></QueryClientProvider>);

  expect(await screen.findByText('Divyaraj Sinh')).toBeTruthy();
  expect(screen.getAllByText('Nexus Hub').length).toBeGreaterThan(0);
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
  expect(mockPush).toHaveBeenCalledWith('/login');
  await screen.unmount();
  queryClient.clear();
});
