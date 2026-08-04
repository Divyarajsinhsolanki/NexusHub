import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { CheckCircle2, Clock3, FolderKanban, Plus, Search, TimerReset } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { apiErrorMessage } from '@/src/api/client';
import { endpoints } from '@/src/api/endpoints';
import type { TaskStatus } from '@/src/api/types';
import { mobileQueryKeys } from '@/src/cache/mobileCache';
import { PageHeader } from '@/src/components/PageHeader';
import { Screen } from '@/src/components/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/src/components/StateView';
import { TaskCard } from '@/src/components/TaskCard';
import { TouchableScale } from '@/src/components/TouchableScale';
import { useTaskStatus } from '@/src/hooks/useTaskStatus';
import { useAppTheme } from '@/src/theme';
import { useAuth } from '@/src/auth/AuthProvider';

export default function TodayScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const { user } = useAuth();
  const home = useQuery({ queryKey: mobileQueryKeys.home, queryFn: endpoints.home });
  const taskStatus = useTaskStatus();

  const updateStatus = (id: number, status: TaskStatus) => taskStatus.mutate({ id, status });

  return (
    <Screen header={<PageHeader title="Nexus Hub" subtitle={format(new Date(), 'EEEE, MMMM d')} action={<View style={styles.headerActions}><TouchableScale accessibilityLabel="Search Nexus Hub" accessibilityRole="button" onPress={() => router.push('/search')} style={[styles.headerButton, { backgroundColor: theme.surfaceMuted }]}><Search color={theme.text} size={20} /></TouchableScale>{!user?.demo_account ? <TouchableScale accessibilityLabel="Create" accessibilityRole="button" haptic="light" onPress={() => router.push('/create')} style={[styles.headerButton, { backgroundColor: theme.primary, shadowColor: theme.shadow }]}><Plus color="#ffffff" size={21} /></TouchableScale> : null}</View>} />}>
      {home.isPending && !home.data ? <LoadingState label="Loading your workday" /> : null}
      {home.isError && !home.data ? <ErrorState message={apiErrorMessage(home.error)} onRetry={() => home.refetch()} /> : null}
      {home.data ? (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl progressBackgroundColor={theme.surface} refreshing={home.isRefetching} onRefresh={() => home.refetch()} tintColor={theme.primary} />}>
          <DailyBrief firstName={user?.first_name || user?.full_name?.split(' ')[0]} minutes={home.data.summary.work_minutes_today} openTasks={home.data.summary.open_tasks} />
          <View style={styles.metrics}>
            <Metric accent={theme.primary} icon={CheckCircle2} label="Open tasks" value={home.data.summary.open_tasks} />
            <Metric accent={theme.warning} icon={Clock3} label="Due today" value={home.data.summary.due_today} />
            <Metric accent={theme.success} icon={FolderKanban} label="Active projects" value={home.data.summary.active_projects} />
            <Metric accent="#7c3aed" icon={TimerReset} label="Minutes logged" value={home.data.summary.work_minutes_today} />
          </View>

          <Text style={[styles.sectionTitle, styles.taskHeading, { color: theme.text }]}>Priority work</Text>
          <View style={styles.list}>
            {home.data.tasks.length ? (
              home.data.tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  onStatusChange={(status) => updateStatus(task.id, status)}
                  readOnly={Boolean(user?.demo_account)}
                  task={task}
                  updating={taskStatus.isPending && taskStatus.variables?.id === task.id}
                />
              ))
            ) : (
              <EmptyState title="Nothing urgent" message="Your assigned open tasks will appear here." />
            )}
          </View>
        </ScrollView>
      ) : null}
    </Screen>
  );
}

function DailyBrief({ firstName, minutes, openTasks }: { firstName?: string; minutes: number; openTasks: number }) {
  const theme = useAppTheme();
  return (
    <View style={[styles.brief, { backgroundColor: theme.surfaceRaised, borderColor: theme.border, shadowColor: theme.shadow }]}>
      <Text style={[styles.eyebrow, { color: theme.primary }]}>{greeting().toUpperCase()}</Text>
      <Text style={[styles.briefTitle, { color: theme.text }]}>{firstName ? `${firstName}, keep the day focused.` : 'Keep the day focused.'}</Text>
      <Text style={[styles.briefMeta, { color: theme.textMuted }]}>{openTasks} open tasks · {minutes} min logged today</Text>
    </View>
  );
}

function Metric({ accent, icon: Icon, label, value }: { accent: string; icon: typeof CheckCircle2; label: string; value: number }) {
  const theme = useAppTheme();
  return (
    <View style={[styles.metric, { backgroundColor: theme.surfaceRaised, borderColor: theme.border, shadowColor: theme.shadow }]}>
      <View style={[styles.metricIcon, { backgroundColor: theme.surfaceMuted }]}>
        <Icon color={accent} size={18} />
      </View>
      <Text style={[styles.metricValue, { color: theme.text }]}>{value}</Text>
      <Text numberOfLines={1} style={[styles.metricLabel, { color: theme.textMuted }]}>{label}</Text>
    </View>
  );
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 44 },
  headerActions: { flexDirection: 'row', gap: 7 },
  headerButton: { alignItems: 'center', borderRadius: 8, elevation: 1, height: 42, justifyContent: 'center', shadowOffset: { height: 2, width: 0 }, shadowOpacity: 0.1, shadowRadius: 5, width: 42 },
  brief: { borderRadius: 8, borderWidth: 1, elevation: 1, padding: 16, shadowOffset: { height: 4, width: 0 }, shadowOpacity: 0.08, shadowRadius: 10 },
  eyebrow: { fontSize: 11, fontWeight: '900' },
  briefTitle: { fontSize: 22, fontWeight: '800', lineHeight: 28, marginTop: 7 },
  briefMeta: { fontSize: 13, lineHeight: 18, marginTop: 8 },
  sectionTitle: { fontSize: 17, fontWeight: '800' },
  taskHeading: { marginTop: 28 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  metric: { borderRadius: 8, borderWidth: 1, elevation: 1, minHeight: 108, padding: 13, shadowOffset: { height: 3, width: 0 }, shadowOpacity: 0.07, shadowRadius: 8, width: '48%' },
  metricIcon: { alignItems: 'center', borderRadius: 7, height: 32, justifyContent: 'center', marginBottom: 10, width: 32 },
  metricValue: { fontSize: 26, fontWeight: '900' },
  metricLabel: { fontSize: 12, marginTop: 5 },
  list: { gap: 10, marginTop: 12, minHeight: 140 },
});
