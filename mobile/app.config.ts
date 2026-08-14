import type { ConfigContext, ExpoConfig } from 'expo/config';
import { AndroidConfig, withAndroidManifest } from '@expo/config-plugins';

import appJson from './app.json';

export default ({ config }: ConfigContext): ExpoConfig => {
  const base = appJson.expo as ExpoConfig;
  const configuredProjectId = (base.extra?.eas as { projectId?: string } | undefined)?.projectId;
  const easProjectId = process.env.EAS_PROJECT_ID || configuredProjectId;
  const webUrl = process.env.EXPO_PUBLIC_WEB_URL;
  const webHost = webUrl ? safeHost(webUrl) : undefined;
  const googleServicesJson = process.env.GOOGLE_SERVICES_JSON;
  const googleServiceInfoPlist = process.env.GOOGLE_SERVICE_INFO_PLIST;
  const googleIosUrlScheme = process.env.GOOGLE_IOS_URL_SCHEME;
  const plugins = (base.plugins || []).filter((plugin) => {
    const name = Array.isArray(plugin) ? plugin[0] : plugin;
    return name !== '@react-native-google-signin/google-signin';
  });
  const googlePlugin: NonNullable<ExpoConfig['plugins']>[number] | undefined = googleServicesJson || googleServiceInfoPlist
    ? '@react-native-google-signin/google-signin'
    : googleIosUrlScheme
      ? ['@react-native-google-signin/google-signin', { iosUrlScheme: googleIosUrlScheme }]
      : undefined;

  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  const developmentBuild = process.env.EAS_BUILD_PROFILE === 'development' || process.env.NODE_ENV !== 'production';
  const allowDevelopmentCleartext = Boolean(developmentBuild && process.env.EXPO_PUBLIC_ALLOW_INSECURE_DEV === 'true' && apiUrl?.startsWith('http://'));

  return withAndroidManifest({
    ...config,
    ...base,
    extra: {
      ...base.extra,
      eas: easProjectId ? { projectId: easProjectId } : undefined,
    },
    updates: easProjectId ? { url: `https://u.expo.dev/${easProjectId}` } : undefined,
    plugins: googlePlugin ? [...plugins, googlePlugin] : plugins,
    ios: {
      ...base.ios,
      associatedDomains: webHost ? [`applinks:${webHost}`] : undefined,
      googleServicesFile: googleServiceInfoPlist || base.ios?.googleServicesFile,
      infoPlist: {
        ...base.ios?.infoPlist,
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      ...base.android,
      googleServicesFile: googleServicesJson || base.android?.googleServicesFile,
      intentFilters: webHost ? [{
        action: 'VIEW',
        autoVerify: true,
        category: ['BROWSABLE', 'DEFAULT'],
        data: [
          { scheme: 'https', host: webHost, pathPrefix: '/mobile' },
          { scheme: 'https', host: webHost, pathPrefix: '/meet' },
        ],
      }] : undefined,
    },
  }, (androidConfig) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(androidConfig.modResults);
    application.$['android:usesCleartextTraffic'] = allowDevelopmentCleartext ? 'true' : 'false';
    return androidConfig;
  });
};

function safeHost(url: string) {
  try { return new URL(url).host; } catch { return undefined; }
}
