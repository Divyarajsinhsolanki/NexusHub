import { describe, expect, test } from '@jest/globals';

import { normalizeMobileDeepLink } from './deepLinks';

describe('normalizeMobileDeepLink', () => {
  test('maps notification and web chat paths to native mobile routes', () => {
    expect(normalizeMobileDeepLink('/projects/3/dashboard?tab=environments&operation=license&record=7')).toBe('/projects/3/environments');
    expect(normalizeMobileDeepLink('/notifications')).toBe('/inbox/notifications');
    expect(normalizeMobileDeepLink('/chat/42')).toBe('/chat/42');
    expect(normalizeMobileDeepLink('/chat/42?messageId=8')).toBe('/chat/42?messageId=8');
    expect(normalizeMobileDeepLink('/knowledge?itemId=7')).toBe('/more/knowledge?itemId=7');
    expect(normalizeMobileDeepLink('/posts/9')).toBe('/inbox/post/9');
  });

  test('maps directory, account, and privileged web links without losing query state', () => {
    expect(normalizeMobileDeepLink('/users?search=alex')).toBe('/more/people?search=alex');
    expect(normalizeMobileDeepLink('/departments/3')).toBe('/more/departments/3');
    expect(normalizeMobileDeepLink('/settings')).toBe('/more/settings');
    expect(normalizeMobileDeepLink('/admin/login-as-user')).toBe('/more/impersonation');
    expect(normalizeMobileDeepLink('/admin/portfolio')).toBe('/more/portfolio-admin');
    expect(normalizeMobileDeepLink('/pdf-master')).toBe('/more/pdf');
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

test('opens dashboard and matched web results on existing native routes', () => {
  expect(normalizeMobileDeepLink('/projects/3/dashboard')).toBe('/projects/3');
  expect(normalizeMobileDeepLink('/projects/3/dashboard?taskId=7')).toBe('/projects/3?taskId=7');
  expect(normalizeMobileDeepLink('/posts#post-12')).toBe('/inbox/post/12');
  expect(normalizeMobileDeepLink('/projects/3/issues?issue_id=8')).toBe('/projects/3/issues?issueId=8');
  expect(normalizeMobileDeepLink('//evil.test')).toBeNull();
});
