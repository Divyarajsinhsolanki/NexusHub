import NetInfo from '@react-native-community/netinfo';
import { focusManager, QueryClient, onlineManager } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { PropsWithChildren, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { AuthProvider } from '../auth/AuthProvider';
import {
  createMobileQueryClient,
  MOBILE_CACHE_BUSTER,
  MOBILE_CACHE_MAX_AGE,
  shouldPersistMobileQuery,
} from '../cache/mobileCache';
import { MobileCacheWarmup } from '../cache/MobileCacheWarmup';
import { MobileRealtimeSync } from '../realtime/MobileRealtimeSync';
import { RealtimeProvider } from '../realtime/RealtimeProvider';
import { queryPersister } from '../storage/queryPersister';
import { AppThemeProvider } from '../theme';

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState<QueryClient>(() => createMobileQueryClient());

  useEffect(
    () =>
      NetInfo.addEventListener((state) => {
        onlineManager.setOnline(Boolean(state.isConnected && state.isInternetReachable !== false));
      }),
    [],
  );

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = AppState.addEventListener('change', (status) => {
      focusManager.setFocused(status === 'active');
    });
    return () => subscription.remove();
  }, []);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        buster: MOBILE_CACHE_BUSTER,
        dehydrateOptions: { shouldDehydrateQuery: shouldPersistMobileQuery },
        maxAge: MOBILE_CACHE_MAX_AGE,
        persister: queryPersister,
      }}>
      <AuthProvider>
        <AppThemeProvider>
          <RealtimeProvider>
            <MobileCacheWarmup />
            <MobileRealtimeSync />
            {children}
          </RealtimeProvider>
        </AppThemeProvider>
      </AuthProvider>
    </PersistQueryClientProvider>
  );
}
