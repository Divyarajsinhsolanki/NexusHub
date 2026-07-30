import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { warmMobileCache } from './mobileCache';

export function MobileCacheWarmup() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) return;
    void warmMobileCache(queryClient);
  }, [queryClient, user?.id, user?.workspace.id]);

  return null;
}
