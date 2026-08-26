import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useGlobalSearchParams, useLocalSearchParams, usePathname, useRouter, useSegments } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as Sentry from '@sentry/react-native';
import * as SplashScreen from 'expo-splash-screen';
import { ActivityIndicator, StyleSheet, useColorScheme, View } from 'react-native';
import { useEffect, useRef } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { useAuth } from '@/src/auth/AuthProvider';
import { authRedirectTarget } from '@/src/auth/authRedirect';
import { AppProviders } from '@/src/providers/AppProviders';
import { PushRegistrar } from '@/src/notifications/PushRegistrar';
import { useAppTheme } from '@/src/theme';
import { EnvironmentGate } from '@/src/components/EnvironmentGate';
import { IncomingCallCoordinator } from '@/src/calls/IncomingCallCoordinator';
import { notificationBehavior, setVisibleNotificationRoute } from '@/src/notifications/presentation';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.EXPO_PUBLIC_SENTRY_DSN),
  tracesSampleRate: 0.05,
});

Notifications.setNotificationHandler({
  handleNotification: async (notification) => notificationBehavior(notification),
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
  return (
    <GestureHandlerRootView style={styles.root}>
      <EnvironmentGate>
        <AppProviders>
          <RootLayoutNav />
        </AppProviders>
      </EnvironmentGate>
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
        <Stack.Screen name="chat/[id]" options={{ animation: 'none', gestureEnabled: true }} />
        <Stack.Screen name="call/[id]" options={{ animation: 'none', gestureEnabled: false }} />
        <Stack.Screen name="meet/[publicId]" options={{ animation: 'none' }} />
      </Stack>
      <IncomingCallCoordinator />
      <PushRegistrar />
      <NotificationRouteTracker />
      <AuthGate />
    </ThemeProvider>
  );
}

function NotificationRouteTracker() {
  const pathname = usePathname();
  const params = useLocalSearchParams();
  useEffect(() => setVisibleNotificationRoute(pathname, params), [params, pathname]);
  return null;
}

function AuthGate() {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const pathname = usePathname();
  const router = useRouter();
  const { returnTo } = useGlobalSearchParams<{ returnTo?: string }>();
  const theme = useAppTheme();
  const splashHidden = useRef(false);
  const firstSegment = segments[0];
  const isPublicPortfolio = pathname === '/';
  const isAuthRoute = ['login', 'signup', 'forgot-password', 'reset-password'].includes(firstSegment);
  const isProtectedRoute = !isPublicPortfolio && !isAuthRoute;
  const redirectTarget = authRedirectTarget({
    firstSegment,
    isLoading,
    pathname,
    returnTo,
    signedIn: Boolean(user),
  });

  useEffect(() => {
    if (isLoading) return;

    if (redirectTarget) router.replace(redirectTarget as never);

    // Keep the native splash visible until the encrypted session has been
    // restored. The auth overlay remains mounted while a redirect settles, so
    // a signed-in user never sees the public portfolio or login screen flash.
    if (!splashHidden.current) {
      splashHidden.current = true;
      requestAnimationFrame(() => { void SplashScreen.hideAsync(); });
    }
  }, [isLoading, redirectTarget, router]);

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
