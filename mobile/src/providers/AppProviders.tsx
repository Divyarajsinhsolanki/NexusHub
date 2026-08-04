import NetInfo from '@react-native-community/netinfo';
import { QueryClient, onlineManager } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { PropsWithChildren, useEffect, useState } from 'react';

import { AuthProvider } from '../auth/AuthProvider';
import {
  createMobileQueryClient,
  MOBILE_CACHE_BUSTER,
  MOBILE_CACHE_MAX_AGE,
  shouldPersistMobileQuery,
} from '../cache/mobileCache';
import { MobileCacheWarmup } from '../cache/MobileCacheWarmup';
import { MobileRealtimeSync } from '../realtime/MobileRealtimeSync';
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
          <MobileCacheWarmup />
          <MobileRealtimeSync />
          {children}
        </AppThemeProvider>
      </AuthProvider>
    </PersistQueryClientProvider>
  );
}
