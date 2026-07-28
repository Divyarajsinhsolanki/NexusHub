import NetInfo from '@react-native-community/netinfo';
import { QueryClient, onlineManager } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { PropsWithChildren, useEffect, useState } from 'react';

import { AuthProvider } from '../auth/AuthProvider';
import { queryPersister } from '../storage/queryPersister';

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, gcTime: 24 * 60 * 60 * 1000, retry: 1, refetchOnReconnect: true },
          mutations: { retry: 0, networkMode: 'always' },
        },
      }),
  );

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
      persistOptions={{ persister: queryPersister, maxAge: 24 * 60 * 60 * 1000 }}>
      <AuthProvider>{children}</AuthProvider>
    </PersistQueryClientProvider>
  );
}
