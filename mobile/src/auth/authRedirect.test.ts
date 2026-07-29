import { describe, expect, test } from '@jest/globals';

import { authRedirectTarget } from './authRedirect';

describe('authRedirectTarget', () => {
  test('keeps logged-out users on the public portfolio', () => {
    expect(authRedirectTarget({ isLoading: false, pathname: '/', signedIn: false })).toBeNull();
  });

  test('sends a returning user from the portfolio to Today', () => {
    expect(authRedirectTarget({ isLoading: false, pathname: '/', signedIn: true })).toBe('/(tabs)/today');
  });

  test('keeps logged-out users on authentication routes', () => {
    expect(authRedirectTarget({ isLoading: false, pathname: '/login', firstSegment: 'login', signedIn: false })).toBeNull();
  });

  test('sends logged-out protected routes back to the portfolio', () => {
    expect(authRedirectTarget({ isLoading: false, pathname: '/projects', firstSegment: '(tabs)', signedIn: false })).toBe('/');
  });

  test('does not redirect before session hydration completes', () => {
    expect(authRedirectTarget({ isLoading: true, pathname: '/', signedIn: true })).toBeNull();
  });
});
