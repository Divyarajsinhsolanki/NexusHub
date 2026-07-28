import type { ConfigContext, ExpoConfig } from 'expo/config';

import appJson from './app.json';

export default ({ config }: ConfigContext): ExpoConfig => {
  const base = appJson.expo as ExpoConfig;
  const configuredProjectId = (base.extra?.eas as { projectId?: string } | undefined)?.projectId;
  const easProjectId = process.env.EAS_PROJECT_ID || configuredProjectId;
  const webUrl = process.env.EXPO_PUBLIC_WEB_URL;
  const webHost = webUrl ? safeHost(webUrl) : undefined;

  return {
    ...config,
    ...base,
    extra: {
      ...base.extra,
      eas: easProjectId ? { projectId: easProjectId } : undefined,
    },
    updates: easProjectId ? { url: `https://u.expo.dev/${easProjectId}` } : undefined,
    ios: {
      ...base.ios,
      associatedDomains: webHost ? [`applinks:${webHost}`] : undefined,
    },
    android: {
      ...base.android,
      intentFilters: webHost ? [{
        action: 'VIEW',
        autoVerify: true,
        category: ['BROWSABLE', 'DEFAULT'],
        data: [{ scheme: 'https', host: webHost, pathPrefix: '/mobile' }],
      }] : undefined,
    },
  };
};

function safeHost(url: string) {
  try { return new URL(url).host; } catch { return undefined; }
}
