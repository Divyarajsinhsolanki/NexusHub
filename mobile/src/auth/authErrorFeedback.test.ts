import axios from 'axios';
import { describe, expect, test } from '@jest/globals';

import { authErrorFeedback, shouldReportAuthError } from './authErrorFeedback';

describe('authentication error feedback', () => {
  test('replaces raw Google developer errors with safe guidance', () => {
    const raw = new Error('DEVELOPER_ERROR: Follow troubleshooting instructions at an SDK URL');

    expect(authErrorFeedback(raw, 'google')).toEqual({
      title: 'Google sign-in unavailable',
      message: 'Google sign-in is not available in this app version. Please use your email and password for now.',
    });
    expect(shouldReportAuthError(raw, 'google')).toBe(true);
  });

  test('does not expose authentication API details', () => {
    const error = new axios.AxiosError(
      'Request failed',
      'ERR_BAD_REQUEST',
      undefined,
      undefined,
      { status: 401, statusText: 'Unauthorized', headers: {}, config: { headers: {} } } as never,
    );

    expect(authErrorFeedback(error, 'credentials')).toEqual({
      title: 'Unable to sign in',
      message: 'Check your email and password, then try again.',
    });
    expect(shouldReportAuthError(error, 'credentials')).toBe(false);
  });
});
