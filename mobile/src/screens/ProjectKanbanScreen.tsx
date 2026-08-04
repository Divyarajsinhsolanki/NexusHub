import { Picker } from '@react-native-picker/picker';
import { InfiniteData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, format, parseISO } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { ArrowLeft, CalendarDays, Check, ChevronLeft, ChevronRight, Columns3, Plus, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { apiErrorMessage } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { ApiEnvelope, Sprint, Task, TaskStatus } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { PageHeader } from '../components/PageHeader';
import { Screen } from '../components/Screen';
import { SegmentedControl } from '../components/SegmentedControl';
import { EmptyState, ErrorState, LoadingState } from '../components/StateView';
import { TaskCard } from '../components/TaskCard';
import { TaskEditor } from '../components/TaskEditor';
import { TouchableScale } from '../components/TouchableScale';
import { useAppTheme } from '../theme';
import { BoardMode, BoardScope, completionSummary, defaultSprintWeek, dropStatusAt, dueDays, initialSprint, KANBAN_STATUSES, modeTaskType, sprintWeekStarts, weekDateRange } from './projectKanban';

type TaskPages = InfiniteData<ApiEnvelope<Task[]>, number>;

export function ProjectKanbanScreen({ projectId }: { projectId: number }) {
  const router = useRouter();
  const theme = useAppTheme();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { height, width } = useWindowDimensions();
  const tablet = width >= 840;
  const writable = !user?.demo_account;
  const [selectedSprintId, setSelectedSprintId] = useState<number>();
  const [mode, setMode] = useState<BoardMode>('combined');
  const [scope, setScope] = useState<BoardScope>('all');
  const [activeStatus, setActiveStatus] = useState<TaskStatus>('todo');
  const [editing, setEditing] = useState<{ task?: Task; defaults?: Partial<Task>; lockType?: boolean }>();
  const [inspectingTask, setInspectingTask] = useState<Task>();
  const [movingTask, setMovingTask] = useState<Task>();
  const [dragging, setDragging] = useState(false);

  const project = useQuery({ queryKey: ['project', projectId], queryFn: () => endpoints.project(projectId), enabled: Number.isFinite(projectId) });
  const sprints = useQuery({ queryKey: ['project-sprints', projectId], queryFn: () => endpoints.sprints(projectId), enabled: Number.isFinite(projectId) });

  useEffect(() => {
    const rows = sprints.data || [];
    if (!rows.length) return setSelectedSprintId(undefined);
    if (!selectedSprintId || !rows.some((sprint) => sprint.id === selectedSprintId)) setSelectedSprintId(initialSprint(rows)?.id);
  }, [selectedSprintId, sprints.data]);

  useEffect(() => {
    if (project.data && !project.data.qa_mode_enabled) setMode('dev');
  }, [project.data]);

  const todo = useLaneQuery(projectId, selectedSprintId, 'todo', mode, scope);
  const inprogress = useLaneQuery(projectId, selectedSprintId, 'inprogress', mode, scope);
  const completed = useLaneQuery(projectId, selectedSprintId, 'completed', mode, scope);
  const lanes = { todo, inprogress, completed };
  const activeLane = lanes[activeStatus];
  const counts = completionSummary({
    todo: Number(todo.data?.pages[0]?.meta?.total_count || 0),
    inprogress: Number(inprogress.data?.pages[0]?.meta?.total_count || 0),
    completed: Number(completed.data?.pages[0]?.meta?.total_count || 0),
  });
  const sprint = sprints.data?.find((item) => item.id === selectedSprintId);
  const boardPrefix = ['project-kanban', projectId, selectedSprintId, mode, scope] as const;
  const duePrefix = ['project-kanban-due', projectId, selectedSprintId, mode, scope] as const;

  const move = useMutation({
    mutationFn: ({ task, status }: { task: Task; status: TaskStatus }) => endpoints.updateTask(task.id, status),
    onMutate: async ({ task, status }) => {
      await Promise.all([queryClient.cancelQueries({ queryKey: boardPrefix }), queryClient.cancelQueries({ queryKey: duePrefix })]);
      const laneSnapshots = queryClient.getQueriesData<TaskPages>({ queryKey: boardPrefix });
      const dueSnapshots = queryClient.getQueriesData<TaskPages>({ queryKey: duePrefix });
      laneSnapshots.forEach(([key, data]) => {
        const laneStatus = key[5] as TaskStatus;
        queryClient.setQueryData(key, moveTaskInLane(data, task, status, laneStatus));
      });
      dueSnapshots.forEach(([key, data]) => queryClient.setQueryData(key, updateTaskInPages(data, task.id, { status })));
      return { dueSnapshots, laneSnapshots };
    },
    onError: (error, _variables, context) => {
      context?.laneSnapshots.forEach(([key, data]) => queryClient.setQueryData(key, data));
      context?.dueSnapshots.forEach(([key, data]) => queryClient.setQueryData(key, data));
      Alert.alert('Unable to move task', apiErrorMessage(error));
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: boardPrefix }),
        queryClient.invalidateQueries({ queryKey: duePrefix }),
        queryClient.invalidateQueries({ queryKey: ['project-tasks', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['home'] }),
      ]);
    },
  });

  const refreshBoard = async () => {
    await Promise.all([
      project.refetch(),
      sprints.refetch(),
      queryClient.invalidateQueries({ queryKey: ['project-kanban', projectId] }),
      queryClient.invalidateQueries({ queryKey: ['project-kanban-due', projectId] }),
    ]);
  };
  const moveTask = (task: Task, status: TaskStatus) => {
    setMovingTask(undefined);
    if (task.status !== status && writable && !move.isPending) move.mutate({ task, status });
  };
  const openCreate = () => {
    if (!user || !selectedSprintId) return;
    const type = mode === 'qa' ? 'qa' : 'Code';
    setEditing({
      defaults: {
        project_id: projectId,
        sprint_id: selectedSprintId,
        status: tablet ? 'todo' : activeStatus,
        type,
        assigned_to_user: user.id,
        developer_id: type === 'Code' ? user.id : null,
        qa_assigned: type === 'qa' ? user.full_name : null,
      },
      lockType: mode !== 'combined',
    });
  };
  const editorSaved = async () => {
    setEditing(undefined);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['project-kanban', projectId] }),
      queryClient.invalidateQueries({ queryKey: ['project-kanban-due', projectId] }),
      queryClient.invalidateQueries({ queryKey: ['project-tasks', projectId] }),
      queryClient.invalidateQueries({ queryKey: ['tasks'] }),
      queryClient.invalidateQueries({ queryKey: ['home'] }),
    ]);
  };

  const dashboard = sprint ? (
    <View style={styles.dashboard}>
      <View style={[styles.filters, { backgroundColor: theme.surfaceRaised, borderColor: theme.border, shadowColor: theme.shadow }]}>
        <View style={styles.filterBlock}>
          <Text style={[styles.filterLabel, { color: theme.textMuted }]}>SPRINT</Text>
          <View style={[styles.picker, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Picker accessibilityLabel="Sprint" selectedValue={selectedSprintId} onValueChange={(value) => setSelectedSprintId(Number(value))} style={{ color: theme.text }}>
              {(sprints.data || []).map((item) => <Picker.Item key={item.id} label={item.name} value={item.id} />)}
            </Picker>
          </View>
        </View>
        {project.data?.qa_mode_enabled ? <SegmentedControl<BoardMode> options={[{ value: 'dev', label: 'Dev' }, { value: 'qa', label: 'QA' }, { value: 'combined', label: 'Combined' }]} value={mode} onChange={setMode} /> : null}
        <SegmentedControl<BoardScope> options={[{ value: 'all', label: 'All tasks' }, { value: 'mine', label: 'My tasks' }]} value={scope} onChange={setScope} />
      </View>
      <View style={[styles.analytics, tablet && styles.analyticsTablet]}>
        <DueHeatmap mode={mode} onOpenTask={(task) => writable ? setEditing({ task }) : setInspectingTask(task)} projectId={projectId} scope={scope} sprint={sprint} />
        <ProgressDonut counts={counts} />
      </View>
      {!tablet ? <View style={styles.statusTabs}><SegmentedControl<TaskStatus> options={KANBAN_STATUSES.map((status) => ({ value: status.value, label: `${status.label} ${counts[status.value]}` }))} value={activeStatus} onChange={setActiveStatus} /></View> : null}
    </View>
  ) : null;

  const renderCard = (task: Task) => (
    <DraggableTaskCard
      height={height}
      key={task.id}
      onDragChange={setDragging}
      onEdit={writable ? () => setEditing({ task }) : undefined}
      onInspect={!writable ? () => setInspectingTask(task) : undefined}
      onMore={writable ? () => setMovingTask(task) : undefined}
      onMove={moveTask}
      readOnly={!writable}
      task={task}
      updating={move.isPending && move.variables?.task.id === task.id}
      width={width}
    />
  );

  return (
    <Screen header={<PageHeader leading={<TouchableScale accessibilityLabel="Back" accessibilityRole="button" onPress={() => router.back()} style={styles.iconButton}><ArrowLeft color={theme.text} size={22} /></TouchableScale>} title="Task board" subtitle={project.data?.name || 'Project sprint delivery'} action={writable && sprint ? <TouchableScale accessibilityLabel="Create board task" accessibilityRole="button" haptic="light" onPress={openCreate} style={[styles.add, { backgroundColor: theme.primary, shadowColor: theme.shadow }]}><Plus color="#ffffff" size={21} /></TouchableScale> : undefined} />}>
      {project.isLoading || sprints.isLoading ? <LoadingState label="Loading task board" /> : null}
      {project.isError ? <ErrorState message={apiErrorMessage(project.error)} onRetry={() => project.refetch()} /> : null}
      {sprints.isError ? <ErrorState message={apiErrorMessage(sprints.error)} onRetry={() => sprints.refetch()} /> : null}
      {!project.isLoading && !sprints.isLoading && !sprints.data?.length ? <EmptyState title="No sprints yet" message="Create a sprint before organizing project work on the board." /> : null}
      {sprint && !tablet ? (
        <FlatList
          contentContainerStyle={styles.phoneList}
          data={laneTasks(activeLane)}
          initialNumToRender={8}
          keyExtractor={(item) => String(item.id)}
          ListEmptyComponent={activeLane.isLoading ? <LoadingState label={`Loading ${statusLabel(activeStatus)} tasks`} /> : activeLane.isError ? <ErrorState message={apiErrorMessage(activeLane.error)} onRetry={() => activeLane.refetch()} /> : <EmptyState title={`No ${statusLabel(activeStatus)} tasks`} message="Move work here or create a task for this sprint." />}
          ListFooterComponent={activeLane.isFetchingNextPage ? <LoadingState label="Loading more tasks" /> : null}
          ListHeaderComponent={dashboard}
          maxToRenderPerBatch={10}
          onEndReached={() => activeLane.hasNextPage && activeLane.fetchNextPage()}
          onEndReachedThreshold={0.45}
          onRefresh={refreshBoard}
          refreshing={project.isRefetching || sprints.isRefetching || activeLane.isRefetching}
          removeClippedSubviews={false}
          renderItem={({ item }) => renderCard(item)}
          testID="kanban-active-lane"
          windowSize={7}
        />
      ) : null}
      {sprint && tablet ? (
        <ScrollView contentContainerStyle={styles.tabletScroll} refreshControl={<RefreshControl refreshing={project.isRefetching || sprints.isRefetching} onRefresh={refreshBoard} tintColor={theme.primary} />}>
          {dashboard}
          <View style={styles.lanes}>
            {KANBAN_STATUSES.map((status) => {
              const lane = lanes[status.value];
              return <View key={status.value} style={[styles.lane, { backgroundColor: theme.surface, borderColor: theme.border }]}><View style={[styles.laneAccent, { backgroundColor: statusColor(status.value, theme) }]} /><View style={styles.laneHeader}><Text style={[styles.laneTitle, { color: theme.text }]}>{status.label}</Text><Text style={[styles.laneCount, { backgroundColor: theme.surfaceMuted, color: theme.textMuted }]}>{counts[status.value]}</Text></View>{lane.isLoading ? <LoadingState /> : null}{lane.isError ? <ErrorState message={apiErrorMessage(lane.error)} onRetry={() => lane.refetch()} /> : null}{!lane.isLoading && !laneTasks(lane).length ? <Text style={[styles.laneEmpty, { color: theme.textMuted }]}>No tasks here.</Text> : null}{laneTasks(lane).map(renderCard)}{lane.hasNextPage ? <TouchableScale accessibilityRole="button" onPress={() => lane.fetchNextPage()} style={[styles.loadMore, { borderColor: theme.border }]}><Text style={[styles.loadMoreText, { color: theme.primary }]}>{lane.isFetchingNextPage ? 'Loading...' : 'Load more'}</Text></TouchableScale> : null}</View>;
            })}
          </View>
        </ScrollView>
      ) : null}
      <DropTargets visible={dragging} />
      <MoveTaskSheet onClose={() => setMovingTask(undefined)} onMove={(status) => movingTask && moveTask(movingTask, status)} task={movingTask} />
      <TaskDetailsSheet onClose={() => setInspectingTask(undefined)} task={inspectingTask} />
      {project.data ? <TaskEditor defaults={editing?.defaults} lockType={editing?.lockType} members={project.data.users || []} onClose={() => setEditing(undefined)} onSaved={editorSaved} projectId={projectId} sprints={sprints.data || []} task={editing?.task} visible={Boolean(editing)} /> : null}
    </Screen>
  );
}

function useLaneQuery(projectId: number, sprintId: number | undefined, status: TaskStatus, mode: BoardMode, scope: BoardScope) {
  return useInfiniteQuery({
    queryKey: ['project-kanban', projectId, sprintId, mode, scope, status],
    enabled: Boolean(sprintId),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => endpoints.tasks({ project_id: projectId, sprint_id: sprintId, status, type: modeTaskType(mode), mine: scope === 'mine', page: pageParam, per_page: 30 }),
    getNextPageParam: (page) => page.meta?.next_page ?? undefined,
  });
}

function DueHeatmap({ mode, onOpenTask, projectId, scope, sprint }: { mode: BoardMode; onOpenTask?: (task: Task) => void; projectId: number; scope: BoardScope; sprint: Sprint }) {
  const theme = useAppTheme();
  const starts = useMemo(() => sprintWeekStarts(sprint), [sprint]);
  const [weekIndex, setWeekIndex] = useState(() => defaultSprintWeek(starts));
  const weekStart = starts[weekIndex] || parseISO(sprint.start_date);
  const range = weekDateRange(weekStart);
  const today = format(new Date(), 'yyyy-MM-dd');
  const [selectedDate, setSelectedDate] = useState(today >= range.due_from && today <= range.due_to ? today : range.due_from);
  const due = useInfiniteQuery({
    queryKey: ['project-kanban-due', projectId, sprint.id, mode, scope, range.due_from, range.due_to],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => endpoints.tasks({ project_id: projectId, sprint_id: sprint.id, type: modeTaskType(mode), mine: scope === 'mine', due_from: range.due_from, due_to: range.due_to, page: pageParam, per_page: 100 }),
    getNextPageParam: (page) => page.meta?.next_page ?? undefined,
  });
  const tasks = due.data?.pages.flatMap((page) => page.data) || [];
  const days = dueDays(tasks, weekStart);
  const selectedTasks = days.find((day) => day.date === selectedDate)?.tasks || [];

  useEffect(() => {
    const nextStarts = sprintWeekStarts(sprint);
    const nextIndex = defaultSprintWeek(nextStarts);
    const nextStart = nextStarts[nextIndex] || parseISO(sprint.start_date);
    const nextRange = weekDateRange(nextStart);
    setWeekIndex(nextIndex);
    setSelectedDate(today >= nextRange.due_from && today <= nextRange.due_to ? today : nextRange.due_from);
  }, [sprint.id]);
  useEffect(() => {
    if (due.hasNextPage && !due.isFetchingNextPage) void due.fetchNextPage();
  }, [due.data?.pages.length, due.hasNextPage, due.isFetchingNextPage]);
  const changeWeek = (next: number) => {
    const bounded = Math.max(0, Math.min(starts.length - 1, next));
    setWeekIndex(bounded);
    setSelectedDate(weekDateRange(starts[bounded]).due_from);
  };

  return <View style={[styles.analyticsCard, { backgroundColor: theme.surfaceRaised, borderColor: theme.border, shadowColor: theme.shadow }]}><View style={styles.analyticsHeader}><View style={[styles.analyticsIcon, { backgroundColor: theme.primarySoft }]}><CalendarDays color={theme.primary} size={19} /></View><View style={styles.flex}><Text style={[styles.analyticsTitle, { color: theme.text }]}>Due date heatmap</Text><Text style={[styles.analyticsMeta, { color: theme.textMuted }]}>{format(weekStart, 'MMM d')} to {format(addDays(weekStart, 6), 'MMM d')}</Text></View>{starts.length > 1 ? <View style={styles.weekActions}><TouchableScale accessibilityLabel="Previous sprint week" disabled={weekIndex === 0} onPress={() => changeWeek(weekIndex - 1)} style={styles.smallButton}><ChevronLeft color={theme.text} size={19} /></TouchableScale><TouchableScale accessibilityLabel="Next sprint week" disabled={weekIndex === starts.length - 1} onPress={() => changeWeek(weekIndex + 1)} style={styles.smallButton}><ChevronRight color={theme.text} size={19} /></TouchableScale></View> : null}</View>{due.isError ? <ErrorState message={apiErrorMessage(due.error)} onRetry={() => due.refetch()} /> : <View style={styles.heatmap}>{days.map((day) => { const selected = day.date === selectedDate; const color = heatColor(day.count, theme); return <TouchableScale accessibilityLabel={`${format(parseISO(day.date), 'EEEE MMMM d')}, ${day.count} tasks due`} accessibilityRole="button" key={day.date} onPress={() => setSelectedDate(day.date)} scaleTo={0.96} style={[styles.day, { backgroundColor: color.background, borderColor: selected ? theme.primary : 'transparent' }]}><Text style={[styles.dayName, { color: color.text }]}>{format(parseISO(day.date), 'EEE').slice(0, 2)}</Text><Text style={[styles.dayCount, { color: color.text }]}>{due.isLoading ? '·' : day.count}</Text></TouchableScale>; })}</View>}<View style={[styles.dueList, { borderTopColor: theme.border }]}><Text style={[styles.dueTitle, { color: theme.text }]}>{selectedDate === today ? 'Due today' : `Due ${format(parseISO(selectedDate), 'MMM d')}`}</Text>{selectedTasks.length ? selectedTasks.slice(0, 5).map((task) => <TouchableScale accessibilityRole={onOpenTask ? 'button' : undefined} key={task.id} onPress={() => onOpenTask?.(task)} style={styles.dueTask}><View style={[styles.dueDot, { backgroundColor: statusColor(task.status, theme) }]} /><Text numberOfLines={1} style={[styles.dueTaskText, { color: theme.text }]}>{task.task_id ? `${task.task_id} · ` : ''}{task.title}</Text></TouchableScale>) : <Text style={[styles.noDue, { color: theme.textMuted }]}>No tasks due on this day.</Text>}</View></View>;
}

function ProgressDonut({ counts }: { counts: ReturnType<typeof completionSummary> }) {
  const theme = useAppTheme();
  const size = 154;
  const radius = 55;
  const stroke = 15;
  const circumference = Math.PI * 2 * radius;
  const segments = [
    { key: 'todo', value: counts.todo, color: theme.textMuted },
    { key: 'inprogress', value: counts.inprogress, color: theme.warning },
    { key: 'completed', value: counts.completed, color: theme.success },
  ];
  let offset = 0;
  return <View style={[styles.analyticsCard, styles.progressCard, { backgroundColor: theme.surfaceRaised, borderColor: theme.border, shadowColor: theme.shadow }]}><View style={styles.analyticsHeader}><View style={[styles.analyticsIcon, { backgroundColor: theme.primarySoft }]}><Columns3 color={theme.primary} size={19} /></View><View><Text style={[styles.analyticsTitle, { color: theme.text }]}>Progress overview</Text><Text style={[styles.analyticsMeta, { color: theme.textMuted }]}>{counts.percentage}% complete</Text></View></View><View style={styles.donutWrap}><Svg height={size} width={size}><Circle cx={size / 2} cy={size / 2} fill="none" r={radius} stroke={theme.surfaceMuted} strokeWidth={stroke} />{counts.total ? segments.map((segment) => { const length = (segment.value / counts.total) * circumference; const currentOffset = offset; offset += length; return <Circle key={segment.key} cx={size / 2} cy={size / 2} fill="none" r={radius} rotation="-90" origin={`${size / 2}, ${size / 2}`} stroke={segment.color} strokeDasharray={`${Math.max(0, length - 3)} ${circumference}`} strokeDashoffset={-currentOffset} strokeLinecap="round" strokeWidth={stroke} />; }) : null}</Svg><View pointerEvents="none" style={styles.donutCenter}><Text style={[styles.donutTotal, { color: theme.text }]}>{counts.total}</Text><Text style={[styles.donutLabel, { color: theme.textMuted }]}>tasks</Text></View></View><View style={styles.legend}>{segments.map((segment) => <View key={segment.key} style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: segment.color }]} /><Text style={[styles.legendLabel, { color: theme.textMuted }]}>{statusLabel(segment.key as TaskStatus)}</Text><Text style={[styles.legendValue, { color: theme.text }]}>{segment.value}</Text></View>)}</View></View>;
}

function DraggableTaskCard({ height, onDragChange, onEdit, onInspect, onMore, onMove, readOnly, task, updating, width }: { height: number; onDragChange: (active: boolean) => void; onEdit?: () => void; onInspect?: () => void; onMore?: () => void; onMove: (task: Task, status: TaskStatus) => void; readOnly: boolean; task: Task; updating: boolean; width: number }) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const active = useSharedValue(0);
  const drop = (absoluteX: number, absoluteY: number) => {
    const target = dropStatusAt(absoluteX, absoluteY, width, height);
    if (target && target !== task.status) onMove(task, target);
  };
  const start = () => {
    onDragChange(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  };
  const finish = () => onDragChange(false);
  const gesture = Gesture.Pan().enabled(!readOnly && !updating).activateAfterLongPress(280).onStart(() => {
    active.value = 1;
    runOnJS(start)();
  }).onUpdate((event) => {
    translateX.value = event.translationX;
    translateY.value = event.translationY;
  }).onEnd((event) => runOnJS(drop)(event.absoluteX, event.absoluteY)).onFinalize(() => {
    active.value = 0;
    translateX.value = withSpring(0, { damping: 20, stiffness: 240 });
    translateY.value = withSpring(0, { damping: 20, stiffness: 240 });
    runOnJS(finish)();
  });
  const animatedStyle = useAnimatedStyle(() => ({ opacity: active.value ? 0.96 : 1, transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: active.value ? 1.025 : 1 }], zIndex: active.value ? 50 : 0 }));
  const card = <Animated.View style={[styles.taskWrap, animatedStyle]}><TaskCard onEdit={onEdit} onInspect={onInspect} onMore={onMore} readOnly={readOnly} task={task} updating={updating} /></Animated.View>;
  return readOnly ? card : <GestureDetector gesture={gesture}>{card}</GestureDetector>;
}

function DropTargets({ visible }: { visible: boolean }) {
  const theme = useAppTheme();
  if (!visible) return null;
  return <View pointerEvents="none" style={[styles.dropTargets, { backgroundColor: theme.surfaceRaised, borderColor: theme.primary, shadowColor: theme.shadow }]}>{KANBAN_STATUSES.map((status) => <View key={status.value} style={styles.dropTarget}><View style={[styles.dropTargetIcon, { backgroundColor: statusColor(status.value, theme) }]}><Check color="#ffffff" size={15} /></View><Text style={[styles.dropTargetText, { color: theme.text }]}>{status.label}</Text></View>)}</View>;
}

function MoveTaskSheet({ onClose, onMove, task }: { onClose: () => void; onMove: (status: TaskStatus) => void; task?: Task }) {
  const theme = useAppTheme();
  return <Modal animationType={process.env.NODE_ENV === 'test' ? 'none' : 'slide'} onRequestClose={onClose} transparent visible={Boolean(task)}><View style={styles.sheetRoot}><Pressable accessibilityLabel="Close move task sheet" onPress={onClose} style={styles.backdrop} /><View style={[styles.sheet, { backgroundColor: theme.surfaceRaised }]}><View style={styles.sheetHandle} /><View style={styles.sheetHeader}><View style={styles.flex}><Text style={[styles.sheetTitle, { color: theme.text }]}>Move task</Text><Text numberOfLines={1} style={[styles.sheetSubtitle, { color: theme.textMuted }]}>{task?.title}</Text></View><TouchableScale accessibilityLabel="Close" onPress={onClose} style={styles.smallButton}><X color={theme.text} size={21} /></TouchableScale></View>{KANBAN_STATUSES.map((status) => { const selected = task?.status === status.value; return <TouchableScale accessibilityRole="button" accessibilityState={{ selected }} disabled={selected} key={status.value} onPress={() => onMove(status.value)} style={[styles.moveOption, { borderColor: theme.border }]}><View style={[styles.moveIcon, { backgroundColor: statusColor(status.value, theme) }]}>{selected ? <Check color="#ffffff" size={16} /> : null}</View><Text style={[styles.moveLabel, { color: theme.text }]}>{status.label}</Text>{selected ? <Text style={[styles.currentLabel, { color: theme.textMuted }]}>Current</Text> : null}</TouchableScale>; })}</View></View></Modal>;
}

function TaskDetailsSheet({ onClose, task }: { onClose: () => void; task?: Task }) {
  const theme = useAppTheme();
  const details = task ? [
    ['Type', task.type],
    ['Status', statusLabel(task.status)],
    ['Assignee', task.assignee?.name || 'Unassigned'],
    ['Start date', task.start_date || 'Not set'],
    ['Due date', task.end_date || 'Not set'],
    ['Priority', task.priority || 'Not set'],
    ['Estimated hours', task.estimated_hours == null ? 'Not set' : String(task.estimated_hours)],
  ] : [];
  return <Modal animationType={process.env.NODE_ENV === 'test' ? 'none' : 'slide'} onRequestClose={onClose} transparent visible={Boolean(task)}><View style={styles.sheetRoot}><Pressable accessibilityLabel="Close task details" onPress={onClose} style={styles.backdrop} /><View style={[styles.sheet, { backgroundColor: theme.surfaceRaised }]}><View style={styles.sheetHandle} /><View style={styles.sheetHeader}><View style={styles.flex}><Text style={[styles.sheetTitle, { color: theme.text }]}>Task details</Text><Text numberOfLines={1} style={[styles.sheetSubtitle, { color: theme.textMuted }]}>{task?.task_id || task?.type}</Text></View><TouchableScale accessibilityLabel="Close" onPress={onClose} style={styles.smallButton}><X color={theme.text} size={21} /></TouchableScale></View><Text style={[styles.detailsTitle, { color: theme.text }]}>{task?.title}</Text>{task?.description ? <Text style={[styles.detailsDescription, { color: theme.textMuted }]}>{task.description}</Text> : null}<View style={[styles.detailsGrid, { borderColor: theme.border }]}>{details.map(([label, value]) => <View key={label} style={styles.detailRow}><Text style={[styles.detailLabel, { color: theme.textMuted }]}>{label}</Text><Text style={[styles.detailValue, { color: theme.text }]}>{value}</Text></View>)}</View></View></View></Modal>;
}

function laneTasks(query: ReturnType<typeof useLaneQuery>) { return query.data?.pages.flatMap((page) => page.data) || []; }
function statusLabel(status: TaskStatus) { return KANBAN_STATUSES.find((item) => item.value === status)?.label || status; }
function statusColor(status: TaskStatus, theme: ReturnType<typeof useAppTheme>) { return status === 'completed' ? theme.success : status === 'inprogress' ? theme.warning : theme.primary; }
function heatColor(count: number, theme: ReturnType<typeof useAppTheme>) { if (!count) return { background: theme.surfaceMuted, text: theme.textMuted }; if (count < 3) return { background: theme.primarySoft, text: theme.primary }; if (count < 6) return { background: '#fde68a', text: '#854d0e' }; return { background: '#ef4444', text: '#ffffff' }; }
function moveTaskInLane(data: TaskPages | undefined, task: Task, status: TaskStatus, laneStatus: TaskStatus) {
  if (!data) return data;
  const removing = laneStatus === task.status;
  const adding = laneStatus === status;
  if (!removing && !adding) return data;
  const exists = data.pages.some((page) => page.data.some((item) => item.id === task.id));
  const delta = removing ? -1 : adding && !exists ? 1 : 0;
  const pages = data.pages.map((page) => ({ ...page, data: page.data.filter((item) => item.id !== task.id), meta: page.meta ? { ...page.meta, total_count: Math.max(0, Number(page.meta.total_count || 0) + delta) } : page.meta }));
  if (adding && !exists && pages[0]) pages[0] = { ...pages[0], data: [{ ...task, status }, ...pages[0].data] };
  return { ...data, pages };
}

function updateTaskInPages(data: TaskPages | undefined, id: number, updates: Partial<Task>) {
  if (!data) return data;
  return { ...data, pages: data.pages.map((page) => ({ ...page, data: page.data.map((task) => task.id === id ? { ...task, ...updates } : task) })) };
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, iconButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 }, add: { alignItems: 'center', borderRadius: 8, elevation: 2, height: 42, justifyContent: 'center', shadowOffset: { height: 3, width: 0 }, shadowOpacity: 0.14, shadowRadius: 7, width: 42 },
  phoneList: { paddingBottom: 124, paddingHorizontal: 16 }, tabletScroll: { paddingBottom: 120, paddingHorizontal: 20 }, dashboard: { gap: 14, paddingBottom: 16, paddingTop: 12 }, filters: { borderRadius: 8, borderWidth: 1, elevation: 1, gap: 12, padding: 13, shadowOffset: { height: 3, width: 0 }, shadowOpacity: 0.08, shadowRadius: 8 }, filterBlock: { gap: 6 }, filterLabel: { fontSize: 10, fontWeight: '800' }, picker: { borderRadius: 8, borderWidth: 1, minHeight: 50, overflow: 'hidden' },
  analytics: { gap: 12 }, analyticsTablet: { flexDirection: 'row' }, analyticsCard: { borderRadius: 8, borderWidth: 1, elevation: 1, flex: 1, padding: 14, shadowOffset: { height: 3, width: 0 }, shadowOpacity: 0.08, shadowRadius: 8 }, progressCard: { minWidth: 290 }, analyticsHeader: { alignItems: 'center', flexDirection: 'row', gap: 10 }, analyticsIcon: { alignItems: 'center', borderRadius: 7, height: 38, justifyContent: 'center', width: 38 }, analyticsTitle: { fontSize: 15, fontWeight: '800' }, analyticsMeta: { fontSize: 11, marginTop: 2 }, weekActions: { flexDirection: 'row', gap: 2 }, smallButton: { alignItems: 'center', height: 40, justifyContent: 'center', width: 40 },
  heatmap: { flexDirection: 'row', gap: 4, marginTop: 16 }, day: { alignItems: 'center', borderRadius: 7, borderWidth: 2, flex: 1, minHeight: 58, paddingHorizontal: 2, paddingVertical: 7 }, dayName: { fontSize: 10, fontWeight: '800' }, dayCount: { fontSize: 18, fontWeight: '900', marginTop: 3 }, dueList: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 13, paddingTop: 12 }, dueTitle: { fontSize: 13, fontWeight: '800', marginBottom: 5 }, dueTask: { alignItems: 'center', flexDirection: 'row', minHeight: 32 }, dueDot: { borderRadius: 4, height: 8, marginRight: 8, width: 8 }, dueTaskText: { flex: 1, fontSize: 12 }, noDue: { fontSize: 12, fontStyle: 'italic', paddingVertical: 6 },
  donutWrap: { alignItems: 'center', justifyContent: 'center', marginTop: 8 }, donutCenter: { alignItems: 'center', justifyContent: 'center', position: 'absolute' }, donutTotal: { fontSize: 28, fontWeight: '900' }, donutLabel: { fontSize: 11, marginTop: 1 }, legend: { gap: 8, marginTop: 3 }, legendItem: { alignItems: 'center', flexDirection: 'row' }, legendDot: { borderRadius: 4, height: 8, marginRight: 8, width: 8 }, legendLabel: { flex: 1, fontSize: 12 }, legendValue: { fontSize: 13, fontWeight: '800' }, statusTabs: { marginTop: 1 },
  taskWrap: { marginBottom: 10 }, lanes: { flexDirection: 'row', gap: 12 }, lane: { borderRadius: 8, borderWidth: 1, flex: 1, minHeight: 300, overflow: 'hidden', padding: 11, paddingTop: 15 }, laneAccent: { height: 4, left: 0, position: 'absolute', right: 0, top: 0 }, laneHeader: { alignItems: 'center', flexDirection: 'row', marginBottom: 12 }, laneTitle: { flex: 1, fontSize: 15, fontWeight: '800' }, laneCount: { borderRadius: 6, fontSize: 11, fontWeight: '800', overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 3 }, laneEmpty: { fontSize: 12, fontStyle: 'italic', paddingVertical: 24, textAlign: 'center' }, loadMore: { alignItems: 'center', borderRadius: 7, borderWidth: 1, minHeight: 42, justifyContent: 'center' }, loadMoreText: { fontSize: 12, fontWeight: '800' },
  dropTargets: { borderRadius: 8, borderWidth: 1, bottom: 10, elevation: 12, flexDirection: 'row', left: 10, padding: 9, position: 'absolute', right: 10, shadowOffset: { height: 7, width: 0 }, shadowOpacity: 0.25, shadowRadius: 15, zIndex: 100 }, dropTarget: { alignItems: 'center', flex: 1, gap: 5 }, dropTargetIcon: { alignItems: 'center', borderRadius: 7, height: 30, justifyContent: 'center', width: 30 }, dropTargetText: { fontSize: 11, fontWeight: '800' },
  sheetRoot: { flex: 1, justifyContent: 'flex-end' }, backdrop: { backgroundColor: 'rgba(0,0,0,0.42)', bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 }, sheet: { borderTopLeftRadius: 8, borderTopRightRadius: 8, gap: 4, padding: 18, paddingBottom: 34 }, sheetHandle: { alignSelf: 'center', backgroundColor: '#98a2b3', borderRadius: 2, height: 4, marginBottom: 10, opacity: 0.55, width: 38 }, sheetHeader: { alignItems: 'center', flexDirection: 'row', marginBottom: 8 }, sheetTitle: { fontSize: 18, fontWeight: '900' }, sheetSubtitle: { fontSize: 12, marginTop: 3 }, moveOption: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 58 }, moveIcon: { alignItems: 'center', borderRadius: 7, height: 32, justifyContent: 'center', marginRight: 12, width: 32 }, moveLabel: { flex: 1, fontSize: 14, fontWeight: '800' }, currentLabel: { fontSize: 11, fontWeight: '700' },
  detailsTitle: { fontSize: 18, fontWeight: '800', lineHeight: 24, marginTop: 4 }, detailsDescription: { fontSize: 13, lineHeight: 19, marginBottom: 8, marginTop: 5 }, detailsGrid: { borderTopWidth: StyleSheet.hairlineWidth, gap: 9, marginTop: 10, paddingTop: 14 }, detailRow: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 24 }, detailLabel: { fontSize: 12, width: 112 }, detailValue: { flex: 1, fontSize: 13, fontWeight: '700', textAlign: 'right' },
});
