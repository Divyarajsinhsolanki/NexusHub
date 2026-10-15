import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ArrowRight, CheckCheck, MessageCircle, Plus, Search, Timer } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { apiErrorMessage } from '@/src/api/client';
import { endpoints } from '@/src/api/endpoints';
import type { HomeTaskFilter } from '@/src/api/types';
import { useAuth } from '@/src/auth/AuthProvider';
import { mobileQueryKeys } from '@/src/cache/mobileCache';
import { PageHeader } from '@/src/components/PageHeader';
import { Screen } from '@/src/components/Screen';
import { ErrorState, LoadingState } from '@/src/components/StateView';
import { TaskCard } from '@/src/components/TaskCard';
import { useTaskStatus } from '@/src/hooks/useTaskStatus';
import { useAppTheme } from '@/src/theme';

const filters = [
  { value: 'all_open', label: 'All open', count: 'open_tasks' },
  { value: 'due_today', label: 'Due today', count: 'due_today' },
  { value: 'overdue', label: 'Overdue', count: 'overdue_tasks' },
] as const;
const emptyCopy = {
  all_open: ['You’re all caught up', 'Your assigned open tasks will appear here.'],
  due_today: ['Nothing due today', 'Choose All open to see what you can work on next.'],
  overdue: ['No overdue tasks', 'You’re keeping up. Check Due today for your next priority.'],
};

export default function TodayScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const { user } = useAuth();
  const [filter, setFilter] = useState<HomeTaskFilter>('all_open');
  const home = useQuery({ queryKey: mobileQueryKeys.home, queryFn: endpoints.home });
  const filtered = useQuery({ queryKey: [...mobileQueryKeys.home, filter], queryFn: () => endpoints.homeByTaskFilter(filter), enabled: filter !== 'all_open', placeholderData: () => undefined });
  const active = filter === 'all_open' ? home : filtered;
  const summary = active.data?.summary || home.data?.summary;
  const asOf = active.data?.as_of_date || home.data?.as_of_date;
  const taskStatus = useTaskStatus();
  const readOnly = Boolean(user?.demo_account);
  const firstName = user?.first_name || user?.full_name?.split(' ')[0];
  const refresh = () => { void home.refetch(); if (filter !== 'all_open') void filtered.refetch(); };
  return <Screen header={<PageHeader title="My day" subtitle={format(asOf ? parseISO(asOf) : new Date(), 'EEEE, MMMM d')} action={<View style={styles.headerActions}>
    <Pressable accessibilityRole="button" accessibilityLabel="Search Nexus Hub" onPress={() => router.push('/search')} style={[styles.headerButton, { backgroundColor: theme.surfaceMuted }]}><Search color={theme.text} size={20} /></Pressable>
    {!readOnly ? <Pressable accessibilityRole="button" accessibilityLabel="Create" onPress={() => router.push('/create')} style={[styles.headerButton, { backgroundColor: theme.primary }]}><Plus color="#ffffff" size={22} /></Pressable> : null}
  </View>} />}>
    <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl progressBackgroundColor={theme.surface} refreshing={active.isRefetching} onRefresh={refresh} tintColor={theme.primary} />}>
      <Text style={[styles.greeting, { color: theme.text }]}>{firstName ? `Hello, ${firstName}` : 'Hello there'}</Text>
      <Text style={[styles.subtitle, { color: theme.textMuted }]}>A little focus. One task at a time.</Text>
      <View style={styles.shortcuts}>{[
        { label: 'All tasks', icon: CheckCheck, path: '/work?mode=tasks' },
        { label: 'Chat', icon: MessageCircle, path: '/inbox?mode=chat' },
        { label: 'Log work', icon: Timer, path: '/work?mode=logs' },
      ].map(({ label, icon: Icon, path }) => <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} onPress={() => router.push(path as never)} style={[styles.shortcut, { backgroundColor: theme.surface, borderColor: theme.border }]}><Icon size={20} color={theme.primary} /><Text style={[styles.shortcutText, { color: theme.text }]}>{label}</Text></Pressable>)}</View>
      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.text }]}>My tasks</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{filters.map(item => {
        const selected = item.value === filter;
        const count = summary?.[item.count];
        return <Pressable key={item.value} accessibilityRole="button" accessibilityLabel={`${item.label}${count == null ? '' : `, ${count} tasks`}`} accessibilityState={{ selected }} onPress={() => setFilter(item.value)} style={[styles.filter, { backgroundColor: selected ? theme.primary : theme.surface, borderColor: selected ? theme.primary : theme.border }]}><Text style={[styles.filterCount, { color: selected ? '#ffffff' : theme.text }]}>{count ?? '—'}</Text><Text style={[styles.filterLabel, { color: selected ? '#ffffff' : theme.textMuted }]}>{item.label}</Text></Pressable>;
      })}</ScrollView>
      {active.isPending && !active.data ? <LoadingState label="Loading your tasks" /> : null}
      {active.isError && !active.data ? <ErrorState message={apiErrorMessage(active.error)} onRetry={() => active.refetch()} /> : null}
      {active.isError && active.data ? <View accessibilityRole="alert" style={[styles.notice, { borderColor: theme.border, backgroundColor: theme.surface }]}><Text style={[styles.subtitle, { color: theme.textMuted }]}>Couldn’t refresh. Showing your saved tasks.</Text><Pressable accessibilityRole="button" onPress={refresh} style={styles.retry}><Text style={{ color: theme.primary, fontWeight: '700' }}>Try again</Text></Pressable></View> : null}
      {active.data ? <View style={styles.list}>{active.data.tasks.length ? <>
        <Text style={[styles.subtitle, { color: theme.textMuted }]}>Up to 5 tasks, ordered by due date</Text>
        {active.data.tasks.map(task => <TaskCard key={task.id} task={task} readOnly={readOnly} onInspect={() => router.push(`/work?taskId=${task.id}` as never)} onStatusChange={status => taskStatus.mutate({ id: task.id, status })} updating={taskStatus.isPending && taskStatus.variables?.id === task.id} />)}
        <Pressable accessibilityRole="button" accessibilityLabel="View all tasks" onPress={() => router.push('/work?mode=tasks' as never)} style={styles.viewAll}><Text style={[styles.shortcutText, { color: theme.primary }]}>View all tasks</Text><ArrowRight size={18} color={theme.primary} /></Pressable>
      </> : <View style={[styles.empty, { backgroundColor: theme.surface, borderColor: theme.border }]}><CheckCheck color={theme.primary} size={28} /><Text style={[styles.emptyTitle, { color: theme.text }]}>{emptyCopy[filter][0]}</Text><Text style={[styles.emptyMessage, { color: theme.textMuted }]}>{emptyCopy[filter][1]}</Text></View>}</View> : null}
    </ScrollView>
  </Screen>;
}
const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 36 },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  greeting: { fontSize: 22, lineHeight: 30, fontWeight: '700' },
  subtitle: { fontSize: 14, lineHeight: 21, marginTop: 4 },
  shortcuts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 20, marginBottom: 26 },
  shortcut: { flex: 1, minWidth: 84, minHeight: 72, alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 14, padding: 10 },
  shortcutText: { fontSize: 14, fontWeight: '600', textAlign: 'center', flexShrink: 1 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  filters: { gap: 8, paddingBottom: 4 },
  filter: { minWidth: 102, minHeight: 76, borderRadius: 14, borderWidth: 1, padding: 12, gap: 4 },
  filterCount: { fontSize: 22, fontWeight: '700' },
  filterLabel: { fontSize: 14 },
  list: { gap: 12, marginTop: 12 },
  viewAll: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 10 },
  empty: { borderWidth: 1, borderRadius: 16, padding: 24, alignItems: 'center', gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '600', textAlign: 'center' },
  emptyMessage: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
  notice: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 12 },
  retry: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: 8 },
});
