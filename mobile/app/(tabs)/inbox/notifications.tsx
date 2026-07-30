import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { CheckCheck } from 'lucide-react-native';
import { Href, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { apiErrorMessage } from '@/src/api/client';
import { endpoints } from '@/src/api/endpoints';
import type { Notification } from '@/src/api/types';
import { useAuth } from '@/src/auth/AuthProvider';
import { MOBILE_CACHE_PAGE_LIMIT, mobileQueryKeys } from '@/src/cache/mobileCache';
import { Avatar } from '@/src/components/Avatar';
import { PageHeader } from '@/src/components/PageHeader';
import { Screen } from '@/src/components/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/src/components/StateView';
import { normalizeMobileDeepLink } from '@/src/navigation/deepLinks';
import { useAppTheme } from '@/src/theme';

export default function NotificationsScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const writable = !user?.demo_account;
  const notifications = useInfiniteQuery({
    queryKey: mobileQueryKeys.notifications,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => endpoints.notifications(pageParam),
    getNextPageParam: (page) => page.meta?.next_page ?? undefined,
    maxPages: MOBILE_CACHE_PAGE_LIMIT,
  });
  const data = useMemo(() => notifications.data?.pages.flatMap((page) => page.data) || [], [notifications.data]);
  const unread = notifications.data?.pages[0]?.meta?.unread_count || 0;
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: mobileQueryKeys.notifications });
    await queryClient.invalidateQueries({ queryKey: mobileQueryKeys.home });
  };
  const markRead = useMutation({ mutationFn: endpoints.readNotification, onSuccess: refresh });
  const markAll = useMutation({
    mutationFn: endpoints.readAllNotifications,
    onSuccess: refresh,
    onError: (error) => Alert.alert('Unable to update notifications', apiErrorMessage(error)),
  });

  const openNotification = async (notification: Notification) => {
    if (writable && !notification.read_at) {
      try {
        await markRead.mutateAsync(notification.id);
      } catch {
        // Navigation remains useful when a cached notification is opened offline.
      }
    }
    router.push((normalizeMobileDeepLink(notification.deep_link) || '/inbox/notifications') as Href);
  };

  return (
    <Screen
      header={
        <PageHeader
          action={writable && unread ? (
            <Pressable accessibilityLabel="Mark all notifications read" accessibilityRole="button" disabled={markAll.isPending} onPress={() => markAll.mutate()} style={styles.headerButton}>
              <CheckCheck color={theme.primary} size={23} />
            </Pressable>
          ) : undefined}
          subtitle={unread ? `${unread} unread` : 'All caught up'}
          title="Notifications"
        />
      }>
      {notifications.isPending && !notifications.data ? <LoadingState label="Loading notifications" /> : null}
      {notifications.isError && !notifications.data ? <ErrorState message={apiErrorMessage(notifications.error)} onRetry={() => notifications.refetch()} /> : null}
      {notifications.data ? (
        <FlatList
          contentContainerStyle={styles.list}
          data={data}
          keyExtractor={(item) => String(item.id)}
          onEndReached={() => notifications.hasNextPage && notifications.fetchNextPage()}
          onEndReachedThreshold={0.4}
          onRefresh={() => notifications.refetch()}
          refreshing={notifications.isRefetching && !notifications.isFetchingNextPage}
          renderItem={({ item }) => <NotificationRow notification={item} onPress={() => openNotification(item)} />}
          ListEmptyComponent={<EmptyState title="No notifications" message="Assignments and project updates will appear here." />}
        />
      ) : null}
    </Screen>
  );
}

export function NotificationRow({ notification, onPress }: { notification: Notification; onPress: () => void }) {
  const theme = useAppTheme();
  const unread = !notification.read_at;
  return (
    <Pressable
      accessibilityLabel={`${unread ? 'Unread. ' : ''}${notification.message}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, { backgroundColor: unread ? theme.surfaceMuted : theme.surface, borderColor: theme.border, opacity: pressed ? 0.72 : 1 }]}>
      <Avatar color={notification.actor.avatar_color} name={notification.actor.name} size={42} uri={notification.actor.profile_picture} />
      <View style={styles.copy}>
        <Text style={[styles.message, { color: theme.text }, unread && styles.unreadText]}>{notification.message}</Text>
        <Text style={[styles.time, { color: theme.textMuted }]}>{formatDistanceToNow(parseISO(notification.created_at), { addSuffix: true })}</Text>
      </View>
      {unread ? <View accessibilityLabel="Unread" style={[styles.dot, { backgroundColor: theme.primary }]} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerButton: { alignItems: 'center', height: 40, justifyContent: 'center', width: 40 },
  list: { flexGrow: 1, gap: 8, padding: 16, paddingBottom: 36 },
  row: { alignItems: 'center', borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 12, minHeight: 78, padding: 13 },
  copy: { flex: 1 },
  message: { fontSize: 14, lineHeight: 20 },
  unreadText: { fontWeight: '700' },
  time: { fontSize: 11, marginTop: 5 },
  dot: { borderRadius: 4, height: 8, width: 8 },
});
