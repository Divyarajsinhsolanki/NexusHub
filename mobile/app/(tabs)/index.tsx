import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Plus, Search } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { apiErrorMessage } from '@/src/api/client';
import { endpoints } from '@/src/api/endpoints';
import type { TaskStatus } from '@/src/api/types';
import { PageHeader } from '@/src/components/PageHeader';
import { Screen } from '@/src/components/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/src/components/StateView';
import { TaskCard } from '@/src/components/TaskCard';
import { useTaskStatus } from '@/src/hooks/useTaskStatus';
import { useAppTheme } from '@/src/theme';

export default function HomeScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const home = useQuery({ queryKey: ['home'], queryFn: endpoints.home });
  const taskStatus = useTaskStatus();

  const updateStatus = (id: number, status: TaskStatus) => taskStatus.mutate({ id, status });

  return (
    <Screen header={<PageHeader title="Nexus Hub" subtitle={format(new Date(), 'EEEE, MMMM d')} action={<View style={styles.headerActions}><Pressable accessibilityLabel="Search Nexus Hub" onPress={() => router.push('/search')} style={[styles.headerButton, { backgroundColor: theme.surfaceMuted }]}><Search color={theme.text} size={20} /></Pressable><Pressable accessibilityLabel="Create" onPress={() => router.push('/create')} style={[styles.headerButton, { backgroundColor: theme.primary }]}><Plus color="#ffffff" size={21} /></Pressable></View>} />}>
      {home.isLoading ? <LoadingState label="Loading your workday" /> : null}
      {home.isError ? <ErrorState message={apiErrorMessage(home.error)} onRetry={() => home.refetch()} /> : null}
      {home.data ? (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={home.isRefetching} onRefresh={() => home.refetch()} tintColor={theme.primary} />}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Today</Text>
          <View style={styles.metrics}>
            <Metric label="Open tasks" value={home.data.summary.open_tasks} />
            <Metric label="Due today" value={home.data.summary.due_today} />
            <Metric label="Active projects" value={home.data.summary.active_projects} />
            <Metric label="Minutes logged" value={home.data.summary.work_minutes_today} />
          </View>

          <Text style={[styles.sectionTitle, styles.taskHeading, { color: theme.text }]}>Priority work</Text>
          <View style={styles.list}>
            {home.data.tasks.length ? (
              home.data.tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  onStatusChange={(status) => updateStatus(task.id, status)}
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

function Metric({ label, value }: { label: string; value: number }) {
  const theme = useAppTheme();
  return (
    <View style={[styles.metric, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[styles.metricValue, { color: theme.text }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: theme.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 36 },
  headerActions: { flexDirection: 'row', gap: 7 },
  headerButton: { alignItems: 'center', borderRadius: 8, height: 42, justifyContent: 'center', width: 42 },
  sectionTitle: { fontSize: 17, fontWeight: '700' },
  taskHeading: { marginTop: 28 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  metric: { borderRadius: 8, borderWidth: 1, minHeight: 92, padding: 14, width: '48%' },
  metricValue: { fontSize: 26, fontWeight: '800' },
  metricLabel: { fontSize: 12, marginTop: 5 },
  list: { gap: 10, marginTop: 12, minHeight: 140 },
});
