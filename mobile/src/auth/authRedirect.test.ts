import { describe, expect, test } from '@jest/globals';

import { authRedirectTarget } from './authRedirect';

describe('authRedirectTarget', () => {
  test('keeps logged-out users on the public portfolio', () => {
    expect(authRedirectTarget({ isLoading: false, pathname: '/', signedIn: false })).toBeNull();
  });

  test('sends a returning user from the portfolio to Today', () => {
    expect(authRedirectTarget({ isLoading: false, pathname: '/', signedIn: true })).toBe('/(tabs)/today');
  });

  test('sends a signed-in user away from authentication routes', () => {
    expect(authRedirectTarget({ isLoading: false, pathname: '/login', firstSegment: 'login', signedIn: true })).toBe('/(tabs)/today');
  });

  test('keeps logged-out users on authentication routes', () => {
    expect(authRedirectTarget({ isLoading: false, pathname: '/login', firstSegment: 'login', signedIn: false })).toBeNull();
  });

  test('sends logged-out protected routes back to the portfolio', () => {
    expect(authRedirectTarget({ isLoading: false, pathname: '/projects', firstSegment: '(tabs)', signedIn: false })).toBe('/login?returnTo=%2Fprojects');
  });

  test('returns an authenticated user to a safe meeting path', () => {
    expect(authRedirectTarget({ isLoading: false, pathname: '/login', firstSegment: 'login', returnTo: '/meet/abc-123', signedIn: true })).toBe('/meet/abc-123');
  });

  test('rejects external return paths', () => {
    expect(authRedirectTarget({ isLoading: false, pathname: '/login', firstSegment: 'login', returnTo: '//evil.example', signedIn: true })).toBe('/(tabs)/today');
  });

  test('does not redirect before session hydration completes', () => {
    expect(authRedirectTarget({ isLoading: true, pathname: '/', signedIn: true })).toBeNull();
  });
});
