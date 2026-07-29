import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AlertTriangle, ArrowLeft, CheckCircle2, CircleDot, Clock3, Users } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { apiErrorMessage } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { Sprint, Task } from '../api/types';
import { PageHeader } from '../components/PageHeader';
import { Screen } from '../components/Screen';
import { SegmentedControl } from '../components/SegmentedControl';
import { ErrorState, LoadingState } from '../components/StateView';
import { useAppTheme } from '../theme';
import { Pressable } from 'react-native';

type ViewMode = 'overview' | 'sprints' | 'workload';

export function ProjectStatisticsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const projectId = Number(id);
  const router = useRouter();
  const theme = useAppTheme();
  const [mode, setMode] = useState<ViewMode>('overview');
  const project = useQuery({ queryKey: ['project', projectId], queryFn: () => endpoints.project(projectId), enabled: Number.isFinite(projectId) });
  const sprints = useQuery({ queryKey: ['project-sprints', projectId], queryFn: () => endpoints.sprints(projectId), enabled: Number.isFinite(projectId) });
  const tasks = useQuery({ queryKey: ['project-tasks', projectId], queryFn: () => endpoints.tasks({ project_id: projectId, per_page: 100 }), enabled: Number.isFinite(projectId) });
  const rows = tasks.data?.data || [];
  const summary = useMemo(() => summarize(rows), [rows]);
  const refreshing = project.isRefetching || sprints.isRefetching || tasks.isRefetching;
  const refresh = () => Promise.all([project.refetch(), sprints.refetch(), tasks.refetch()]);

  return <Screen header={<PageHeader leading={<Pressable accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}><ArrowLeft color={theme.text} size={22} /></Pressable>} title="Project statistics" subtitle={project.data?.name || 'Delivery health'} />}>
    {project.isLoading || sprints.isLoading || tasks.isLoading ? <LoadingState label="Calculating project health" /> : null}
    {project.isError || sprints.isError || tasks.isError ? <ErrorState message={apiErrorMessage(project.error || sprints.error || tasks.error)} onRetry={refresh} /> : null}
    {project.data && tasks.data ? <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl onRefresh={refresh} refreshing={refreshing} tintColor={theme.primary} />}><SegmentedControl value={mode} onChange={setMode} options={[{ value: 'overview', label: 'Overview' }, { value: 'sprints', label: 'Sprints' }, { value: 'workload', label: 'Workload' }]} />{mode === 'overview' ? <Overview summary={summary} /> : null}{mode === 'sprints' ? <SprintBreakdown sprints={sprints.data || []} tasks={rows} /> : null}{mode === 'workload' ? <Workload members={project.data.users || []} tasks={rows} /> : null}</ScrollView> : null}
  </Screen>;
}

function Overview({ summary }: { summary: ReturnType<typeof summarize> }) {
  const theme = useAppTheme();
  const metrics = [{ label: 'Total', value: summary.total, icon: CircleDot, color: theme.primary }, { label: 'Completed', value: summary.completed, icon: CheckCircle2, color: theme.success }, { label: 'In progress', value: summary.inProgress, icon: Clock3, color: theme.warning }, { label: 'Overdue', value: summary.overdue, icon: AlertTriangle, color: theme.danger }];
  return <View><View style={styles.metricGrid}>{metrics.map(({ label, value, icon: Icon, color }) => <View key={label} style={[styles.metric, { backgroundColor: theme.surface, borderColor: theme.border }]}><Icon color={color} size={20} /><Text style={[styles.metricValue, { color: theme.text }]}>{value}</Text><Text style={[styles.metricLabel, { color: theme.textMuted }]}>{label}</Text></View>)}</View><Text style={[styles.heading, { color: theme.text }]}>Overall completion</Text><Progress label={`${summary.completionRate}% complete`} value={summary.completionRate} color={theme.success} /><View style={[styles.statusPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}><StatusRow color={theme.textMuted} label="To do" total={summary.total} value={summary.todo} /><StatusRow color={theme.primary} label="In progress" total={summary.total} value={summary.inProgress} /><StatusRow color={theme.success} label="Completed" total={summary.total} value={summary.completed} /></View></View>;
}

function SprintBreakdown({ sprints, tasks }: { sprints: Sprint[]; tasks: Task[] }) {
  const theme = useAppTheme();
  const groups = sprints.map((sprint) => ({ sprint, summary: summarize(tasks.filter((task) => task.sprint_id === sprint.id)) }));
  const backlog = summarize(tasks.filter((task) => !task.sprint_id));
  return <View><Text style={[styles.heading, { color: theme.text }]}>Sprint progress</Text>{groups.map(({ sprint, summary }) => <View key={sprint.id} style={[styles.sprint, { backgroundColor: theme.surface, borderColor: theme.border }]}><View style={styles.titleLine}><Text style={[styles.rowTitle, { color: theme.text }]}>{sprint.name}</Text><Text style={[styles.percent, { color: theme.primary }]}>{summary.completionRate}%</Text></View><Text style={[styles.rowMeta, { color: theme.textMuted }]}>{sprint.start_date} to {sprint.end_date} · {summary.completed}/{summary.total} complete</Text><Progress label={`${sprint.name}: ${summary.completionRate}% complete`} value={summary.completionRate} color={summary.completionRate === 100 ? theme.success : theme.primary} /></View>)}{backlog.total ? <View style={[styles.sprint, { backgroundColor: theme.surface, borderColor: theme.border }]}><View style={styles.titleLine}><Text style={[styles.rowTitle, { color: theme.text }]}>Backlog and unscheduled</Text><Text style={[styles.percent, { color: theme.primary }]}>{backlog.total}</Text></View><Text style={[styles.rowMeta, { color: theme.textMuted }]}>{backlog.inProgress} active · {backlog.overdue} overdue</Text></View> : null}</View>;
}

function Workload({ members, tasks }: { members: Array<Record<string, unknown> & { id: number }>; tasks: Task[] }) {
  const theme = useAppTheme();
  const rows = members.map((member) => {
    const assigned = tasks.filter((task) => task.developer_id === member.id || task.assigned_to_user === member.id);
    const hours = assigned.reduce((total, task) => total + Number(task.total_hours || task.estimated_hours || 0), 0);
    return { id: member.id, name: String(member.name || member.email || `Member ${member.id}`), allocation: Number(member.allocation_percentage || 0), workload: String(member.workload_status || 'partial'), tasks: assigned.length, hours };
  }).sort((left, right) => right.hours - left.hours || right.tasks - left.tasks);
  const maxHours = Math.max(1, ...rows.map((row) => row.hours));
  return <View><Text style={[styles.heading, { color: theme.text }]}>Member workload</Text>{rows.length ? rows.map((row) => <View key={row.id} style={[styles.workload, { backgroundColor: theme.surface, borderColor: theme.border }]}><View style={styles.titleLine}><View style={[styles.personIcon, { backgroundColor: theme.surfaceMuted }]}><Users color={theme.primary} size={18} /></View><View style={styles.flex}><Text style={[styles.rowTitle, { color: theme.text }]}>{row.name}</Text><Text style={[styles.rowMeta, { color: theme.textMuted }]}>{row.tasks} tasks · {row.hours.toFixed(1)}h · {row.allocation}% allocation</Text></View><Text style={[styles.workloadState, { color: row.workload === 'overloaded' ? theme.danger : theme.textMuted }]}>{row.workload}</Text></View><Progress label={`${row.name}: ${row.hours.toFixed(1)} hours`} value={Math.round((row.hours / maxHours) * 100)} color={row.workload === 'overloaded' ? theme.danger : theme.primary} /></View>) : <Text style={[styles.empty, { color: theme.textMuted }]}>No project members have assigned work.</Text>}</View>;
}

function StatusRow({ color, label, total, value }: { color: string; label: string; total: number; value: number }) { const theme = useAppTheme(); return <View style={styles.statusRow}><View style={[styles.dot, { backgroundColor: color }]} /><Text style={[styles.statusLabel, { color: theme.text }]}>{label}</Text><Text style={[styles.statusValue, { color: theme.textMuted }]}>{value} · {total ? Math.round((value / total) * 100) : 0}%</Text></View>; }
function Progress({ color, label, value }: { color: string; label: string; value: number }) { const theme = useAppTheme(); const normalized = Math.max(0, Math.min(100, value)); return <View accessibilityLabel={label} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: normalized }} style={[styles.progressTrack, { backgroundColor: theme.surfaceMuted }]}><View style={[styles.progressFill, { backgroundColor: color, width: `${normalized}%` }]} /></View>; }
function summarize(tasks: Task[]) { const now = new Date(); const completed = tasks.filter((task) => task.status === 'completed').length; const inProgress = tasks.filter((task) => task.status === 'inprogress').length; const todo = tasks.filter((task) => task.status === 'todo').length; const overdue = tasks.filter((task) => task.status !== 'completed' && task.end_date && new Date(task.end_date) < now).length; return { total: tasks.length, completed, inProgress, todo, overdue, completionRate: tasks.length ? Math.round((completed / tasks.length) * 100) : 0 }; }

const styles = StyleSheet.create({ back: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 }, scroll: { padding: 20, paddingBottom: 44 }, flex: { flex: 1 }, metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 20 }, metric: { borderRadius: 8, borderWidth: 1, minHeight: 102, padding: 13, width: '48%' }, metricValue: { fontSize: 24, fontWeight: '900', marginTop: 8 }, metricLabel: { fontSize: 11, marginTop: 2 }, heading: { fontSize: 17, fontWeight: '800', marginBottom: 11, marginTop: 25 }, progressTrack: { borderRadius: 4, height: 8, overflow: 'hidden' }, progressFill: { borderRadius: 4, height: 8 }, statusPanel: { borderRadius: 8, borderWidth: 1, marginTop: 18, paddingHorizontal: 13 }, statusRow: { alignItems: 'center', flexDirection: 'row', minHeight: 48 }, dot: { borderRadius: 5, height: 10, marginRight: 10, width: 10 }, statusLabel: { flex: 1, fontSize: 13, fontWeight: '700' }, statusValue: { fontSize: 12 }, sprint: { borderRadius: 8, borderWidth: 1, gap: 10, marginBottom: 9, padding: 13 }, titleLine: { alignItems: 'center', flexDirection: 'row' }, rowTitle: { flex: 1, fontSize: 14, fontWeight: '800' }, rowMeta: { fontSize: 12, marginTop: 4 }, percent: { fontSize: 13, fontWeight: '900' }, workload: { borderRadius: 8, borderWidth: 1, gap: 11, marginBottom: 9, padding: 12 }, personIcon: { alignItems: 'center', borderRadius: 7, height: 40, justifyContent: 'center', marginRight: 10, width: 40 }, workloadState: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase' }, empty: { fontSize: 13, marginTop: 10 } });
