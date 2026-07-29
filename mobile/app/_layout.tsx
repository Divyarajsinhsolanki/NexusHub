import { DarkTheme, DefaultTheme, Stack, ThemeProvider, usePathname, useRouter, useSegments } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as Sentry from '@sentry/react-native';
import * as SplashScreen from 'expo-splash-screen';
import { ActivityIndicator, Platform, StyleSheet, useColorScheme, View } from 'react-native';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { useAuth } from '@/src/auth/AuthProvider';
import { authRedirectTarget } from '@/src/auth/authRedirect';
import { AppProviders } from '@/src/providers/AppProviders';
import { PushRegistrar } from '@/src/notifications/PushRegistrar';
import { useAppTheme } from '@/src/theme';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.EXPO_PUBLIC_SENTRY_DSN),
  tracesSampleRate: 0.05,
});

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: 'index',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
    if (Platform.OS !== 'web') {
      void import('@livekit/react-native').then(({ registerGlobals }) => registerGlobals());
    }
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <AppProviders>
        <RootLayoutNav />
      </AppProviders>
    </GestureHandlerRootView>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" options={{ animation: 'fade' }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ animation: 'fade' }} />
        <Stack.Screen name="signup" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="forgot-password" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="reset-password" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="search" options={{ animation: 'fade_from_bottom' }} />
        <Stack.Screen name="create" options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
      </Stack>
      <PushRegistrar />
      <AuthGate />
    </ThemeProvider>
  );
}

function AuthGate() {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const pathname = usePathname();
  const router = useRouter();
  const theme = useAppTheme();
  const firstSegment = segments[0];
  const isPublicPortfolio = pathname === '/';
  const isAuthRoute = ['login', 'signup', 'forgot-password', 'reset-password'].includes(firstSegment);
  const isProtectedRoute = !isPublicPortfolio && !isAuthRoute;
  const redirectTarget = authRedirectTarget({
    firstSegment,
    isLoading,
    pathname,
    signedIn: Boolean(user),
  });

  useEffect(() => {
    if (redirectTarget) router.replace(redirectTarget as never);
  }, [redirectTarget, router]);

  const isTransitioning = isLoading || Boolean(redirectTarget) || (!user && isProtectedRoute) || Boolean(user && (isPublicPortfolio || isAuthRoute));

  if (!isTransitioning) return null;

  return (
    <View
      accessibilityLabel="Loading session"
      style={[styles.authGate, { backgroundColor: theme.background }]}
    >
      <ActivityIndicator color={theme.primary} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  authGate: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
});
