import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { endpoints } from '../api/endpoints';
import { useAuth } from '../auth/AuthProvider';
import { refreshCachesForDeepLink } from '../cache/mobileCache';
import { normalizeMobileDeepLink } from '../navigation/deepLinks';

export function PushRegistrar() {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const handledResponse = useRef<string | null>(null);

  useEffect(() => {
    if (!user || Platform.OS === 'web') return;
    let active = true;

    const register = async () => {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('general', {
          name: 'Nexus Hub updates',
          importance: Notifications.AndroidImportance.DEFAULT,
          vibrationPattern: [0, 180],
          lightColor: '#2563eb',
        });
        await Notifications.setNotificationChannelAsync('calls', {
          name: 'Incoming calls',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 350, 180, 350],
          lightColor: '#16a34a',
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          sound: 'default',
        });
      }

      const existing = await Notifications.getPermissionsAsync();
      const permission = existing.status === 'granted' ? existing : await Notifications.requestPermissionsAsync();
      if (!active || permission.status !== 'granted') return;

      const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
      if (!projectId) return;
      const token = await Notifications.getExpoPushTokenAsync({ projectId });
      if (!active) return;

      await endpoints.registerDevice({
        expo_push_token: token.data,
        platform: Platform.OS,
        device_identifier: Device.osBuildId || Device.modelId,
        device_name: Device.deviceName || Device.modelName,
        app_version: Constants.expoConfig?.version,
      });
    };

    void register().catch(() => undefined);
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const openNotification = (response: Notifications.NotificationResponse) => {
      const request = response.notification.request;
      const deepLink = normalizeMobileDeepLink(request.content.data?.deep_link);
      const responseKey = request.identifier || deepLink;
      if (!deepLink || (responseKey && handledResponse.current === responseKey)) return;
      handledResponse.current = responseKey || null;
      router.push(deepLink as never);
    };
    const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
      void refreshCachesForDeepLink(queryClient, notification.request.content.data?.deep_link);
    });
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      openNotification(response);
    });
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      openNotification(response);
      void Notifications.clearLastNotificationResponseAsync();
    }).catch(() => undefined);
    return () => {
      receivedSubscription.remove();
      subscription.remove();
    };
  }, [queryClient, router, user]);

  return null;
}
