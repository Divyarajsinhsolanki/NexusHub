import axios from 'axios';

import { apiErrorMessage } from '../api/client';

export type AuthAction = 'credentials' | 'google' | 'demo';

export type AuthFeedback = {
  title: string;
  message: string;
};

export function authErrorFeedback(error: unknown, action: AuthAction): AuthFeedback {
  const rawMessage = apiErrorMessage(error);
  const normalized = rawMessage.toUpperCase();

  if (axios.isAxiosError(error) && (!error.response || error.code === 'ECONNABORTED')) {
    return {
      title: 'Connection problem',
      message: error.code === 'ECONNABORTED'
        ? 'Nexus Hub took too long to respond. Check your connection and try again.'
        : 'We could not reach Nexus Hub. Check your internet connection and try again.',
    };
  }

  if (action === 'credentials') {
    if (axios.isAxiosError(error) && [401, 422].includes(error.response?.status || 0)) {
      return {
        title: 'Unable to sign in',
        message: 'Check your email and password, then try again.',
      };
    }
    return {
      title: 'Unable to sign in',
      message: 'We could not sign you in right now. Please try again shortly.',
    };
  }

  if (action === 'google') {
    if (normalized.includes('DEVELOPER_ERROR') || normalized.includes('NOT CONFIGURED') || normalized.includes('CONFIGURATION')) {
      return {
        title: 'Google sign-in unavailable',
        message: 'Google sign-in is not available in this app version. Please use your email and password for now.',
      };
    }
    if (normalized.includes('PLAY SERVICES')) {
      return {
        title: 'Google Play Services required',
        message: 'Update Google Play Services on this phone, then try again.',
      };
    }
    if (normalized.includes('IN PROGRESS')) {
      return {
        title: 'Google sign-in already open',
        message: 'Finish or close the current Google sign-in window, then try again.',
      };
    }
    return {
      title: 'Google sign-in failed',
      message: 'We could not complete Google sign-in. Please try again or use your email and password.',
    };
  }

  return {
    title: 'Demo unavailable',
    message: 'The demo workspace could not be opened right now. Please try again shortly.',
  };
}

export function shouldReportAuthError(error: unknown, action: AuthAction) {
  if (action === 'google') return true;
  if (!axios.isAxiosError(error)) return true;
  const status = error.response?.status;
  return !status || status >= 500;
}
