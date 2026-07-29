import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithCredential, signOut as firebaseSignOut } from 'firebase/auth';
import {
  GoogleSignin,
  isCancelledResponse,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const googleAuthConfigured = Boolean(
  firebaseConfig.apiKey
    && firebaseConfig.authDomain
    && firebaseConfig.projectId
    && firebaseConfig.appId
    && process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
);

export class GoogleSignInCancelledError extends Error {
  constructor() {
    super('Google sign-in was cancelled.');
    this.name = 'GoogleSignInCancelledError';
  }
}

let nativeConfigured = false;

export async function getFirebaseTokenFromGoogle() {
  if (!googleAuthConfigured) throw new Error('Google sign-in is not configured for this build.');

  configureNativeGoogle();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const result = await GoogleSignin.signIn();
    if (isCancelledResponse(result)) throw new GoogleSignInCancelledError();

    const idToken = result.data.idToken;
    if (!idToken) throw new Error('Google did not return an identity token. Try another account.');

    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    const credential = GoogleAuthProvider.credential(idToken);
    const firebaseUser = await signInWithCredential(getAuth(app), credential);
    return firebaseUser.user.getIdToken(true);
  } catch (error) {
    if (error instanceof GoogleSignInCancelledError) throw error;
    if (isErrorWithCode(error)) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) throw new GoogleSignInCancelledError();
      if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) throw new Error('Google Play Services is unavailable or needs an update.');
      if (error.code === statusCodes.IN_PROGRESS) throw new Error('Another Google sign-in is already in progress.');
      if (error.code === statusCodes.NULL_PRESENTER) throw new Error('Google sign-in could not open. Close other dialogs and try again.');
    }
    throw error;
  }
}

export async function clearGoogleSession() {
  try {
    configureNativeGoogle();
    await GoogleSignin.signOut();
  } catch {
    // A Nexus Hub session may have been created with email and have no Google state.
  }

  if (getApps().length) {
    try {
      await firebaseSignOut(getAuth(getApp()));
    } catch {
      // Local Nexus Hub tokens still need to be removed if Firebase cleanup fails.
    }
  }
}

function configureNativeGoogle() {
  if (nativeConfigured || !googleAuthConfigured) return;
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    offlineAccess: false,
  });
  nativeConfigured = true;
}
