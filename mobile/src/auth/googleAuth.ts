import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const googleAuthConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId && process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
);

export async function getFirebaseTokenFromGoogle() {
  if (!googleAuthConfigured) throw new Error('Google sign-in is not configured for this build.');

  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    offlineAccess: false,
  });
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const result = await GoogleSignin.signIn();
  const idToken = result.data?.idToken;
  if (!idToken) throw new Error('Google did not return an identity token.');

  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const credential = GoogleAuthProvider.credential(idToken);
  const firebaseUser = await signInWithCredential(getAuth(app), credential);
  return firebaseUser.user.getIdToken();
}
