import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const STORAGE_KEY = 'nexus-hub-mobile-session';

export type StoredTokens = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number;
};

let webFallback: string | null = null;

async function readValue() {
  if (Platform.OS === 'web') {
    return globalThis.localStorage?.getItem(STORAGE_KEY) ?? webFallback;
  }
  return SecureStore.getItemAsync(STORAGE_KEY);
}

async function writeValue(value: string) {
  if (Platform.OS === 'web') {
    webFallback = value;
    globalThis.localStorage?.setItem(STORAGE_KEY, value);
    return;
  }
  await SecureStore.setItemAsync(STORAGE_KEY, value);
}

export const tokenStore = {
  async get(): Promise<StoredTokens | null> {
    const value = await readValue();
    if (!value) return null;

    try {
      return JSON.parse(value) as StoredTokens;
    } catch {
      await this.clear();
      return null;
    }
  },

  async set(tokens: StoredTokens) {
    await writeValue(JSON.stringify(tokens));
  },

  async updateAccess(accessToken: string, accessTokenExpiresAt: number) {
    const current = await this.get();
    if (!current) throw new Error('No mobile session is available.');
    await this.set({ ...current, accessToken, accessTokenExpiresAt });
  },

  async clear() {
    if (Platform.OS === 'web') {
      webFallback = null;
      globalThis.localStorage?.removeItem(STORAGE_KEY);
      return;
    }
    await SecureStore.deleteItemAsync(STORAGE_KEY);
  },
};
