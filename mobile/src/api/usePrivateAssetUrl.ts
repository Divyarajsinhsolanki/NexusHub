import { useEffect, useState } from 'react';
import { absoluteAssetUrl, api, API_URL } from './client';

// Bearer credentials stay in the API request, never in an external image URL.
export function usePrivateAssetUrl(path?: string | null, retryKey = 0) {
  const absolute = absoluteAssetUrl(path);
  const origin = API_URL.replace(/\/api\/v1$/, '');
  const privatePath = absolute?.startsWith(`${origin}/rails/active_storage/blobs/`) ? absolute : undefined;
  const [grant, setGrant] = useState<{ path: string; url: string }>();
  useEffect(() => {
    if (!privatePath) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const signedId = new URL(privatePath).pathname.split('/')[5];
        const response = await api.post('/file_access', { signed_id: signedId });
        const url = absoluteAssetUrl(response.data.data.url);
        if (!cancelled && url) {
          setGrant({ path: privatePath, url });
          timer = setTimeout(load, 240000);
        }
      } catch { if (!cancelled) setGrant(undefined); }
    };
    void load();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [privatePath, retryKey]);
  return privatePath ? (grant?.path === privatePath ? grant.url : undefined) : absolute;
}
