import { describe, expect, test } from '@jest/globals';

import { normalizeMobileDeepLink } from './deepLinks';

describe('normalizeMobileDeepLink', () => {
  test('maps notification and web chat paths to native mobile routes', () => {
    expect(normalizeMobileDeepLink('/notifications')).toBe('/inbox/notifications');
    expect(normalizeMobileDeepLink('/chat/42')).toBe('/inbox/chat/42');
    expect(normalizeMobileDeepLink('/posts/9')).toBe('/inbox/post/9');
  });

  test('keeps native paths and extracts paths from absolute URLs', () => {
    expect(normalizeMobileDeepLink('/projects/3?taskId=7')).toBe('/projects/3?taskId=7');
    expect(normalizeMobileDeepLink('https://example.test/notifications')).toBe('/inbox/notifications');
  });

  test('rejects missing or unsupported values', () => {
    expect(normalizeMobileDeepLink(undefined)).toBeNull();
    expect(normalizeMobileDeepLink('chat/42')).toBeNull();
  });
});
