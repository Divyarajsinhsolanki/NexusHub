import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow, isToday, parseISO } from 'date-fns';
import { BellRing, BriefcaseBusiness, CalendarClock, CheckCheck, Heart, MessageCircle, Phone } from 'lucide-react-native';
import { Href, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, SectionList, StyleSheet, Text, View } from 'react-native';

import { apiErrorMessage } from '@/src/api/client';
import { endpoints } from '@/src/api/endpoints';
import type { Notification } from '@/src/api/types';
import { useAuth } from '@/src/auth/AuthProvider';
import { MOBILE_CACHE_PAGE_LIMIT, mobileQueryKeys } from '@/src/cache/mobileCache';
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
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const notifications = useInfiniteQuery({
    queryKey: mobileQueryKeys.notifications,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => endpoints.notifications(pageParam),
    getNextPageParam: (page) => page.meta?.next_page ?? undefined,
    maxPages: MOBILE_CACHE_PAGE_LIMIT,
  });
  const data = useMemo(() => notifications.data?.pages.flatMap((page) => page.data) || [], [notifications.data]);
  const filtered = useMemo(() => filter === 'all' ? data : data.filter((item) => notificationCategory(item) === filter), [data, filter]);
  const sections = useMemo(() => {
    const today = filtered.filter((item) => isToday(parseISO(item.created_at)));
    const earlier = filtered.filter((item) => !isToday(parseISO(item.created_at)));
    return [{ title: 'Today', data: today }, { title: 'Earlier', data: earlier }].filter((section) => section.data.length);
  }, [filtered]);
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
      <ScrollView contentContainerStyle={styles.filters} horizontal showsHorizontalScrollIndicator={false}>
        {filterOptions.map((option) => <Pressable accessibilityRole="button" key={option.value} onPress={() => setFilter(option.value)} style={[styles.filter, { backgroundColor: filter === option.value ? theme.primary : theme.surface, borderColor: filter === option.value ? theme.primary : theme.border }]}><Text style={[styles.filterText, { color: filter === option.value ? '#ffffff' : theme.text }]}>{option.label}</Text></Pressable>)}
      </ScrollView>
      {notifications.isPending && !notifications.data ? <LoadingState label="Loading notifications" /> : null}
      {notifications.isError && !notifications.data ? <ErrorState message={apiErrorMessage(notifications.error)} onRetry={() => notifications.refetch()} /> : null}
      {notifications.data ? (
        <SectionList
          contentContainerStyle={styles.list}
          sections={sections}
          keyExtractor={(item) => String(item.id)}
          onEndReached={() => notifications.hasNextPage && notifications.fetchNextPage()}
          onEndReachedThreshold={0.4}
          onRefresh={() => notifications.refetch()}
          refreshing={notifications.isRefetching && !notifications.isFetchingNextPage}
          renderItem={({ item }) => <NotificationRow notification={item} onPress={() => openNotification(item)} />}
          renderSectionHeader={({ section }) => <Text style={[styles.sectionTitle, { backgroundColor: theme.background, color: theme.textMuted }]}>{section.title.toUpperCase()}</Text>}
          ListEmptyComponent={<EmptyState title={filter === 'all' ? 'No notifications' : `No ${filter.replace('_', ' ')} alerts`} message="New activity will appear here when it needs your attention." />}
          stickySectionHeadersEnabled
        />
      ) : null}
    </Screen>
  );
}

export function NotificationRow({ notification, onPress }: { notification: Notification; onPress: () => void }) {
  const theme = useAppTheme();
  const unread = !notification.read_at;
  const category = notificationCategory(notification);
  const Icon = categoryIcon(category);
  return (
    <Pressable
      accessibilityLabel={`${unread ? 'Unread. ' : ''}${notification.message}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, { backgroundColor: unread ? theme.surfaceMuted : theme.surface, borderColor: theme.border, opacity: pressed ? 0.72 : 1 }]}>
      <View style={[styles.categoryIcon, { backgroundColor: categoryColor(category, theme, true) }]}><Icon color={categoryColor(category, theme)} size={20} /></View>
      <View style={styles.copy}>
        <Text style={[styles.categoryLabel, { color: categoryColor(category, theme) }]}>{category.replace('_', ' ').toUpperCase()}</Text>
        <Text style={[styles.message, { color: theme.text }, unread && styles.unreadText]}>{notification.message}</Text>
        <Text style={[styles.time, { color: theme.textMuted }]}>{formatDistanceToNow(parseISO(notification.created_at), { addSuffix: true })}</Text>
      </View>
      {unread ? <View accessibilityLabel="Unread" style={[styles.dot, { backgroundColor: theme.primary }]} /> : null}
    </Pressable>
  );
}

type NotificationFilter = 'all' | 'chat' | 'calls' | 'work' | 'social' | 'reminders';
const filterOptions: Array<{ value: NotificationFilter; label: string }> = [
  { value: 'all', label: 'All' }, { value: 'chat', label: 'Chat' }, { value: 'calls', label: 'Calls' }, { value: 'work', label: 'Work' }, { value: 'social', label: 'Social' }, { value: 'reminders', label: 'Reminders' },
];

function notificationCategory(notification: Notification): Exclude<NotificationFilter, 'all'> {
  if (notification.category === 'audio_calls' || notification.category === 'video_calls') return 'calls';
  if (notification.category) return notification.category;
  if (notification.action.includes('call')) return 'calls';
  if (['chat_message', 'chat_ping', 'reacted', 'chat_mention', 'message_reacted'].includes(notification.action)) return 'chat';
  if (['commented', 'post_liked', 'post_commented', 'skill_endorsed'].includes(notification.action)) return 'social';
  if (notification.action.includes('reminder')) return 'reminders';
  return 'work';
}

function categoryIcon(category: Exclude<NotificationFilter, 'all'>) {
  if (category === 'chat') return MessageCircle;
  if (category === 'calls') return Phone;
  if (category === 'social') return Heart;
  if (category === 'reminders') return CalendarClock;
  if (category === 'work') return BriefcaseBusiness;
  return BellRing;
}

function categoryColor(category: Exclude<NotificationFilter, 'all'>, theme: ReturnType<typeof useAppTheme>, muted = false) {
  const color = category === 'chat' ? theme.primary : category === 'calls' ? theme.success : category === 'social' ? '#db2777' : category === 'reminders' ? theme.warning : '#4f46e5';
  return muted ? `${color}18` : color;
}

const styles = StyleSheet.create({
  headerButton: { alignItems: 'center', height: 40, justifyContent: 'center', width: 40 },
  filters: { gap: 8, paddingHorizontal: 16, paddingVertical: 11 }, filter: { borderRadius: 18, borderWidth: 1, justifyContent: 'center', minHeight: 36, paddingHorizontal: 14 }, filterText: { fontSize: 12, fontWeight: '800' },
  list: { flexGrow: 1, padding: 16, paddingTop: 3, paddingBottom: 36 }, sectionTitle: { fontSize: 10, fontWeight: '900', letterSpacing: 0.8, paddingBottom: 8, paddingTop: 13 },
  row: { alignItems: 'center', borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 12, marginBottom: 8, minHeight: 78, padding: 13 },
  categoryIcon: { alignItems: 'center', borderRadius: 9, height: 42, justifyContent: 'center', width: 42 }, categoryLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 0.6, marginBottom: 3 },
  copy: { flex: 1 },
  message: { fontSize: 14, lineHeight: 20 },
  unreadText: { fontWeight: '700' },
  time: { fontSize: 11, marginTop: 5 },
  dot: { borderRadius: 4, height: 8, width: 8 },
});
