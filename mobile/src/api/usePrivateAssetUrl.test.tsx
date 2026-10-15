import { beforeEach, expect, jest, test } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react-native';
import { api } from './client';
import { usePrivateAssetUrl } from './usePrivateAssetUrl';

jest.mock('./client', () => ({
  API_URL: 'https://workspace.example/api/v1',
  absoluteAssetUrl: (path?: string | null) => !path ? undefined : /^https?:/.test(path) ? path : `https://workspace.example${path}`,
  api: { post: jest.fn() },
}));

beforeEach(() => { jest.clearAllMocks(); });

test('fetches a ticket only from the own API and avoids exposing the unsigned private URL', async () => {
  jest.mocked(api.post).mockResolvedValue({ data: { data: { url: '/private.pdf?ticket=grant' } } });
  const screen = await renderHook(() => usePrivateAssetUrl('/rails/active_storage/blobs/redirect/signed-id/private.pdf'));
  await waitFor(() => expect(screen.result.current).toBe('https://workspace.example/private.pdf?ticket=grant'));
  expect(api.post).toHaveBeenCalledWith('/file_access', { signed_id: 'signed-id' });
  await screen.unmount();
});

test('external image URLs never trigger an authenticated request', async () => {
  const screen = await renderHook(() => usePrivateAssetUrl('https://outside.example/rails/active_storage/blobs/redirect/signed-id/file.png'));
  expect(screen.result.current).toContain('https://outside.example/');
  expect(api.post).not.toHaveBeenCalled();
  await screen.unmount();
});

test('access denial hides the file', async () => {
  jest.mocked(api.post).mockRejectedValue(new Error('Forbidden'));
  const screen = await renderHook(() => usePrivateAssetUrl('/rails/active_storage/blobs/redirect/signed-id/private.pdf'));
  await waitFor(() => expect(api.post).toHaveBeenCalled());
  expect(screen.result.current).toBeUndefined();
  await screen.unmount();
});
