import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { beforeEach, expect, jest, test } from '@jest/globals';

import { endpoints } from '../api/endpoints';
import { useAuth } from '../auth/AuthProvider';
import { PortfolioScreen } from './PortfolioScreen';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const signInDemo = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: mockPush, replace: mockReplace }) }));
jest.mock('@react-native-community/netinfo', () => ({ useNetInfo: () => ({ isConnected: true, isInternetReachable: true }) }));
jest.mock('../api/endpoints', () => ({ endpoints: { portfolio: jest.fn() } }));
jest.mock('../auth/AuthProvider', () => ({ useAuth: jest.fn() }));

beforeEach(() => {
  mockPush.mockClear();
  mockReplace.mockClear();
  signInDemo.mockClear();
  (useAuth as jest.MockedFunction<typeof useAuth>).mockReturnValue({
    user: null,
    isLoading: false,
    signIn: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    signInWithGoogle: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    signInDemo,
    signUp: jest.fn() as never,
    forgotPassword: jest.fn() as never,
    resetPassword: jest.fn() as never,
    signOut: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    refreshUser: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    startImpersonation: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    stopImpersonation: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  });
});

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
      case_study: null,
      features: [],
      featured: true,
    }],
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const screen = await render(<QueryClientProvider client={queryClient}><PortfolioScreen publicMode /></QueryClientProvider>);

  expect(await screen.findByText('Divyaraj Sinh')).toBeTruthy();
  expect(screen.getAllByText('Nexus Hub').length).toBeGreaterThan(0);
  expect(screen.getByText('Built across the application stack.')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
  expect(mockPush).toHaveBeenCalledWith('/login');
  await screen.unmount();
  queryClient.clear();
});

test('starts the demo from the public portfolio and opens the native demo tour', async () => {
  (endpoints.portfolio as jest.MockedFunction<typeof endpoints.portfolio>).mockResolvedValue({
    profile: {
      full_name: 'Divyaraj Sinh',
      headline: 'Product engineer',
      location: 'India',
      summary: 'Building focused software products.',
      skills: ['Rails'],
    },
    projects: [{
      id: 1,
      title: 'Nexus Hub',
      slug: 'nexus-hub',
      summary: 'A complete delivery workspace.',
      stack: ['Rails'],
      features: [],
    }],
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const screen = await render(<QueryClientProvider client={queryClient}><PortfolioScreen publicMode /></QueryClientProvider>);

  await screen.findByText('Divyaraj Sinh');
  await fireEvent.press(screen.getAllByRole('button', { name: 'View demo' })[0]);

  await waitFor(() => expect(signInDemo).toHaveBeenCalled());
  expect(mockReplace).toHaveBeenCalledWith('/more/demo');
  await screen.unmount();
  queryClient.clear();
});

test('maps portfolio feature demo paths to native mobile routes', async () => {
  (endpoints.portfolio as jest.MockedFunction<typeof endpoints.portfolio>).mockResolvedValue({
    profile: {
      full_name: 'Divyaraj Sinh',
      headline: 'Product engineer',
      location: 'India',
      summary: 'Building focused software products.',
      skills: ['Rails'],
    },
    projects: [{
      id: 1,
      title: 'Nexus Hub',
      slug: 'nexus-hub',
      summary: 'A complete delivery workspace.',
      stack: ['Rails'],
      features: [{
        id: 11,
        category: 'Knowledge',
        title: 'Knowledge Grid',
        summary: 'Briefings and saved cards.',
        demo_path: '/knowledge',
      }],
    }],
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const screen = await render(<QueryClientProvider client={queryClient}><PortfolioScreen publicMode /></QueryClientProvider>);

  await screen.findByText('Knowledge Grid');
  await fireEvent.press(screen.getByText('Open in demo'));

  await waitFor(() => expect(signInDemo).toHaveBeenCalled());
  expect(mockReplace).toHaveBeenCalledWith('/more/knowledge');
  await screen.unmount();
  queryClient.clear();
});
