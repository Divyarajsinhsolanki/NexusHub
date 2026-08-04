import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BarChart3, Bug, Columns3, FolderLock, ListTree, Plus, Server, Settings2, TimerReset, Users } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';

import { apiErrorMessage } from '@/src/api/client';
import { endpoints } from '@/src/api/endpoints';
import type { Task, TaskStatus } from '@/src/api/types';
import { PageHeader } from '@/src/components/PageHeader';
import { Screen } from '@/src/components/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/src/components/StateView';
import { TaskCard } from '@/src/components/TaskCard';
import { TouchableScale } from '@/src/components/TouchableScale';
import { useTaskStatus } from '@/src/hooks/useTaskStatus';
import { useAppTheme } from '@/src/theme';
import { useAuth } from '@/src/auth/AuthProvider';
import { TaskEditor } from '@/src/components/TaskEditor';

export default function ProjectDetailScreen() {
  const params = useLocalSearchParams<{ id: string; taskId?: string }>();
  const projectId = Number(params.id);
  const selectedTaskId = Number(params.taskId || 0);
  const router = useRouter();
  const theme = useAppTheme();
  const { user } = useAuth();
  const [editingTask, setEditingTask] = useState<Task | null>(null);
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
      header={<PageHeader leading={<TouchableScale accessibilityLabel="Back to projects" accessibilityRole="button" hitSlop={10} onPress={() => router.back()} style={styles.back}><ArrowLeft color={theme.text} size={23} /></TouchableScale>} title={project.data?.name || 'Project'} subtitle={project.data?.status} action={!user?.demo_account ? <TouchableScale accessibilityLabel="Create project task" accessibilityRole="button" haptic="light" onPress={() => router.push(`/create?type=task&projectId=${projectId}` as never)} style={[styles.add, { backgroundColor: theme.primary, shadowColor: theme.shadow }]}><Plus color="#ffffff" size={21} /></TouchableScale> : undefined} />}>
      {project.isLoading ? <LoadingState label="Loading project" /> : null}
      {project.isError ? <ErrorState message={apiErrorMessage(project.error)} onRetry={() => refresh()} /> : null}
      {project.data ? (
        <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} />}>
          {project.data.description ? <Text style={[styles.description, { color: theme.textMuted }]}>{project.data.description}</Text> : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tools}>
            <ProjectTool icon={Columns3} label="Board" onPress={() => router.push(`/projects/${projectId}/board` as never)} />
            <ProjectTool icon={Users} label="Members" onPress={() => router.push(`/projects/${projectId}/members` as never)} />
            <ProjectTool icon={ListTree} label="Sprints" onPress={() => router.push(`/projects/${projectId}/sprints` as never)} />
            <ProjectTool icon={BarChart3} label="Statistics" onPress={() => router.push(`/projects/${projectId}/statistics` as never)} />
            <ProjectTool icon={Bug} label="Issues" onPress={() => router.push(`/projects/${projectId}/issues` as never)} />
            <ProjectTool icon={TimerReset} label="Logs" onPress={() => router.push(`/projects/${projectId}/logs` as never)} />
            <ProjectTool icon={Server} label="Environments" onPress={() => router.push(`/projects/${projectId}/environments` as never)} />
            <ProjectTool icon={FolderLock} label="Vault" onPress={() => router.push(`/projects/${projectId}/vault` as never)} />
            <ProjectTool icon={Settings2} label="Settings" onPress={() => router.push(`/projects/${projectId}/settings` as never)} />
          </ScrollView>
          <Text style={[styles.heading, { color: theme.text }]}>Sprints</Text>
          <View style={styles.sprints}>
            {sprints.data?.length ? sprints.data.map((sprint) => (
              <View key={sprint.id} style={[styles.sprint, { backgroundColor: theme.surfaceRaised, borderColor: theme.border, shadowColor: theme.shadow }]}>
                <View style={styles.sprintRow}><Text style={[styles.sprintName, { color: theme.text }]}>{sprint.name}</Text><Text style={[styles.sprintStatus, { color: theme.primary }]}>{sprint.status}</Text></View>
                <Text style={[styles.sprintMeta, { color: theme.textMuted }]}>{sprint.start_date} to {sprint.end_date} · {sprint.task_count} tasks</Text>
              </View>
            )) : <Text style={[styles.muted, { color: theme.textMuted }]}>No sprints yet.</Text>}
          </View>

          <Text style={[styles.heading, { color: theme.text }]}>Tasks</Text>
          <View style={styles.tasks}>
            {taskData.length ? taskData.map((task) => (
              <View key={task.id} style={task.id === selectedTaskId ? [styles.selected, { borderColor: theme.primary }] : undefined}>
                <TaskCard onEdit={!user?.demo_account ? () => setEditingTask(task) : undefined} onStatusChange={(status) => changeStatus(task.id, status)} readOnly={Boolean(user?.demo_account)} task={task} updating={taskStatus.isPending && taskStatus.variables?.id === task.id} />
              </View>
            )) : <EmptyState title="No tasks" message="This project's tasks will appear here." />}
          </View>
          <TaskEditor members={project.data.users || []} onClose={() => setEditingTask(null)} onSaved={async () => { setEditingTask(null); await tasks.refetch(); }} projectId={projectId} sprints={sprints.data || []} task={editingTask} />
        </ScrollView>
      ) : null}
    </Screen>
  );
}

function ProjectTool({ icon: Icon, label, onPress }: { icon: typeof Users; label: string; onPress: () => void }) {
  const theme = useAppTheme();
  return <TouchableScale accessibilityRole="button" onPress={onPress} scaleTo={0.985} style={[styles.tool, { backgroundColor: theme.surfaceRaised, borderColor: theme.border, shadowColor: theme.shadow }]}><Icon color={theme.primary} size={19} /><Text style={[styles.toolLabel, { color: theme.text }]}>{label}</Text></TouchableScale>;
}

const styles = StyleSheet.create({
  back: { alignItems: 'center', height: 42, justifyContent: 'center', width: 42 },
  add: { alignItems: 'center', borderRadius: 8, elevation: 1, height: 42, justifyContent: 'center', shadowOffset: { height: 2, width: 0 }, shadowOpacity: 0.1, shadowRadius: 5, width: 42 },
  scroll: { padding: 20, paddingBottom: 40 },
  description: { fontSize: 14, lineHeight: 21 },
  tools: { gap: 8, paddingRight: 16, paddingTop: 18 },
  tool: { alignItems: 'center', borderRadius: 8, borderWidth: 1, elevation: 1, flexDirection: 'row', gap: 7, minHeight: 44, paddingHorizontal: 11, shadowOffset: { height: 3, width: 0 }, shadowOpacity: 0.07, shadowRadius: 8 },
  toolLabel: { fontSize: 12, fontWeight: '800' },
  heading: { fontSize: 17, fontWeight: '800', marginBottom: 11, marginTop: 24 },
  sprints: { gap: 8 },
  sprint: { borderRadius: 8, borderWidth: 1, elevation: 1, padding: 13, shadowOffset: { height: 3, width: 0 }, shadowOpacity: 0.07, shadowRadius: 8 },
  sprintRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sprintName: { fontSize: 15, fontWeight: '700' },
  sprintStatus: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  sprintMeta: { fontSize: 12, marginTop: 6 },
  muted: { fontSize: 13 },
  tasks: { gap: 10, minHeight: 140 },
  selected: { borderRadius: 9, borderWidth: 2, padding: 2 },
});
