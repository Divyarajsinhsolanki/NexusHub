import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, FolderKanban, Plus, Trash2, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { apiErrorMessage } from '@/src/api/client';
import { endpoints } from '@/src/api/endpoints';
import type { Project } from '@/src/api/types';
import { PageHeader } from '@/src/components/PageHeader';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { Screen } from '@/src/components/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/src/components/StateView';
import { useAppTheme } from '@/src/theme';
import { useAuth } from '@/src/auth/AuthProvider';

export default function ProjectsScreen() {
  const theme = useAppTheme();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [editing, setEditing] = useState<Project | null | undefined>(undefined);
  const [form, setForm] = useState({ name: '', description: '', start_date: '', end_date: '' });
  const projects = useQuery({ queryKey: ['projects'], queryFn: endpoints.projects });
  const canManage = user?.permissions?.includes('projects.manage');
  const openEditor = (project: Project | null) => { setForm({ name: project?.name || '', description: project?.description || '', start_date: project?.start_date || '', end_date: project?.end_date || '' }); setEditing(project); };
  const save = useMutation({ mutationFn: () => editing ? endpoints.updateProject(editing.id, form) : endpoints.createProject(form), onSuccess: async () => { setEditing(undefined); await queryClient.invalidateQueries({ queryKey: ['projects'] }); }, onError: (error) => Alert.alert('Unable to save project', apiErrorMessage(error)) });
  const remove = useMutation({ mutationFn: (id: number) => endpoints.deleteProject(id), onSuccess: async () => { setEditing(undefined); await queryClient.invalidateQueries({ queryKey: ['projects'] }); }, onError: (error) => Alert.alert('Unable to delete project', apiErrorMessage(error)) });
  return (
    <Screen header={<PageHeader title="Projects" subtitle="Workspace delivery overview" action={canManage ? <Pressable accessibilityLabel="Create project" onPress={() => openEditor(null)} style={[styles.add, { backgroundColor: theme.primary }]}><Plus color="#ffffff" size={21} /></Pressable> : undefined} />}>
      {projects.isLoading ? <LoadingState label="Loading projects" /> : null}
      {projects.isError ? <ErrorState message={apiErrorMessage(projects.error)} onRetry={() => projects.refetch()} /> : null}
      {projects.data ? (
        <FlatList
          contentContainerStyle={styles.list}
          data={projects.data}
          keyExtractor={(item) => String(item.id)}
          onRefresh={() => projects.refetch()}
          refreshing={projects.isRefetching}
          renderItem={({ item }) => <ProjectRow onEdit={canManage ? () => openEditor(item) : undefined} project={item} />}
          ListEmptyComponent={<EmptyState title="No projects" message="Workspace projects will appear here." />}
        />
      ) : null}
      <Modal animationType="slide" onRequestClose={() => setEditing(undefined)} presentationStyle="pageSheet" visible={editing !== undefined}><View style={[styles.modal, { backgroundColor: theme.background }]}><PageHeader leading={<Pressable accessibilityLabel="Close editor" onPress={() => setEditing(undefined)} style={styles.close}><X color={theme.text} size={22} /></Pressable>} title={editing ? 'Edit project' : 'New project'} subtitle="Delivery dates and workspace context" /><ScrollView contentContainerStyle={styles.form}><ProjectField label="Name" onChangeText={(name) => setForm((value) => ({ ...value, name }))} value={form.name} /><ProjectField label="Description" multiline onChangeText={(description) => setForm((value) => ({ ...value, description }))} value={form.description} /><ProjectField label="Start date" onChangeText={(start_date) => setForm((value) => ({ ...value, start_date }))} placeholder="YYYY-MM-DD" value={form.start_date} /><ProjectField label="End date" onChangeText={(end_date) => setForm((value) => ({ ...value, end_date }))} placeholder="YYYY-MM-DD" value={form.end_date} /><PrimaryButton disabled={!form.name.trim() || save.isPending} label={save.isPending ? 'Saving...' : 'Save project'} onPress={() => save.mutate()} />{editing ? <Pressable onPress={() => Alert.alert('Delete project?', 'Sprints and project records may also be removed.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(editing.id) }])} style={styles.delete}><Trash2 color={theme.danger} size={18} /><Text style={{ color: theme.danger, fontWeight: '700' }}>Delete project</Text></Pressable> : null}</ScrollView></View></Modal>
    </Screen>
  );
}

function ProjectRow({ project, onEdit }: { project: Project; onEdit?: () => void }) {
  const theme = useAppTheme();
  const router = useRouter();
  return (
    <Pressable
      accessibilityLabel={`Open ${project.name}`}
      accessibilityRole="button"
      onLongPress={onEdit}
      onPress={() => router.push(`/projects/${project.id}`)}
      style={({ pressed }) => [styles.card, { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.72 : 1 }]}>
      <View style={[styles.icon, { backgroundColor: theme.surfaceMuted }]}><FolderKanban color={theme.primary} size={22} /></View>
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={[styles.title, { color: theme.text }]}>{project.name}</Text>
          <Text style={[styles.status, { color: project.status === 'completed' ? theme.success : theme.primary }]}>{project.status}</Text>
        </View>
        {project.description ? <Text numberOfLines={2} style={[styles.description, { color: theme.textMuted }]}>{project.description}</Text> : null}
        <Text style={[styles.meta, { color: theme.textMuted }]}>{project.sprint_count} sprints · {project.task_count} tasks</Text>
      </View>
      <ChevronRight color={theme.textMuted} size={20} />
    </Pressable>
  );
}

function ProjectField({ label, value, onChangeText, multiline, placeholder }: { label: string; value: string; onChangeText: (value: string) => void; multiline?: boolean; placeholder?: string }) { const theme = useAppTheme(); return <View><Text style={[styles.label, { color: theme.text }]}>{label}</Text><TextInput accessibilityLabel={label} multiline={multiline} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={theme.textMuted} style={[styles.field, multiline && styles.multiline, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]} value={value} /></View>; }

const styles = StyleSheet.create({
  list: { flexGrow: 1, gap: 10, padding: 20, paddingBottom: 36 },
  add: { alignItems: 'center', borderRadius: 8, height: 42, justifyContent: 'center', width: 42 },
  card: { alignItems: 'center', borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 12, padding: 14 },
  icon: { alignItems: 'center', borderRadius: 6, height: 42, justifyContent: 'center', width: 42 },
  copy: { flex: 1 },
  titleRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  title: { flex: 1, fontSize: 16, fontWeight: '700', paddingRight: 8 },
  status: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  description: { fontSize: 13, lineHeight: 18, marginTop: 5 },
  meta: { fontSize: 12, marginTop: 8 },
  modal: { flex: 1 }, close: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 }, form: { gap: 17, padding: 20 }, label: { fontSize: 13, fontWeight: '700', marginBottom: 7 }, field: { borderRadius: 8, borderWidth: 1, fontSize: 15, minHeight: 46, paddingHorizontal: 12, paddingVertical: 11 }, multiline: { minHeight: 110, textAlignVertical: 'top' }, delete: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 48 },
});
