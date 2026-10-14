import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import axios, { AxiosError, type AxiosResponse } from 'axios';

import { tokenStore } from '../auth/tokenStore';
import { api, setSessionExpiredHandler } from './client';

jest.mock('../auth/tokenStore', () => ({ tokenStore: {
  get: jest.fn(async () => ({ accessToken: 'old-access', refreshToken: 'valid-refresh' })),
  set: jest.fn(async () => undefined), clear: jest.fn(async () => undefined),
} }));

const expired = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  setSessionExpiredHandler(expired);
  api.defaults.adapter = async config => {
    const response = { status: 401, statusText: 'Unauthorized', data: {}, headers: {}, config } as AxiosResponse;
    throw new AxiosError('Expired access token', 'ERR_BAD_REQUEST', config, undefined, response);
  };
});
afterEach(() => { jest.restoreAllMocks(); setSessionExpiredHandler(null); });

test.each([undefined, 408, 429, 503])('a refresh failure (%s) preserves login for an offline notification retry', async status => {
  const failure = { response: status ? { status } : undefined };
  jest.spyOn(axios, 'post').mockRejectedValueOnce(failure);
  await expect(api.get('/notifications')).rejects.toBe(failure);
  expect(tokenStore.clear).not.toHaveBeenCalled();
  expect(expired).not.toHaveBeenCalled();
});

test.each([401, 403])('an explicitly rejected refresh (%s) clears the expired login', async status => {
  const failure = { response: { status } };
  jest.spyOn(axios, 'post').mockRejectedValueOnce(failure);
  await expect(api.get('/notifications')).rejects.toBe(failure);
  expect(tokenStore.clear).toHaveBeenCalledTimes(1);
  expect(expired).toHaveBeenCalledTimes(1);
});
