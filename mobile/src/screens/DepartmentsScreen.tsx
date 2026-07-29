import { Picker } from '@react-native-picker/picker';
import { FlashList } from '@shopify/flash-list';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ArrowLeft, Building2, ChevronRight, Pencil, Plus, Search, Trash2, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { apiErrorMessage } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { Department, EntityRecord } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from '../components/Avatar';
import { PageHeader } from '../components/PageHeader';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { EmptyState, ErrorState, LoadingState } from '../components/StateView';
import { useAppTheme } from '../theme';

export function DepartmentsScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const writable = !user?.demo_account && Boolean(user?.permissions?.includes('departments.manage'));
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Department | null | undefined>(undefined);
  const departments = useQuery({ queryKey: ['departments'], queryFn: endpoints.departments });
  const users = useQuery({ queryKey: ['users', 'department-manager-picker'], queryFn: () => endpoints.users(), enabled: editing !== undefined && writable });
  const rows = useMemo(() => (departments.data?.data || []).filter((department) => `${department.name} ${department.description || ''} ${department.manager?.full_name || ''}`.toLowerCase().includes(search.toLowerCase())), [departments.data, search]);

  return <Screen header={<PageHeader leading={<Pressable accessibilityLabel="Back" onPress={() => router.back()} style={styles.iconButton}><ArrowLeft color={theme.text} size={22} /></Pressable>} title="Departments" subtitle="Structure, managers, and membership" action={writable ? <Pressable accessibilityLabel="Create department" onPress={() => setEditing(null)} style={[styles.add, { backgroundColor: theme.primary }]}><Plus color="#ffffff" size={21} /></Pressable> : undefined} />}>
    <View style={[styles.search, { backgroundColor: theme.surface, borderColor: theme.border }]}><Search color={theme.textMuted} size={18} /><TextInput accessibilityLabel="Search departments" onChangeText={setSearch} placeholder="Search departments" placeholderTextColor={theme.textMuted} style={[styles.searchInput, { color: theme.text }]} value={search} />{search ? <Pressable accessibilityLabel="Clear search" onPress={() => setSearch('')} style={styles.clear}><X color={theme.textMuted} size={18} /></Pressable> : null}</View>
    {departments.isLoading ? <LoadingState label="Loading departments" /> : null}
    {departments.isError ? <ErrorState message={apiErrorMessage(departments.error)} onRetry={() => departments.refetch()} /> : null}
    {departments.data ? <FlashList contentContainerStyle={styles.list} data={rows} keyExtractor={(item) => String(item.id)} onRefresh={() => departments.refetch()} refreshing={departments.isRefetching} ListEmptyComponent={<EmptyState title="No departments" message={search ? 'Try another search.' : 'Departments will appear here once configured.'} />} renderItem={({ item }) => <DepartmentRow department={item} editable={writable} onEdit={() => setEditing(item)} onOpen={() => router.push(`/more/departments/${item.id}` as never)} />} /> : null}
    <DepartmentEditor editing={editing} onClose={() => setEditing(undefined)} onSaved={async () => { setEditing(undefined); await queryClient.invalidateQueries({ queryKey: ['departments'] }); }} users={users.data?.data || []} />
  </Screen>;
}

function DepartmentRow({ department, editable, onEdit, onOpen }: { department: Department; editable: boolean; onEdit: () => void; onOpen: () => void }) {
  const theme = useAppTheme();
  return <View style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}><Pressable accessibilityLabel={`Open ${department.name}`} onPress={onOpen} style={styles.rowMain}><View style={[styles.departmentIcon, { backgroundColor: theme.surfaceMuted }]}><Building2 color={theme.primary} size={21} /></View><View style={styles.copy}><Text numberOfLines={1} style={[styles.name, { color: theme.text }]}>{department.name}</Text><Text numberOfLines={1} style={[styles.meta, { color: theme.textMuted }]}>{department.users_count} {department.users_count === 1 ? 'person' : 'people'}{department.manager ? ` · ${department.manager.full_name}` : ''}</Text>{department.members_preview?.length ? <View style={styles.avatarStrip}>{department.members_preview.slice(0, 5).map((member) => <View key={member.id} style={styles.avatarOverlap}><Avatar name={member.full_name} size={24} uri={member.profile_picture_url} /></View>)}</View> : null}</View><ChevronRight color={theme.textMuted} size={19} /></Pressable>{editable ? <Pressable accessibilityLabel={`Edit ${department.name}`} onPress={onEdit} style={styles.iconButton}><Pencil color={theme.textMuted} size={17} /></Pressable> : null}</View>;
}

function DepartmentEditor({ editing, onClose, onSaved, users }: { editing: Department | null | undefined; onClose: () => void; onSaved: () => Promise<unknown>; users: EntityRecord[] }) {
  const theme = useAppTheme();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [managerId, setManagerId] = useState(0);
  const initialize = () => { setName(editing?.name || ''); setDescription(editing?.description || ''); setManagerId(editing?.manager_id || 0); };
  const save = useMutation({ mutationFn: () => { const input = { name: name.trim(), description, manager_id: managerId || null }; return editing ? endpoints.updateDepartment(editing.id, input) : endpoints.createDepartment(input); }, onSuccess: onSaved, onError: (error) => Alert.alert('Unable to save department', apiErrorMessage(error)) });
  const remove = useMutation({ mutationFn: () => endpoints.deleteDepartment(editing!.id), onSuccess: onSaved, onError: (error) => Alert.alert('Unable to delete department', apiErrorMessage(error)) });
  return <Modal animationType="slide" onShow={initialize} onRequestClose={onClose} presentationStyle="pageSheet" visible={editing !== undefined}><View style={[styles.modal, { backgroundColor: theme.background }]}><View style={[styles.modalHeader, { borderBottomColor: theme.border }]}><Pressable accessibilityLabel="Close department editor" onPress={onClose} style={styles.iconButton}><X color={theme.text} size={22} /></Pressable><Text style={[styles.modalTitle, { color: theme.text }]}>{editing ? 'Edit department' : 'New department'}</Text><View style={styles.iconButton} /></View><ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled"><Field label="Department name" value={name} onChangeText={setName} /><Field label="Description" multiline value={description} onChangeText={setDescription} /><View><Text style={[styles.label, { color: theme.text }]}>Manager</Text><View style={[styles.picker, { backgroundColor: theme.surface, borderColor: theme.border }]}><Picker selectedValue={managerId} onValueChange={(value) => setManagerId(Number(value))} style={{ color: theme.text }}><Picker.Item label="No manager" value={0} />{users.map((person) => <Picker.Item key={person.id} label={String(person.name || person.full_name || person.email)} value={person.id} />)}</Picker></View></View><PrimaryButton disabled={!name.trim()} label="Save department" loading={save.isPending} onPress={() => save.mutate()} />{editing ? <Pressable onPress={() => Alert.alert(`Delete ${editing.name}?`, 'Members will remain in the workspace without a department.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => remove.mutate() }])} style={styles.delete}><Trash2 color={theme.danger} size={18} /><Text style={{ color: theme.danger, fontWeight: '800' }}>Delete department</Text></Pressable> : null}</ScrollView></View></Modal>;
}

function Field({ label, value, onChangeText, multiline }: { label: string; value: string; onChangeText: (value: string) => void; multiline?: boolean }) { const theme = useAppTheme(); return <View><Text style={[styles.label, { color: theme.text }]}>{label}</Text><TextInput accessibilityLabel={label} multiline={multiline} onChangeText={onChangeText} style={[styles.field, multiline && styles.multiline, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]} value={value} /></View>; }

const styles = StyleSheet.create({
  iconButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 }, add: { alignItems: 'center', borderRadius: 8, height: 42, justifyContent: 'center', width: 42 }, search: { alignItems: 'center', borderRadius: 8, borderWidth: 1, flexDirection: 'row', marginHorizontal: 20, marginTop: 14, paddingLeft: 12 }, searchInput: { flex: 1, fontSize: 14, minHeight: 44, paddingHorizontal: 9 }, clear: { alignItems: 'center', height: 44, justifyContent: 'center', width: 40 }, list: { padding: 20, paddingBottom: 44 },
  row: { alignItems: 'center', borderRadius: 8, borderWidth: 1, flexDirection: 'row', marginBottom: 9, minHeight: 86 }, rowMain: { alignItems: 'center', flex: 1, flexDirection: 'row', minHeight: 84, paddingLeft: 12 }, departmentIcon: { alignItems: 'center', borderRadius: 8, height: 44, justifyContent: 'center', marginRight: 12, width: 44 }, copy: { flex: 1 }, name: { fontSize: 15, fontWeight: '800' }, meta: { fontSize: 12, marginTop: 4 }, avatarStrip: { flexDirection: 'row', height: 25, marginLeft: 4, marginTop: 7 }, avatarOverlap: { marginLeft: -4 },
  modal: { flex: 1 }, modalHeader: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', minHeight: 62, paddingHorizontal: 10 }, modalTitle: { fontSize: 17, fontWeight: '800' }, form: { gap: 18, padding: 20, paddingBottom: 44 }, label: { fontSize: 13, fontWeight: '800', marginBottom: 7 }, field: { borderRadius: 8, borderWidth: 1, fontSize: 15, minHeight: 47, paddingHorizontal: 12, paddingVertical: 11 }, multiline: { minHeight: 112, textAlignVertical: 'top' }, picker: { borderRadius: 8, borderWidth: 1, minHeight: 52, overflow: 'hidden' }, delete: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 48 },
});
