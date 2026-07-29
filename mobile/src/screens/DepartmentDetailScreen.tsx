import { FlashList } from '@shopify/flash-list';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Check, Search, UserRoundCog, Users, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { absoluteAssetUrl, apiErrorMessage } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { EntityRecord } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from '../components/Avatar';
import { PageHeader } from '../components/PageHeader';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { EmptyState, ErrorState, LoadingState } from '../components/StateView';
import { useAppTheme } from '../theme';

export function DepartmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const departmentId = Number(id);
  const theme = useAppTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const writable = !user?.demo_account && Boolean(user?.permissions?.includes('departments.manage'));
  const [assigning, setAssigning] = useState(false);
  const department = useQuery({ queryKey: ['department', departmentId], queryFn: () => endpoints.department(departmentId), enabled: Number.isFinite(departmentId) });
  const users = useQuery({ queryKey: ['users', 'department-members'], queryFn: () => endpoints.users(), enabled: assigning });

  return <Screen header={<PageHeader leading={<Pressable accessibilityLabel="Back" onPress={() => router.back()} style={styles.iconButton}><ArrowLeft color={theme.text} size={22} /></Pressable>} title={department.data?.name || 'Department'} subtitle={department.data?.manager ? `Managed by ${department.data.manager.full_name}` : 'People and reporting structure'} action={writable ? <Pressable accessibilityLabel="Manage department members" onPress={() => setAssigning(true)} style={[styles.add, { backgroundColor: theme.primary }]}><UserRoundCog color="#ffffff" size={20} /></Pressable> : undefined} />}>
    {department.isLoading ? <LoadingState label="Loading department" /> : null}
    {department.isError ? <ErrorState message={apiErrorMessage(department.error)} onRetry={() => department.refetch()} /> : null}
    {department.data ? <View style={styles.flex}><View style={[styles.summary, { backgroundColor: theme.surface, borderColor: theme.border }]}><View style={[styles.summaryIcon, { backgroundColor: theme.surfaceMuted }]}><Users color={theme.primary} size={23} /></View><View style={styles.flex}><Text style={[styles.count, { color: theme.text }]}>{department.data.users_count} {department.data.users_count === 1 ? 'person' : 'people'}</Text><Text numberOfLines={2} style={[styles.description, { color: theme.textMuted }]}>{department.data.description || 'Workspace department'}</Text></View></View><FlashList contentContainerStyle={styles.list} data={department.data.members || []} keyExtractor={(item) => String(item.id)} ListEmptyComponent={<EmptyState title="No department members" message="Assign workspace people to build this department." />} renderItem={({ item }) => <View style={[styles.member, { borderBottomColor: theme.border }]}><Avatar name={item.full_name} size={44} uri={absoluteAssetUrl(item.profile_picture_url)} /><View style={styles.copy}><Text style={[styles.name, { color: theme.text }]}>{item.full_name}</Text><Text style={[styles.meta, { color: theme.textMuted }]}>{item.job_title || item.email}</Text></View>{department.data?.manager_id === item.id ? <Text style={[styles.manager, { color: theme.primary }]}>MANAGER</Text> : null}</View>} /></View> : null}
    <MemberAssignment departmentId={departmentId} initialIds={(department.data?.members || []).map((member) => member.id)} onClose={() => setAssigning(false)} onSaved={async () => { setAssigning(false); await queryClient.invalidateQueries({ queryKey: ['department', departmentId] }); await queryClient.invalidateQueries({ queryKey: ['departments'] }); }} users={users.data?.data || []} visible={assigning} />
  </Screen>;
}

function MemberAssignment({ departmentId, initialIds, onClose, onSaved, users, visible }: { departmentId: number; initialIds: number[]; onClose: () => void; onSaved: () => Promise<unknown>; users: EntityRecord[]; visible: boolean }) {
  const theme = useAppTheme();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  useEffect(() => { if (visible) { setSelected(new Set(initialIds)); setSearch(''); } }, [visible, initialIds.join(',')]);
  const rows = useMemo(() => users.filter((person) => `${person.name || person.full_name || ''} ${person.email || ''}`.toLowerCase().includes(search.toLowerCase())), [search, users]);
  const save = useMutation({ mutationFn: () => endpoints.updateDepartmentMembers(departmentId, [...selected]), onSuccess: onSaved, onError: (error) => Alert.alert('Unable to update members', apiErrorMessage(error)) });
  const toggle = (id: number) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  return <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={visible}><View style={[styles.modal, { backgroundColor: theme.background }]}><View style={[styles.modalHeader, { borderBottomColor: theme.border }]}><Pressable accessibilityLabel="Close member assignment" onPress={onClose} style={styles.iconButton}><X color={theme.text} size={22} /></Pressable><View><Text style={[styles.modalTitle, { color: theme.text }]}>Department members</Text><Text style={[styles.modalSubtitle, { color: theme.textMuted }]}>{selected.size} selected</Text></View><View style={styles.iconButton} /></View><View style={[styles.search, { backgroundColor: theme.surface, borderColor: theme.border }]}><Search color={theme.textMuted} size={18} /><TextInput accessibilityLabel="Search people" onChangeText={setSearch} placeholder="Search people" placeholderTextColor={theme.textMuted} style={[styles.searchInput, { color: theme.text }]} value={search} /></View><FlashList contentContainerStyle={styles.assignmentList} data={rows} keyExtractor={(item) => String(item.id)} ListEmptyComponent={<EmptyState title="No people found" message="Try another search." />} renderItem={({ item }) => { const checked = selected.has(item.id); const name = String(item.name || item.full_name || item.email); return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => toggle(item.id)} style={[styles.assignmentRow, { borderBottomColor: theme.border }]}><Avatar color={String(item.avatar_color || theme.primary)} name={name} size={40} uri={absoluteAssetUrl(item.profile_picture as string)} /><View style={styles.copy}><Text style={[styles.name, { color: theme.text }]}>{name}</Text><Text style={[styles.meta, { color: theme.textMuted }]}>{String(item.job_title || item.email || '')}</Text></View><View style={[styles.checkbox, { backgroundColor: checked ? theme.primary : 'transparent', borderColor: checked ? theme.primary : theme.border }]}>{checked ? <Check color="#ffffff" size={16} /> : null}</View></Pressable>; }} /><View style={[styles.footer, { backgroundColor: theme.background, borderTopColor: theme.border }]}><PrimaryButton label="Save members" loading={save.isPending} onPress={() => save.mutate()} /></View></View></Modal>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, iconButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 }, add: { alignItems: 'center', borderRadius: 8, height: 42, justifyContent: 'center', width: 42 }, summary: { alignItems: 'center', borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 12, margin: 20, marginBottom: 4, minHeight: 82, padding: 13 }, summaryIcon: { alignItems: 'center', borderRadius: 8, height: 48, justifyContent: 'center', width: 48 }, count: { fontSize: 17, fontWeight: '800' }, description: { fontSize: 12, lineHeight: 17, marginTop: 4 }, list: { paddingHorizontal: 20, paddingBottom: 44 }, member: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 11, minHeight: 72 }, copy: { flex: 1 }, name: { fontSize: 14, fontWeight: '800' }, meta: { fontSize: 12, marginTop: 4 }, manager: { fontSize: 9, fontWeight: '900' },
  modal: { flex: 1 }, modalHeader: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', minHeight: 66, paddingHorizontal: 10 }, modalTitle: { fontSize: 17, fontWeight: '800', textAlign: 'center' }, modalSubtitle: { fontSize: 11, marginTop: 2, textAlign: 'center' }, search: { alignItems: 'center', borderRadius: 8, borderWidth: 1, flexDirection: 'row', margin: 16, marginBottom: 4, paddingLeft: 12 }, searchInput: { flex: 1, fontSize: 14, minHeight: 44, paddingHorizontal: 9 }, assignmentList: { paddingHorizontal: 16, paddingBottom: 20 }, assignmentRow: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 11, minHeight: 68 }, checkbox: { alignItems: 'center', borderRadius: 5, borderWidth: 1.5, height: 24, justifyContent: 'center', width: 24 }, footer: { borderTopWidth: StyleSheet.hairlineWidth, padding: 14 },
});
