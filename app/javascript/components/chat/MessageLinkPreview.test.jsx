// @vitest-environment jsdom
import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import api from '../api';
import MessageLinkPreview from './MessageLinkPreview';
vi.mock('../api', () => ({ default: { get: vi.fn() } }));
afterEach(cleanup);
it('loads metadata through the conversation endpoint and renders the website card', async () => {
  api.get.mockResolvedValue({ data: { title: 'Example site', description: 'Site description', hostname: 'example.com', image: 'https://example.com/image.png' } });
  render(<MessageLinkPreview conversationId={7} message={{ id: 10, body: 'https://example.com' }} />);
  await waitFor(() => expect(screen.getByText('Example site')).toBeTruthy());
  expect(api.get).toHaveBeenCalledWith('/conversations/7/messages/10/link_preview', expect.objectContaining({ params: { url: 'https://example.com/' } }));
  expect(screen.getByText('Site description')).toBeTruthy();
  expect(screen.getByRole('link').href).toBe('https://example.com/');
  expect(screen.getByAltText('').getAttribute('src')).toBe('https://example.com/image.png');
});
it('does not request previews for deleted or unsent messages', () => {
  api.get.mockClear();
  render(<MessageLinkPreview conversationId={7} message={{ id: -1, body: 'https://example.com' }} />);
  render(<MessageLinkPreview conversationId={7} message={{ id: 10, body: 'https://example.com', deleted_at: 'today' }} />);
  expect(api.get).not.toHaveBeenCalled();
});
