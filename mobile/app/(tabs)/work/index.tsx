import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { apiErrorMessage } from '@/src/api/client';
import { endpoints } from '@/src/api/endpoints';
import type { TaskStatus, WorkLog, WorkLogInput } from '@/src/api/types';
import { PageHeader } from '@/src/components/PageHeader';
import { Screen } from '@/src/components/Screen';
import { SegmentedControl } from '@/src/components/SegmentedControl';
import { EmptyState, ErrorState, LoadingState } from '@/src/components/StateView';
import { TaskCard } from '@/src/components/TaskCard';
import { WorkLogCard } from '@/src/components/WorkLogCard';
import { WorkLogForm } from '@/src/components/WorkLogForm';
import { useTaskStatus } from '@/src/hooks/useTaskStatus';
import { useAppTheme } from '@/src/theme';
import { useAuth } from '@/src/auth/AuthProvider';

type Mode = 'tasks' | 'logs';

export default function WorkScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const writable = !user?.demo_account;
  const [mode, setMode] = useState<Mode>('tasks');
  const [editing, setEditing] = useState<WorkLog | null | undefined>(undefined);
  const taskStatus = useTaskStatus();
  const tasks = useInfiniteQuery({
    queryKey: ['tasks', 'mine'],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => endpoints.tasks({ mine: true, page: pageParam, per_page: 30 }),
    getNextPageParam: (page) => page.meta?.next_page ?? undefined,
  });
  const workLogs = useInfiniteQuery({
    queryKey: ['work-logs'],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => endpoints.workLogs(pageParam),
    getNextPageParam: (page) => page.meta?.next_page ?? undefined,
  });
  const options = useQuery({ queryKey: ['work-options'], queryFn: endpoints.workOptions, enabled: editing !== undefined });
  const taskData = useMemo(() => tasks.data?.pages.flatMap((page) => page.data) || [], [tasks.data]);
  const logData = useMemo(() => workLogs.data?.pages.flatMap((page) => page.data) || [], [workLogs.data]);

  const saveLog = useMutation({
    mutationFn: ({ input, id }: { input: WorkLogInput; id?: number }) => (id ? endpoints.updateWorkLog(id, input) : endpoints.createWorkLog(input)),
    onSuccess: async () => {
      setEditing(undefined);
      await queryClient.invalidateQueries({ queryKey: ['work-logs'] });
      await queryClient.invalidateQueries({ queryKey: ['home'] });
    },
  });
  const deleteLog = useMutation({
    mutationFn: (id: number) => endpoints.deleteWorkLog(id),
    onSuccess: async () => {
      setEditing(undefined);
      await queryClient.invalidateQueries({ queryKey: ['work-logs'] });
      await queryClient.invalidateQueries({ queryKey: ['home'] });
    },
  });

  const save = async (input: WorkLogInput) => {
    try {
      await saveLog.mutateAsync({ input, id: editing?.id });
    } catch (error) {
      Alert.alert('Unable to save work log', apiErrorMessage(error));
    }
  };
  const confirmDelete = () => {
    if (!editing) return;
    Alert.alert('Delete work log?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteLog.mutate(editing.id) },
    ]);
  };
  const changeStatus = (id: number, status: TaskStatus) => taskStatus.mutate({ id, status });
  const activeQuery = mode === 'tasks' ? tasks : workLogs;

  return (
    <Screen
      header={
        <PageHeader
          action={writable ? (
            <Pressable accessibilityLabel={mode === 'logs' ? 'Add work log' : 'Add task'} accessibilityRole="button" onPress={() => mode === 'logs' ? setEditing(null) : router.push('/create?type=task' as never)} style={[styles.addButton, { backgroundColor: theme.primary }]} testID={mode === 'logs' ? 'add-work-log' : 'add-task'}>
              <Plus color="#ffffff" size={22} />
            </Pressable>
          ) : undefined}
          subtitle="Tasks and time entries"
          title="My work"
        />
      }>
      <View style={styles.segmentWrap}>
        <SegmentedControl<Mode> options={[{ value: 'tasks', label: 'Tasks' }, { value: 'logs', label: 'Work logs' }]} value={mode} onChange={setMode} />
      </View>
      {activeQuery.isLoading ? <LoadingState /> : null}
      {activeQuery.isError ? <ErrorState message={apiErrorMessage(activeQuery.error)} onRetry={() => activeQuery.refetch()} /> : null}
      {mode === 'tasks' && !tasks.isLoading ? (
        <FlatList
          contentContainerStyle={styles.list}
          data={taskData}
          keyExtractor={(item) => String(item.id)}
          onEndReached={() => tasks.hasNextPage && tasks.fetchNextPage()}
          onEndReachedThreshold={0.4}
          onRefresh={() => tasks.refetch()}
          refreshing={tasks.isRefetching && !tasks.isFetchingNextPage}
          renderItem={({ item }) => (
            <TaskCard
              onStatusChange={(status) => changeStatus(item.id, status)}
              readOnly={!writable}
              task={item}
              updating={taskStatus.isPending && taskStatus.variables?.id === item.id}
            />
          )}
          ListEmptyComponent={<EmptyState title="No assigned tasks" message="Tasks assigned to you will appear here." />}
        />
      ) : null}
      {mode === 'logs' && !workLogs.isLoading ? (
        <FlatList
          contentContainerStyle={styles.list}
          data={logData}
          keyExtractor={(item) => String(item.id)}
          onEndReached={() => workLogs.hasNextPage && workLogs.fetchNextPage()}
          onEndReachedThreshold={0.4}
          onRefresh={() => workLogs.refetch()}
          refreshing={workLogs.isRefetching && !workLogs.isFetchingNextPage}
          renderItem={({ item }) => <WorkLogCard onEdit={writable ? () => setEditing(item) : undefined} workLog={item} />}
          ListEmptyComponent={<EmptyState title="No work logs" message="Add your first time entry for today." />}
        />
      ) : null}
      <WorkLogForm
        onClose={() => setEditing(undefined)}
        onDelete={editing ? confirmDelete : undefined}
        onSave={save}
        options={options.data}
        saving={saveLog.isPending || deleteLog.isPending}
        visible={editing !== undefined}
        workLog={editing}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  addButton: { alignItems: 'center', borderRadius: 6, height: 40, justifyContent: 'center', width: 40 },
  segmentWrap: { paddingHorizontal: 20, paddingTop: 14 },
  list: { flexGrow: 1, gap: 10, padding: 20, paddingBottom: 36 },
});
