import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { BellRing, ShieldCheck } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { endpoints } from '../api/endpoints';
import type { User } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { refreshCachesForDeepLink } from '../cache/mobileCache';
import { normalizeMobileDeepLink } from '../navigation/deepLinks';
import { useAppTheme } from '../theme';
import { processNotificationResponse, retryPendingNotificationActions } from './actions';
import { PUSH_SCHEMA_VERSION } from './constants';
import { setupNotificationPresentation } from './setup';

const PRIMER_KEY = 'nexus.notifications.primer.dismissed';
const registeredTimezones = new Map<number, string>();

export function PushRegistrar() {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const theme = useAppTheme();
  const [showPrimer, setShowPrimer] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const handledResponse = useRef<string | null>(null);
  const registrationInFlight = useRef<Promise<void> | null>(null);

  const registerDevice = useCallback(async () => {
    if (!user || Platform.OS === 'web') return;
    if (registrationInFlight.current) return registrationInFlight.current;
    const operation = (async () => {
      await registerCurrentPushDevice(user);
    })().finally(() => {
      registrationInFlight.current = null;
    });
    registrationInFlight.current = operation;
    return operation;
  }, [user]);

  useEffect(() => {
    if (!user || Platform.OS === 'web') return;
    let active = true;
    const initialize = async () => {
      await setupNotificationPresentation().catch(() => undefined);
      const permission = await Notifications.getPermissionsAsync();
      if (!active) return;
      if (permission.status === 'granted') {
        await registerDevice();
        return;
      }
      if (permission.status === 'undetermined') {
        const dismissed = await AsyncStorage.getItem(`${PRIMER_KEY}.${user.id}`);
        if (active && dismissed !== 'true') setShowPrimer(true);
      }
    };
    void initialize().catch(() => undefined);
    return () => { active = false; };
  }, [registerDevice, user]);

  useEffect(() => {
    if (!user || Platform.OS === 'web' || typeof Notifications.addPushTokenListener !== 'function') return;
    const subscription = Notifications.addPushTokenListener(() => {
      void registerDevice().catch(() => undefined);
    });
    return () => subscription.remove();
  }, [registerDevice, user]);

  useEffect(() => {
    if (!user || Platform.OS === 'web') return;
    const recover = () => {
      void retryPendingNotificationActions();
      void registerDevice().catch(() => undefined);
    };
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') recover();
    });
    const networkSubscription = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) recover();
    });
    return () => {
      appStateSubscription.remove();
      networkSubscription();
    };
  }, [registerDevice, user]);

  useEffect(() => {
    if (!user || Platform.OS === 'web') return;
    const openNotification = async (response: Notifications.NotificationResponse) => {
      const request = response.notification.request;
      const responseKey = `${request.identifier}:${response.actionIdentifier}:${response.userText || ''}`;
      if (handledResponse.current === responseKey) return;
      handledResponse.current = responseKey;
      const defaultTap = !response.actionIdentifier || response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER;
      const immediateLink = defaultTap ? normalizeMobileDeepLink(request.content.data?.deep_link) : null;
      if (immediateLink) router.push(immediateLink as never);
      try {
        const result = await processNotificationResponse(response);
        await refreshCachesForDeepLink(queryClient, request.content.data?.deep_link);
        await syncBadgeCount();
        if (result.deepLink && result.deepLink !== immediateLink) router.push(result.deepLink as never);
      } catch {
        // The action processor queued the operation; normal notification content remains available.
      }
    };
    const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
      void refreshCachesForDeepLink(queryClient, notification.request.content.data?.deep_link);
    });
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      void openNotification(response);
    });
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      void openNotification(response);
      void Notifications.clearLastNotificationResponseAsync();
    }).catch(() => undefined);
    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, [queryClient, router, user]);

  const enable = async () => {
    setRequesting(true);
    try {
      const permission = await Notifications.requestPermissionsAsync({
        android: {},
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      });
      setShowPrimer(false);
      if (permission.status === 'granted') await registerDevice();
      else await AsyncStorage.setItem(`${PRIMER_KEY}.${user?.id}`, 'true');
    } finally {
      setRequesting(false);
    }
  };

  const notNow = async () => {
    setShowPrimer(false);
    if (user) await AsyncStorage.setItem(`${PRIMER_KEY}.${user.id}`, 'true');
  };

  return (
    <Modal animationType="fade" onRequestClose={() => void notNow()} transparent visible={showPrimer}>
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={[styles.icon, { backgroundColor: theme.surfaceMuted }]}><BellRing color={theme.primary} size={28} /></View>
          <Text style={[styles.title, { color: theme.text }]}>Stay on top of what matters</Text>
          <Text style={[styles.body, { color: theme.textMuted }]}>Get distinct alerts for messages, calls, assigned work, social activity, and reminders. You can change every category later.</Text>
          <View style={styles.privacy}><ShieldCheck color={theme.success} size={18} /><Text style={[styles.privacyText, { color: theme.textMuted }]}>Message previews and quiet hours are under your control.</Text></View>
          <Pressable accessibilityRole="button" disabled={requesting} onPress={() => void enable()} style={[styles.primary, { backgroundColor: theme.primary, opacity: requesting ? 0.7 : 1 }]}><Text style={styles.primaryText}>{requesting ? 'Enabling…' : 'Enable notifications'}</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={requesting} onPress={() => void notNow()} style={styles.secondary}><Text style={[styles.secondaryText, { color: theme.textMuted }]}>Not now</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

function currentTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

export async function registerCurrentPushDevice(user: User) {
  if (Platform.OS === 'web') return false;
  const permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') return false;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
  if (!projectId) return false;
  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  const timezone = currentTimezone();
  await endpoints.registerDevice({
    expo_push_token: token.data,
    platform: Platform.OS,
    device_identifier: Device.osBuildId || Device.modelId,
    device_name: Device.deviceName || Device.modelName,
    app_version: Constants.expoConfig?.version,
    native_build_version: Application.nativeBuildVersion || Constants.nativeBuildVersion,
    app_variant: Constants.expoConfig?.extra?.appVariant || process.env.EXPO_PUBLIC_APP_VARIANT || 'development',
    push_schema_version: PUSH_SCHEMA_VERSION,
  });
  const push = user.push_notification_settings;
  if (push?.quiet_hours?.timezone !== timezone && registeredTimezones.get(user.id) !== timezone) {
    await endpoints.updateMe({
      push_notification_settings: {
        ...push,
        quiet_hours: { ...push?.quiet_hours, timezone },
      },
    });
    registeredTimezones.set(user.id, timezone);
  }
  return true;
}

async function syncBadgeCount() {
  try {
    const page = await endpoints.notifications(1);
    await Notifications.setBadgeCountAsync(Number(page.meta?.unread_count || 0));
  } catch {
    // A later foreground reconciliation will restore the badge when the network is available.
  }
}

const styles = StyleSheet.create({
  backdrop: { alignItems: 'center', backgroundColor: 'rgba(2, 6, 23, 0.72)', flex: 1, justifyContent: 'center', padding: 22 },
  card: { borderRadius: 16, borderWidth: 1, maxWidth: 420, padding: 24, width: '100%' },
  icon: { alignItems: 'center', borderRadius: 12, height: 52, justifyContent: 'center', width: 52 },
  title: { fontSize: 22, fontWeight: '900', lineHeight: 28, marginTop: 20 },
  body: { fontSize: 14, lineHeight: 21, marginTop: 9 },
  privacy: { alignItems: 'center', flexDirection: 'row', gap: 9, marginTop: 18 },
  privacyText: { flex: 1, fontSize: 12, lineHeight: 17 },
  primary: { alignItems: 'center', borderRadius: 9, justifyContent: 'center', marginTop: 24, minHeight: 50 },
  primaryText: { color: '#ffffff', fontSize: 15, fontWeight: '900' },
  secondary: { alignItems: 'center', justifyContent: 'center', minHeight: 46 },
  secondaryText: { fontSize: 14, fontWeight: '800' },
});
