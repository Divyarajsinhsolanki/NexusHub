import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

import type { ApiEnvelope, AuthSession } from './types';
import { tokenStore } from '../auth/tokenStore';

const configuredUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
export const API_URL = configuredUrl.replace(/\/$/, '');
const API_ORIGIN = API_URL.replace(/\/api\/v1$/, '');

export function absoluteAssetUrl(path?: string | null) {
  if (!path) return undefined;
  if (/^https?:\/\//.test(path)) return path;
  return `${API_ORIGIN}${path.startsWith('/') ? '' : '/'}${path}`;
}

export const api = axios.create({
  baseURL: API_URL,
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  timeout: 15000,
});

let refreshRequest: Promise<AuthSession> | null = null;
let sessionExpiredHandler: (() => void) | null = null;

export function setSessionExpiredHandler(handler: (() => void) | null) {
  sessionExpiredHandler = handler;
}

api.interceptors.request.use(async (config) => {
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    config.headers.delete('Content-Type');
  }
  const tokens = await tokenStore.get();
  if (tokens?.accessToken) config.headers.Authorization = `Bearer ${tokens.accessToken}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const isAuthRequest = original?.url?.startsWith('/auth/');

    if (error.response?.status !== 401 || !original || original._retry || isAuthRequest) {
      throw error;
    }

    original._retry = true;
    try {
      if (!refreshRequest) {
        refreshRequest = refreshSession().finally(() => {
          refreshRequest = null;
        });
      }
      const session = await refreshRequest;
      original.headers.Authorization = `Bearer ${session.access_token}`;
      return api(original);
    } catch (refreshError) {
      await tokenStore.clear();
      sessionExpiredHandler?.();
      throw refreshError;
    }
  },
);

async function refreshSession() {
  const tokens = await tokenStore.get();
  if (!tokens?.refreshToken) throw new Error('No refresh token is available.');

  const response = await axios.post<ApiEnvelope<AuthSession>>(
    `${API_URL}/auth/refresh`,
    { refresh_token: tokens.refreshToken },
    { timeout: 15000 },
  );
  const session = response.data.data;
  await storeSession(session);
  return session;
}

export async function storeSession(session: AuthSession) {
  await tokenStore.set({
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    accessTokenExpiresAt: session.access_token_expires_at,
    refreshTokenExpiresAt: session.refresh_token_expires_at,
  });
}

export function apiErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const payload = error.response?.data as { error?: { message?: string } } | undefined;
    return payload?.error?.message || (error.code === 'ECONNABORTED' ? 'The request timed out.' : 'Unable to reach Nexus Hub.');
  }
  return error instanceof Error ? error.message : 'Something went wrong.';
}
