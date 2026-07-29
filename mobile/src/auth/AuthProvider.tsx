import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { endpoints } from '../api/endpoints';
import { setSessionExpiredHandler, storeSession } from '../api/client';
import type { User } from '../api/types';
import { clearOfflineData } from '../storage/database';
import { queryPersister } from '../storage/queryPersister';
import { tokenStore } from './tokenStore';

type SignupInput = {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  password_confirmation: string;
};

type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInDemo: () => Promise<void>;
  signUp: (input: SignupInput) => ReturnType<typeof endpoints.signup>;
  forgotPassword: (email: string) => ReturnType<typeof endpoints.forgotPassword>;
  resetPassword: (input: { reset_password_token: string; password: string; password_confirmation: string }) => ReturnType<typeof endpoints.resetPassword>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  startImpersonation: (userId: number) => Promise<void>;
  stopImpersonation: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const expireSession = useCallback(async () => {
    await tokenStore.clear();
    await queryPersister.removeClient();
    await clearOfflineData();
    setUser(null);
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(() => void expireSession());
    return () => setSessionExpiredHandler(null);
  }, [expireSession]);

  useEffect(() => {
    let active = true;
    const hydrate = async () => {
      try {
        const tokens = await tokenStore.get();
        if (!tokens) return;
        const currentUser = await endpoints.me();
        if (active) setUser(currentUser);
      } catch {
        await expireSession();
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void hydrate();
    return () => {
      active = false;
    };
  }, [expireSession]);

  const applySession = useCallback(async (session: Awaited<ReturnType<typeof endpoints.login>>) => {
    await storeSession(session);
    setUser(session.user);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await applySession(await endpoints.login(email, password));
  }, [applySession]);

  const signInWithGoogle = useCallback(async () => {
    const { getFirebaseTokenFromGoogle } = await import('./googleAuth');
    const firebaseToken = await getFirebaseTokenFromGoogle();
    await applySession(await endpoints.google(firebaseToken));
  }, [applySession]);

  const signInDemo = useCallback(async () => {
    await applySession(await endpoints.demo());
  }, [applySession]);

  const signOut = useCallback(async () => {
    const tokens = await tokenStore.get();
    try {
      if (tokens?.refreshToken) await endpoints.logout(tokens.refreshToken);
    } finally {
      try {
        const { clearGoogleSession } = await import('./googleAuth');
        await clearGoogleSession();
      } catch {
        // Native Google Sign-In is optional in local and web builds.
      }
      await expireSession();
    }
  }, [expireSession]);

  const refreshUser = useCallback(async () => {
    setUser(await endpoints.me());
  }, []);

  const startImpersonation = useCallback(async (userId: number) => {
    const session = await endpoints.startImpersonation(userId);
    await tokenStore.updateAccess(session.access_token, session.access_token_expires_at);
    setUser(session.user);
  }, []);

  const stopImpersonation = useCallback(async () => {
    const session = await endpoints.stopImpersonation();
    await tokenStore.updateAccess(session.access_token, session.access_token_expires_at);
    setUser(session.user);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      signIn,
      signInWithGoogle,
      signInDemo,
      signUp: endpoints.signup,
      forgotPassword: endpoints.forgotPassword,
      resetPassword: endpoints.resetPassword,
      signOut,
      refreshUser,
      startImpersonation,
      stopImpersonation,
    }),
    [user, isLoading, signIn, signInWithGoogle, signInDemo, signOut, refreshUser, startImpersonation, stopImpersonation],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
