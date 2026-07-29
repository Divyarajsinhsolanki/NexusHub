import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const mockConfigure = jest.fn();
const mockHasPlayServices = jest.fn<() => Promise<boolean>>();
const mockNativeSignIn = jest.fn<() => Promise<unknown>>();
const mockNativeSignOut = jest.fn<() => Promise<void>>();
const mockFirebaseSignIn = jest.fn<() => Promise<unknown>>();
const mockFirebaseSignOut = jest.fn<() => Promise<void>>();

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: mockConfigure,
    hasPlayServices: mockHasPlayServices,
    signIn: mockNativeSignIn,
    signOut: mockNativeSignOut,
  },
  isCancelledResponse: (response: { type?: string }) => response.type === 'cancelled',
  isErrorWithCode: (error: unknown) => Boolean(error && typeof error === 'object' && 'code' in error),
  statusCodes: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
    IN_PROGRESS: 'IN_PROGRESS',
    NULL_PRESENTER: 'NULL_PRESENTER',
  },
}));

jest.mock('firebase/app', () => ({
  getApp: jest.fn(() => ({ name: 'nexus-test' })),
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(() => ({ name: 'nexus-test' })),
}));

jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({ name: 'auth-test' })),
  GoogleAuthProvider: { credential: jest.fn(() => ({ providerId: 'google.com' })) },
  signInWithCredential: mockFirebaseSignIn,
  signOut: mockFirebaseSignOut,
}));

process.env.EXPO_PUBLIC_FIREBASE_API_KEY = 'firebase-key';
process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN = 'nexus.firebaseapp.com';
process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID = 'nexus';
process.env.EXPO_PUBLIC_FIREBASE_APP_ID = 'firebase-app';
process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = 'web.apps.googleusercontent.com';

describe('native Google authentication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHasPlayServices.mockResolvedValue(true);
    mockNativeSignOut.mockResolvedValue();
    mockFirebaseSignOut.mockResolvedValue();
  });

  test('exchanges the selected Google account for a Firebase token', async () => {
    mockNativeSignIn.mockResolvedValue({ type: 'success', data: { idToken: 'google-token' } });
    mockFirebaseSignIn.mockResolvedValue({ user: { getIdToken: jest.fn(async () => 'firebase-token') } });
    const { getFirebaseTokenFromGoogle } = require('./googleAuth') as typeof import('./googleAuth');

    await expect(getFirebaseTokenFromGoogle()).resolves.toBe('firebase-token');
    expect(mockConfigure).toHaveBeenCalledWith(expect.objectContaining({ webClientId: 'web.apps.googleusercontent.com' }));
  });

  test('returns a cancellation error without treating it as a login failure', async () => {
    mockNativeSignIn.mockResolvedValue({ type: 'cancelled', data: null });
    const { getFirebaseTokenFromGoogle } = require('./googleAuth') as typeof import('./googleAuth');

    await expect(getFirebaseTokenFromGoogle()).rejects.toMatchObject({ name: 'GoogleSignInCancelledError' });
  });

  test('reports missing Google Play Services clearly', async () => {
    mockHasPlayServices.mockRejectedValue({ code: 'PLAY_SERVICES_NOT_AVAILABLE' });
    const { getFirebaseTokenFromGoogle } = require('./googleAuth') as typeof import('./googleAuth');

    await expect(getFirebaseTokenFromGoogle()).rejects.toThrow('Google Play Services is unavailable or needs an update.');
  });
});
