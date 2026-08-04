import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Picker } from '@react-native-picker/picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Pencil, Plus, Trash2, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { apiErrorMessage } from '@/src/api/client';
import { endpoints } from '@/src/api/endpoints';
import type { EntityRecord, Project } from '@/src/api/types';
import { Avatar } from '@/src/components/Avatar';
import { EntityCollectionScreen } from '@/src/components/EntityCollectionScreen';
import { PageHeader } from '@/src/components/PageHeader';
import { Screen } from '@/src/components/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/src/components/StateView';
import { useAppTheme } from '@/src/theme';
import { useAuth } from '@/src/auth/AuthProvider';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { ProjectSprintsScreen } from '@/src/screens/ProjectSprintsScreen';
import { ProjectStatisticsScreen } from '@/src/screens/ProjectStatisticsScreen';
import { IssuesScreen } from '@/src/screens/IssuesScreen';
import { ProjectKanbanScreen } from '@/src/screens/ProjectKanbanScreen';

export default function ProjectFeatureScreen() {
  const { id, feature } = useLocalSearchParams<{ id: string; feature: string }>();
  const projectId = Number(id);
  if (feature === 'board') return <ProjectKanbanScreen projectId={projectId} />;
  if (feature === 'members') return <MembersScreen projectId={projectId} />;
  if (feature === 'sprints') return <ProjectSprintsScreen />;
  if (feature === 'statistics') return <ProjectStatisticsScreen />;
  if (feature === 'issues') return <IssuesScreen />;
  if (feature === 'environments') return <EntityCollectionScreen title="Environments" subtitle="Project URLs and deployment notes" path={`/projects/${projectId}/environments`} wrapper="project_environment" primary="name" secondary={['url', 'description']} fields={[{ key: 'name', label: 'Environment name' }, { key: 'url', label: 'URL' }, { key: 'description', label: 'Description', multiline: true }]} />;
  if (feature === 'vault') return <EntityCollectionScreen title="Project vault" subtitle="Credentials, references, and environment notes" path={`/projects/${projectId}/vault_items`} wrapper="project_vault_item" primary="title" secondary={['category', 'username']} fields={[{ key: 'title', label: 'Title' }, { key: 'category', label: 'Category' }, { key: 'username', label: 'Username' }, { key: 'content', label: 'Content', multiline: true }]} />;
  if (feature === 'logs') return <EntityCollectionScreen title="Task logs" subtitle="Delivery effort and status records" path="/task_logs" params={{ project_id: projectId }} wrapper="task_log" primary="type" secondary={['log_date', 'hours_logged', 'status']} fields={[{ key: 'task_id', label: 'Task ID' }, { key: 'developer_id', label: 'Developer ID' }, { key: 'type', label: 'Log type' }, { key: 'log_date', label: 'Log date', placeholder: 'YYYY-MM-DD' }, { key: 'hours_logged', label: 'Hours' }, { key: 'status', label: 'Status' }]} />;
  if (feature === 'settings') return <ProjectSettingsScreen projectId={projectId} />;
  return <Screen><EmptyState title="Project feature unavailable" message="This project module is not enabled." /></Screen>;
}

function MembersScreen({ projectId }: { projectId: number }) {
  const theme = useAppTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canManage = !user?.demo_account && Boolean(user?.permissions?.includes('project_members.manage'));
  const [editing, setEditing] = useState<EntityRecord | null | undefined>(undefined);
  const [selectedUserId, setSelectedUserId] = useState<number | undefined>();
  const [role, setRole] = useState('collaborator');
  const [status, setStatus] = useState('active');
  const [allocation, setAllocation] = useState('50');
  const [workload, setWorkload] = useState('partial');
  const project = useQuery({ queryKey: ['project', projectId], queryFn: () => endpoints.project(projectId) });
  const people = useQuery({ queryKey: ['users', 'project-member-options'], queryFn: () => endpoints.users(), enabled: canManage });
  const memberIds = new Set((project.data?.users || []).map((member) => member.id));
  const available = (people.data?.data || []).filter((person) => !memberIds.has(person.id));
  const open = (member: EntityRecord | null) => { setEditing(member); setSelectedUserId(member?.id); setRole(String(member?.role || 'collaborator')); setStatus(String(member?.status || 'active')); setAllocation(String(member?.allocation_percentage ?? 50)); setWorkload(String(member?.workload_status || 'partial')); };
  const save = useMutation({ mutationFn: () => { const input = { project_id: projectId, user_id: selectedUserId, role, status, allocation_percentage: Number(allocation || 0), workload_status: workload }; return editing?.project_user_id ? endpoints.updateProjectUser(Number(editing.project_user_id), input) : endpoints.createProjectUser(input); }, onSuccess: async () => { setEditing(undefined); await queryClient.invalidateQueries({ queryKey: ['project', projectId] }); }, onError: (error) => Alert.alert('Unable to save project member', apiErrorMessage(error)) });
  const remove = useMutation({ mutationFn: () => endpoints.deleteProjectUser(Number(editing!.project_user_id)), onSuccess: async () => { setEditing(undefined); await queryClient.invalidateQueries({ queryKey: ['project', projectId] }); }, onError: (error) => Alert.alert('Unable to remove project member', apiErrorMessage(error)) });
  return <Screen header={<PageHeader leading={<Pressable accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}><ArrowLeft color={theme.text} size={22} /></Pressable>} title="Project members" subtitle="Roles, allocation, and availability" action={canManage ? <Pressable accessibilityLabel="Add project member" onPress={() => open(null)} style={[styles.add, { backgroundColor: theme.primary }]}><Plus color="#ffffff" size={21} /></Pressable> : undefined} />}>
    {project.isLoading ? <LoadingState /> : null}{project.isError ? <ErrorState message={apiErrorMessage(project.error)} onRetry={() => project.refetch()} /> : null}
    {project.data ? <FlatList contentContainerStyle={styles.list} data={project.data.users || []} keyExtractor={(item) => String(item.id)} ListEmptyComponent={<EmptyState title="No project members" message="Project managers can add members from project settings." />} renderItem={({ item }) => <Pressable accessibilityRole={canManage ? 'button' : undefined} onPress={canManage ? () => open(item) : undefined} style={[styles.member, { borderBottomColor: theme.border }]}><Avatar color={String(item.avatar_color || theme.primary)} name={String(item.name)} size={44} uri={item.profile_picture ? String(item.profile_picture) : undefined} /><View style={styles.copy}><Text style={[styles.name, { color: theme.text }]}>{String(item.name)}</Text><Text style={[styles.meta, { color: theme.textMuted }]}>{String(item.role || 'collaborator')} · {String(item.allocation_percentage || 0)}% allocation · {String(item.workload_status || 'free')}</Text></View>{canManage ? <Pencil color={theme.textMuted} size={17} /> : null}</Pressable>} /> : null}
    <Modal animationType="slide" onRequestClose={() => setEditing(undefined)} presentationStyle="pageSheet" visible={editing !== undefined}><View style={[styles.modal, { backgroundColor: theme.background }]}><View style={[styles.modalHeader, { borderBottomColor: theme.border }]}><Pressable accessibilityLabel="Close member editor" onPress={() => setEditing(undefined)} style={styles.back}><X color={theme.text} size={22} /></Pressable><Text style={[styles.modalTitle, { color: theme.text }]}>{editing ? 'Edit member' : 'Add member'}</Text><View style={styles.back} /></View><ScrollView contentContainerStyle={styles.form}><PickerField enabled={!editing} label="Workspace user" selectedValue={selectedUserId} onValueChange={setSelectedUserId} options={(editing ? [editing] : available).map((person) => ({ label: String(person.name || person.full_name || person.email), value: person.id }))} /><PickerField label="Project role" selectedValue={role} onValueChange={setRole} options={['owner', 'manager', 'collaborator', 'developer', 'qa', 'devops', 'designer', 'analyst', 'viewer'].map((value) => ({ label: humanizeMember(value), value }))} /><PickerField label="Status" selectedValue={status} onValueChange={setStatus} options={['invited', 'requested', 'active', 'removed'].map((value) => ({ label: humanizeMember(value), value }))} /><View><Text style={[styles.label, { color: theme.text }]}>Allocation percentage</Text><TextInput accessibilityLabel="Allocation percentage" keyboardType="number-pad" onChangeText={setAllocation} style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]} value={allocation} /></View><PickerField label="Workload" selectedValue={workload} onValueChange={setWorkload} options={['free', 'partial', 'full', 'overloaded'].map((value) => ({ label: humanizeMember(value), value }))} /><PrimaryButton disabled={!selectedUserId || save.isPending} label="Save member" loading={save.isPending} onPress={() => save.mutate()} />{editing ? <Pressable onPress={() => Alert.alert('Remove member?', 'This removes project access for this user.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => remove.mutate() }])} style={styles.delete}><Trash2 color={theme.danger} size={18} /><Text style={{ color: theme.danger, fontWeight: '800' }}>Remove member</Text></Pressable> : null}</ScrollView></View></Modal>
  </Screen>;
}

type ProjectSettingsDraft = {
  name: string;
  description: string;
  start_date: string;
  end_date: string;
  qa_mode_enabled: boolean;
  sheet_integration_enabled: boolean;
  sheet_id: string;
  issue_sheet_id: string;
  issue_sheet_name: string;
};

function draftFromProject(project?: Project): ProjectSettingsDraft {
  return {
    name: project?.name || '',
    description: project?.description || '',
    start_date: project?.start_date || '',
    end_date: project?.end_date || '',
    qa_mode_enabled: Boolean(project?.qa_mode_enabled),
    sheet_integration_enabled: Boolean(project?.sheet_integration_enabled),
    sheet_id: project?.sheet_id || '',
    issue_sheet_id: project?.issue_sheet_id || '',
    issue_sheet_name: project?.issue_sheet_name || 'Issue Tracker',
  };
}

function ProjectSettingsScreen({ projectId }: { projectId: number }) {
  const theme = useAppTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canManage = !user?.demo_account && Boolean(user?.permissions?.includes('projects.manage'));
  const project = useQuery({ queryKey: ['project', projectId], queryFn: () => endpoints.project(projectId), enabled: Number.isFinite(projectId) });
  const [draft, setDraft] = useState<ProjectSettingsDraft>(draftFromProject());

  useEffect(() => {
    if (project.data) setDraft(draftFromProject(project.data));
  }, [project.data]);

  const save = useMutation({
    mutationFn: () => endpoints.updateProject(projectId, {
      name: draft.name.trim(),
      description: draft.description,
      start_date: draft.start_date || null,
      end_date: draft.end_date || null,
      qa_mode_enabled: draft.qa_mode_enabled,
      sheet_integration_enabled: draft.sheet_integration_enabled,
      sheet_id: draft.sheet_integration_enabled ? draft.sheet_id.trim() : '',
      issue_sheet_id: draft.sheet_integration_enabled ? draft.issue_sheet_id.trim() : '',
      issue_sheet_name: draft.sheet_integration_enabled ? (draft.issue_sheet_name.trim() || 'Issue Tracker') : 'Issue Tracker',
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['project', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
      ]);
      Alert.alert('Project settings saved', 'Mobile and web dashboards now use the updated configuration.');
    },
    onError: (error) => Alert.alert('Unable to save project settings', apiErrorMessage(error)),
  });

  const update = <K extends keyof ProjectSettingsDraft>(key: K, value: ProjectSettingsDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  return <Screen header={<PageHeader leading={<Pressable accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}><ArrowLeft color={theme.text} size={22} /></Pressable>} title="Project settings" subtitle={project.data?.name || 'Delivery configuration'} />}>
    {project.isLoading ? <LoadingState label="Loading project settings" /> : null}
    {project.isError ? <ErrorState message={apiErrorMessage(project.error)} onRetry={() => project.refetch()} /> : null}
    {project.data ? <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
      {!canManage ? <View style={[styles.notice, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text style={[styles.noticeTitle, { color: theme.text }]}>Read-only settings</Text><Text style={[styles.noticeText, { color: theme.textMuted }]}>Project managers can edit delivery configuration from this screen.</Text></View> : null}
      <ProjectField editable={canManage} label="Project name" value={draft.name} onChangeText={(value) => update('name', value)} />
      <ProjectField editable={canManage} label="Description" multiline value={draft.description} onChangeText={(value) => update('description', value)} />
      <View style={styles.columns}><View style={styles.flex}><ProjectField editable={canManage} label="Start date" placeholder="YYYY-MM-DD" value={draft.start_date} onChangeText={(value) => update('start_date', value)} /></View><View style={styles.flex}><ProjectField editable={canManage} label="End date" placeholder="YYYY-MM-DD" value={draft.end_date} onChangeText={(value) => update('end_date', value)} /></View></View>
      <ProjectToggle disabled={!canManage} label="QA mode" detail="Show Dev, QA, and combined planning lanes." value={draft.qa_mode_enabled} onValueChange={(value) => update('qa_mode_enabled', value)} />
      <ProjectToggle disabled={!canManage} label="Sheet integration" detail="Enable task and issue sync with connected Google Sheets." value={draft.sheet_integration_enabled} onValueChange={(value) => update('sheet_integration_enabled', value)} />
      {draft.sheet_integration_enabled ? <View style={[styles.settingsCard, { backgroundColor: theme.surface, borderColor: theme.border }]}><ProjectField editable={canManage} label="Task sheet ID" value={draft.sheet_id} onChangeText={(value) => update('sheet_id', value)} /><ProjectField editable={canManage} label="Issue sheet ID" value={draft.issue_sheet_id} onChangeText={(value) => update('issue_sheet_id', value)} /><ProjectField editable={canManage} label="Issue sheet name" value={draft.issue_sheet_name} onChangeText={(value) => update('issue_sheet_name', value)} /></View> : null}
      {canManage ? <PrimaryButton disabled={!draft.name.trim() || save.isPending} label={save.isPending ? 'Saving...' : 'Save project settings'} onPress={() => save.mutate()} /> : null}
    </ScrollView> : null}
  </Screen>;
}

function PickerField<T extends string | number | undefined>({ label, selectedValue, onValueChange, options, enabled = true }: { label: string; selectedValue: T; onValueChange: (value: T) => void; options: Array<{ label: string; value: T }>; enabled?: boolean }) { const theme = useAppTheme(); return <View><Text style={[styles.label, { color: theme.text }]}>{label}</Text><View style={[styles.picker, { backgroundColor: theme.surface, borderColor: theme.border }]}><Picker enabled={enabled} selectedValue={selectedValue} onValueChange={(value) => onValueChange(value as T)} style={{ color: theme.text }}>{!selectedValue ? <Picker.Item label="Select a user" value={undefined} /> : null}{options.map((option) => <Picker.Item key={String(option.value)} label={option.label} value={option.value} />)}</Picker></View></View>; }
function ProjectField({ label, editable, multiline, ...props }: { label: string; editable: boolean } & React.ComponentProps<typeof TextInput>) { const theme = useAppTheme(); return <View><Text style={[styles.label, { color: theme.text }]}>{label}</Text><TextInput accessibilityLabel={label} editable={editable} multiline={multiline} placeholderTextColor={theme.textMuted} {...props} style={[styles.input, multiline && styles.multiline, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text, opacity: editable ? 1 : 0.72 }]} /></View>; }
function ProjectToggle({ label, detail, value, disabled, onValueChange }: { label: string; detail: string; value: boolean; disabled: boolean; onValueChange: (value: boolean) => void }) { const theme = useAppTheme(); return <View style={[styles.toggleRow, { backgroundColor: theme.surface, borderColor: theme.border }]}><View style={styles.flex}><Text style={[styles.toggleTitle, { color: theme.text }]}>{label}</Text><Text style={[styles.toggleMeta, { color: theme.textMuted }]}>{detail}</Text></View><Switch accessibilityLabel={label} disabled={disabled} onValueChange={onValueChange} trackColor={{ false: theme.surfaceMuted, true: theme.primary }} value={value} /></View>; }
function humanizeMember(value: string) { return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }

const styles = StyleSheet.create({ back: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 }, add: { alignItems: 'center', borderRadius: 8, height: 42, justifyContent: 'center', width: 42 }, flex: { flex: 1 }, list: { paddingHorizontal: 20, paddingBottom: 40 }, member: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 12, minHeight: 72 }, copy: { flex: 1 }, name: { fontSize: 15, fontWeight: '700' }, meta: { fontSize: 12, marginTop: 4 }, modal: { flex: 1 }, modalHeader: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', minHeight: 62, paddingHorizontal: 10 }, modalTitle: { fontSize: 17, fontWeight: '800' }, form: { gap: 17, padding: 20, paddingBottom: 44 }, columns: { flexDirection: 'row', gap: 10 }, label: { fontSize: 13, fontWeight: '800', marginBottom: 7 }, input: { borderRadius: 8, borderWidth: 1, fontSize: 15, minHeight: 47, paddingHorizontal: 12, paddingVertical: 10 }, multiline: { minHeight: 112, textAlignVertical: 'top' }, picker: { borderRadius: 8, borderWidth: 1, minHeight: 52, overflow: 'hidden' }, settingsCard: { borderRadius: 8, borderWidth: 1, gap: 14, padding: 13 }, toggleRow: { alignItems: 'center', borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 12, minHeight: 72, padding: 13 }, toggleTitle: { fontSize: 14, fontWeight: '800' }, toggleMeta: { fontSize: 12, lineHeight: 17, marginTop: 3 }, notice: { borderRadius: 8, borderWidth: 1, padding: 13 }, noticeTitle: { fontSize: 14, fontWeight: '800' }, noticeText: { fontSize: 12, lineHeight: 17, marginTop: 4 }, delete: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 48 } });
