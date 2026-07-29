import { FlashList } from '@shopify/flash-list';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ArrowLeft, ChevronRight, Pencil, Plus, Search, Trash2, Users, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { apiErrorMessage } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { Team } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from '../components/Avatar';
import { PageHeader } from '../components/PageHeader';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { EmptyState, ErrorState, LoadingState } from '../components/StateView';
import { useAppTheme } from '../theme';

export function TeamsScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const writable = !user?.demo_account && Boolean(user?.permissions?.includes('teams.manage'));
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Team | null | undefined>(undefined);
  const teams = useQuery({ queryKey: ['teams'], queryFn: endpoints.teams });
  const rows = useMemo(() => (teams.data?.data || []).filter((team) => `${team.name} ${team.description || ''}`.toLowerCase().includes(search.toLowerCase())), [search, teams.data]);

  return <Screen header={<PageHeader leading={<Pressable accessibilityLabel="Back" onPress={() => router.back()} style={styles.iconButton}><ArrowLeft color={theme.text} size={22} /></Pressable>} title="Teams" subtitle="Members, capabilities, and goals" action={writable ? <Pressable accessibilityLabel="Create team" onPress={() => setEditing(null)} style={[styles.add, { backgroundColor: theme.primary }]}><Plus color="#ffffff" size={21} /></Pressable> : undefined} />}>
    <View style={[styles.search, { backgroundColor: theme.surface, borderColor: theme.border }]}><Search color={theme.textMuted} size={18} /><TextInput accessibilityLabel="Search teams" onChangeText={setSearch} placeholder="Search teams" placeholderTextColor={theme.textMuted} style={[styles.searchInput, { color: theme.text }]} value={search} />{search ? <Pressable accessibilityLabel="Clear search" onPress={() => setSearch('')} style={styles.clear}><X color={theme.textMuted} size={18} /></Pressable> : null}</View>
    {teams.isLoading ? <LoadingState label="Loading teams" /> : null}
    {teams.isError ? <ErrorState message={apiErrorMessage(teams.error)} onRetry={() => teams.refetch()} /> : null}
    {teams.data ? <FlashList contentContainerStyle={styles.list} data={rows} keyExtractor={(item) => String(item.id)} onRefresh={() => teams.refetch()} refreshing={teams.isRefetching} ListEmptyComponent={<EmptyState title="No teams" message={search ? 'Try another search.' : 'Teams will appear here as your workspace grows.'} />} renderItem={({ item }) => <TeamRow team={item} editable={writable} onEdit={() => setEditing(item)} onOpen={() => router.push(`/more/teams/${item.id}` as never)} />} /> : null}
    <TeamEditor editing={editing} onClose={() => setEditing(undefined)} onSaved={async () => { setEditing(undefined); await queryClient.invalidateQueries({ queryKey: ['teams'] }); }} />
  </Screen>;
}

function TeamRow({ team, editable, onEdit, onOpen }: { team: Team; editable: boolean; onEdit: () => void; onOpen: () => void }) {
  const theme = useAppTheme();
  return <View style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}><Pressable accessibilityLabel={`Open ${team.name}`} onPress={onOpen} style={styles.rowMain}><View style={[styles.teamIcon, { backgroundColor: theme.surfaceMuted }]}><Users color={theme.primary} size={21} /></View><View style={styles.copy}><Text numberOfLines={1} style={[styles.name, { color: theme.text }]}>{team.name}</Text><Text numberOfLines={1} style={[styles.meta, { color: theme.textMuted }]}>{team.users.length} {team.users.length === 1 ? 'member' : 'members'}{team.description ? ` · ${team.description}` : ''}</Text><View style={styles.avatarStrip}>{team.users.slice(0, 4).map((member) => <View key={member.id} style={styles.avatarOverlap}><Avatar color={member.avatar_color} name={member.name} size={24} uri={member.profile_picture} /></View>)}</View></View><ChevronRight color={theme.textMuted} size={19} /></Pressable>{editable ? <Pressable accessibilityLabel={`Edit ${team.name}`} onPress={onEdit} style={styles.iconButton}><Pencil color={theme.textMuted} size={17} /></Pressable> : null}</View>;
}

function TeamEditor({ editing, onClose, onSaved }: { editing: Team | null | undefined; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const theme = useAppTheme();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const visible = editing !== undefined;
  const open = () => { setName(editing?.name || ''); setDescription(editing?.description || ''); };
  const save = useMutation({ mutationFn: () => editing ? endpoints.updateTeam(editing.id, { name: name.trim(), description }) : endpoints.createTeam({ name: name.trim(), description }), onSuccess: onSaved, onError: (error) => Alert.alert('Unable to save team', apiErrorMessage(error)) });
  const remove = useMutation({ mutationFn: () => endpoints.deleteTeam(editing!.id), onSuccess: onSaved, onError: (error) => Alert.alert('Unable to delete team', apiErrorMessage(error)) });
  return <Modal animationType="slide" onShow={open} onRequestClose={onClose} presentationStyle="pageSheet" visible={visible}><View style={[styles.modal, { backgroundColor: theme.background }]}><View style={[styles.modalHeader, { borderBottomColor: theme.border }]}><Pressable accessibilityLabel="Close team editor" onPress={onClose} style={styles.iconButton}><X color={theme.text} size={22} /></Pressable><Text style={[styles.modalTitle, { color: theme.text }]}>{editing ? 'Edit team' : 'New team'}</Text><View style={styles.iconButton} /></View><View style={styles.form}><Field label="Team name" value={name} onChangeText={setName} /><Field label="Description" multiline value={description} onChangeText={setDescription} /><PrimaryButton disabled={!name.trim()} label="Save team" loading={save.isPending} onPress={() => save.mutate()} />{editing ? <Pressable accessibilityRole="button" onPress={() => Alert.alert(`Delete ${editing.name}?`, 'Members will be removed from this team.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => remove.mutate() }])} style={styles.delete}><Trash2 color={theme.danger} size={18} /><Text style={{ color: theme.danger, fontWeight: '800' }}>Delete team</Text></Pressable> : null}</View></View></Modal>;
}

function Field({ label, value, onChangeText, multiline }: { label: string; value: string; onChangeText: (value: string) => void; multiline?: boolean }) {
  const theme = useAppTheme();
  return <View><Text style={[styles.label, { color: theme.text }]}>{label}</Text><TextInput accessibilityLabel={label} multiline={multiline} onChangeText={onChangeText} style={[styles.field, multiline && styles.multiline, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]} value={value} /></View>;
}

const styles = StyleSheet.create({
  iconButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  add: { alignItems: 'center', borderRadius: 8, height: 42, justifyContent: 'center', width: 42 },
  search: { alignItems: 'center', borderRadius: 8, borderWidth: 1, flexDirection: 'row', marginHorizontal: 20, marginTop: 14, paddingLeft: 12 },
  searchInput: { flex: 1, fontSize: 14, minHeight: 44, paddingHorizontal: 9 },
  clear: { alignItems: 'center', height: 44, justifyContent: 'center', width: 40 },
  list: { padding: 20, paddingBottom: 44 },
  row: { alignItems: 'center', borderRadius: 8, borderWidth: 1, flexDirection: 'row', marginBottom: 9, minHeight: 86 },
  rowMain: { alignItems: 'center', flex: 1, flexDirection: 'row', minHeight: 84, paddingLeft: 12 },
  teamIcon: { alignItems: 'center', borderRadius: 8, height: 44, justifyContent: 'center', marginRight: 12, width: 44 },
  copy: { flex: 1 },
  name: { fontSize: 15, fontWeight: '800' },
  meta: { fontSize: 12, marginTop: 4 },
  avatarStrip: { flexDirection: 'row', height: 25, marginLeft: 4, marginTop: 7 },
  avatarOverlap: { marginLeft: -4 },
  modal: { flex: 1 },
  modalHeader: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', minHeight: 62, paddingHorizontal: 10 },
  modalTitle: { fontSize: 17, fontWeight: '800' },
  form: { gap: 18, padding: 20 },
  label: { fontSize: 13, fontWeight: '800', marginBottom: 7 },
  field: { borderRadius: 8, borderWidth: 1, fontSize: 15, minHeight: 47, paddingHorizontal: 12, paddingVertical: 11 },
  multiline: { minHeight: 112, textAlignVertical: 'top' },
  delete: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 48 },
});
