import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Bug, FolderLock, ListTree, Plus, Server, TimerReset, Users } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
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

export default function ProjectDetailScreen() {
  const params = useLocalSearchParams<{ id: string; taskId?: string }>();
  const projectId = Number(params.id);
  const selectedTaskId = Number(params.taskId || 0);
  const router = useRouter();
  const theme = useAppTheme();
  const project = useQuery({ queryKey: ['project', projectId], queryFn: () => endpoints.project(projectId), enabled: Number.isFinite(projectId) });
  const sprints = useQuery({ queryKey: ['project-sprints', projectId], queryFn: () => endpoints.sprints(projectId), enabled: Number.isFinite(projectId) });
  const tasks = useQuery({ queryKey: ['project-tasks', projectId], queryFn: () => endpoints.tasks({ project_id: projectId, per_page: 100 }), enabled: Number.isFinite(projectId) });
  const taskStatus = useTaskStatus();
  const refreshing = project.isRefetching || sprints.isRefetching || tasks.isRefetching;
  const taskData = [...(tasks.data?.data || [])].sort((a, b) => (a.id === selectedTaskId ? -1 : b.id === selectedTaskId ? 1 : 0));
  const refresh = () => Promise.all([project.refetch(), sprints.refetch(), tasks.refetch()]);
  const changeStatus = (id: number, status: TaskStatus) => taskStatus.mutate({ id, status });

  return (
    <Screen
      header={<PageHeader leading={<Pressable accessibilityLabel="Back to projects" accessibilityRole="button" hitSlop={10} onPress={() => router.back()} style={styles.back}><ArrowLeft color={theme.text} size={23} /></Pressable>} title={project.data?.name || 'Project'} subtitle={project.data?.status} action={<Pressable accessibilityLabel="Create project task" onPress={() => router.push(`/create?type=task&projectId=${projectId}` as never)} style={[styles.add, { backgroundColor: theme.primary }]}><Plus color="#ffffff" size={21} /></Pressable>} />}>
      {project.isLoading ? <LoadingState label="Loading project" /> : null}
      {project.isError ? <ErrorState message={apiErrorMessage(project.error)} onRetry={() => refresh()} /> : null}
      {project.data ? (
        <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} />}>
          {project.data.description ? <Text style={[styles.description, { color: theme.textMuted }]}>{project.data.description}</Text> : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tools}>
            <ProjectTool icon={Users} label="Members" onPress={() => router.push(`/projects/${projectId}/members` as never)} />
            <ProjectTool icon={ListTree} label="Sprints" onPress={() => router.push(`/projects/${projectId}/sprints` as never)} />
            <ProjectTool icon={Bug} label="Issues" onPress={() => router.push(`/projects/${projectId}/issues` as never)} />
            <ProjectTool icon={TimerReset} label="Logs" onPress={() => router.push(`/projects/${projectId}/logs` as never)} />
            <ProjectTool icon={Server} label="Environments" onPress={() => router.push(`/projects/${projectId}/environments` as never)} />
            <ProjectTool icon={FolderLock} label="Vault" onPress={() => router.push(`/projects/${projectId}/vault` as never)} />
          </ScrollView>
          <Text style={[styles.heading, { color: theme.text }]}>Sprints</Text>
          <View style={styles.sprints}>
            {sprints.data?.length ? sprints.data.map((sprint) => (
              <View key={sprint.id} style={[styles.sprint, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={styles.sprintRow}><Text style={[styles.sprintName, { color: theme.text }]}>{sprint.name}</Text><Text style={[styles.sprintStatus, { color: theme.primary }]}>{sprint.status}</Text></View>
                <Text style={[styles.sprintMeta, { color: theme.textMuted }]}>{sprint.start_date} to {sprint.end_date} · {sprint.task_count} tasks</Text>
              </View>
            )) : <Text style={[styles.muted, { color: theme.textMuted }]}>No sprints yet.</Text>}
          </View>

          <Text style={[styles.heading, { color: theme.text }]}>Tasks</Text>
          <View style={styles.tasks}>
            {taskData.length ? taskData.map((task) => (
              <View key={task.id} style={task.id === selectedTaskId ? [styles.selected, { borderColor: theme.primary }] : undefined}>
                <TaskCard onStatusChange={(status) => changeStatus(task.id, status)} task={task} updating={taskStatus.isPending && taskStatus.variables?.id === task.id} />
              </View>
            )) : <EmptyState title="No tasks" message="This project's tasks will appear here." />}
          </View>
        </ScrollView>
      ) : null}
    </Screen>
  );
}

function ProjectTool({ icon: Icon, label, onPress }: { icon: typeof Users; label: string; onPress: () => void }) {
  const theme = useAppTheme();
  return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.tool, { backgroundColor: theme.surface, borderColor: theme.border }]}><Icon color={theme.primary} size={19} /><Text style={[styles.toolLabel, { color: theme.text }]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  back: { alignItems: 'center', height: 42, justifyContent: 'center', width: 42 },
  add: { alignItems: 'center', borderRadius: 8, height: 42, justifyContent: 'center', width: 42 },
  scroll: { padding: 20, paddingBottom: 40 },
  description: { fontSize: 14, lineHeight: 21 },
  tools: { gap: 8, paddingRight: 16, paddingTop: 18 },
  tool: { alignItems: 'center', borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 7, minHeight: 44, paddingHorizontal: 11 },
  toolLabel: { fontSize: 12, fontWeight: '700' },
  heading: { fontSize: 17, fontWeight: '700', marginBottom: 11, marginTop: 24 },
  sprints: { gap: 8 },
  sprint: { borderRadius: 7, borderWidth: 1, padding: 13 },
  sprintRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sprintName: { fontSize: 15, fontWeight: '700' },
  sprintStatus: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  sprintMeta: { fontSize: 12, marginTop: 6 },
  muted: { fontSize: 13 },
  tasks: { gap: 10, minHeight: 140 },
  selected: { borderRadius: 9, borderWidth: 2, padding: 2 },
});
