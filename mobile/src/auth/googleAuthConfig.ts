import Constants from 'expo-constants';
import { Platform } from 'react-native';

type NativeGoogleAuthConfig = {
  android?: boolean;
  ios?: boolean;
};

export function isGoogleAuthConfigured() {
  const nativeConfig = Constants.expoConfig?.extra?.googleNativeAuth as NativeGoogleAuthConfig | undefined;
  const nativeReady = Platform.OS === 'android'
    ? nativeConfig?.android === true
    : Platform.OS === 'ios' && nativeConfig?.ios === true;

  return Boolean(
    nativeReady
      && process.env.EXPO_PUBLIC_FIREBASE_API_KEY
      && process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN
      && process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID
      && process.env.EXPO_PUBLIC_FIREBASE_APP_ID
      && process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  );
}
