import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react-native';
import { expect, jest, test } from '@jest/globals';
import { api } from '../../api/client';
import { MessageLinkPreview } from './MessageLinkPreview';
jest.mock('../../api/client', () => ({ api: { get: jest.fn() } }));
test('unwraps native API metadata and displays a tappable website card', async () => {
  jest.mocked(api.get).mockResolvedValue({ data: { data: { title: 'Example site', description: 'Latest news', hostname: 'example.com' } } } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const screen = await render(<QueryClientProvider client={client}><MessageLinkPreview conversationId={7} message={{ id: 10, created_at: '2026-10-10T00:00:00Z', body: 'https://example.com' }} /></QueryClientProvider>);
  await waitFor(() => expect(screen.getByText('Example site')).toBeTruthy());
  expect(screen.getByRole('link', { name: 'Open Example site' })).toBeTruthy();
  expect(screen.getByText('Latest news')).toBeTruthy();
  expect(api.get).toHaveBeenCalledWith('/conversations/7/messages/10/link_preview', { params: { url: 'https://example.com/' } });
  await screen.unmount(); client.clear();
});
