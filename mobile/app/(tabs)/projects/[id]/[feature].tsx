import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { apiErrorMessage } from '@/src/api/client';
import { endpoints } from '@/src/api/endpoints';
import { Avatar } from '@/src/components/Avatar';
import { EntityCollectionScreen } from '@/src/components/EntityCollectionScreen';
import { PageHeader } from '@/src/components/PageHeader';
import { Screen } from '@/src/components/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/src/components/StateView';
import { useAppTheme } from '@/src/theme';

export default function ProjectFeatureScreen() {
  const { id, feature } = useLocalSearchParams<{ id: string; feature: string }>();
  const projectId = Number(id);
  if (feature === 'members') return <MembersScreen projectId={projectId} />;
  if (feature === 'issues') return <EntityCollectionScreen title="Issues" subtitle="Triage, severity, and delivery status" path="/issues" params={{ project_id: projectId }} defaults={{ project_id: projectId }} wrapper="issue" primary="title" secondary={['issue_key', 'status', 'severity']} fields={[{ key: 'title', label: 'Issue title' }, { key: 'issue_description', label: 'Description', multiline: true }, { key: 'status', label: 'Status', placeholder: 'Open' }, { key: 'severity', label: 'Severity', placeholder: 'Medium' }]} />;
  if (feature === 'sprints') return <EntityCollectionScreen title="Sprints" subtitle="Iterations and backlog windows" path="/sprints" params={{ project_id: projectId }} defaults={{ project_id: projectId }} wrapper="sprint" primary="name" secondary={['start_date', 'end_date', 'status']} fields={[{ key: 'name', label: 'Sprint name' }, { key: 'start_date', label: 'Start date', placeholder: 'YYYY-MM-DD' }, { key: 'end_date', label: 'End date', placeholder: 'YYYY-MM-DD' }]} />;
  if (feature === 'environments') return <EntityCollectionScreen title="Environments" subtitle="Project URLs and deployment notes" path={`/projects/${projectId}/environments`} wrapper="project_environment" primary="name" secondary={['url', 'description']} fields={[{ key: 'name', label: 'Environment name' }, { key: 'url', label: 'URL' }, { key: 'description', label: 'Description', multiline: true }]} />;
  if (feature === 'vault') return <EntityCollectionScreen title="Project vault" subtitle="Credentials, references, and environment notes" path={`/projects/${projectId}/vault_items`} wrapper="project_vault_item" primary="title" secondary={['category', 'username']} fields={[{ key: 'title', label: 'Title' }, { key: 'category', label: 'Category' }, { key: 'username', label: 'Username' }, { key: 'content', label: 'Content', multiline: true }]} />;
  if (feature === 'logs') return <EntityCollectionScreen title="Task logs" subtitle="Delivery effort and status records" path="/task_logs" params={{ project_id: projectId }} wrapper="task_log" primary="type" secondary={['log_date', 'hours_logged', 'status']} fields={[{ key: 'task_id', label: 'Task ID' }, { key: 'developer_id', label: 'Developer ID' }, { key: 'type', label: 'Log type' }, { key: 'log_date', label: 'Log date', placeholder: 'YYYY-MM-DD' }, { key: 'hours_logged', label: 'Hours' }, { key: 'status', label: 'Status' }]} />;
  return <Screen><EmptyState title="Project feature unavailable" message="This project module is not enabled." /></Screen>;
}

function MembersScreen({ projectId }: { projectId: number }) {
  const theme = useAppTheme();
  const router = useRouter();
  const project = useQuery({ queryKey: ['project', projectId], queryFn: () => endpoints.project(projectId) });
  return <Screen header={<PageHeader leading={<Pressable accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}><ArrowLeft color={theme.text} size={22} /></Pressable>} title="Project members" subtitle="Roles, allocation, and availability" />}>
    {project.isLoading ? <LoadingState /> : null}{project.isError ? <ErrorState message={apiErrorMessage(project.error)} onRetry={() => project.refetch()} /> : null}
    {project.data ? <FlatList contentContainerStyle={styles.list} data={project.data.users || []} keyExtractor={(item) => String(item.id)} ListEmptyComponent={<EmptyState title="No project members" message="Project managers can add members from project settings." />} renderItem={({ item }) => <View style={[styles.member, { borderBottomColor: theme.border }]}><Avatar color={String(item.avatar_color || theme.primary)} name={String(item.name)} size={44} uri={item.profile_picture ? String(item.profile_picture) : undefined} /><View style={styles.copy}><Text style={[styles.name, { color: theme.text }]}>{String(item.name)}</Text><Text style={[styles.meta, { color: theme.textMuted }]}>{String(item.role || 'collaborator')} · {String(item.allocation_percentage || 0)}% allocation</Text></View></View>} /> : null}
  </Screen>;
}

const styles = StyleSheet.create({ back: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 }, list: { paddingHorizontal: 20, paddingBottom: 40 }, member: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 12, minHeight: 72 }, copy: { flex: 1 }, name: { fontSize: 15, fontWeight: '700' }, meta: { fontSize: 12, marginTop: 4 } });
