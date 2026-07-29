import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ArrowLeft, LogIn, Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { apiErrorMessage } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { EntityRecord } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from '../components/Avatar';
import { PageHeader } from '../components/PageHeader';
import { Screen } from '../components/Screen';
import { EmptyState, ErrorState, LoadingState } from '../components/StateView';
import { useAppTheme } from '../theme';

export function OwnerAccessScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, startImpersonation } = useAuth();
  const [search, setSearch] = useState('');
  const people = useQuery({ queryKey: ['owner-access-users'], queryFn: () => endpoints.resource('/users', { per_page: 100 }) });
  const rows = useMemo(() => (people.data?.data || []).filter((row) => row.id !== user?.id && JSON.stringify(row).toLowerCase().includes(search.toLowerCase())), [people.data, search, user?.id]);
  const start = useMutation({
    mutationFn: (id: number) => startImpersonation(id),
    onSuccess: () => { queryClient.clear(); router.replace('/(tabs)/today' as never); },
    onError: (error) => Alert.alert('Unable to switch user', apiErrorMessage(error)),
  });

  return (
    <Screen header={<PageHeader leading={<Pressable accessibilityLabel="Back" onPress={() => router.back()} style={styles.iconButton}><ArrowLeft color={theme.text} size={22} /></Pressable>} title="View as user" subtitle="Audited owner impersonation" />}>
      <View style={[styles.notice, { backgroundColor: theme.surfaceMuted }]}><Text style={[styles.noticeTitle, { color: theme.text }]}>Use only for support and verification</Text><Text style={[styles.noticeText, { color: theme.textMuted }]}>Actions remain attributed to the owner session and can be stopped from the banner on every screen.</Text></View>
      <View style={[styles.search, { backgroundColor: theme.surface, borderColor: theme.border }]}><Search color={theme.textMuted} size={18} /><TextInput accessibilityLabel="Search workspace users" onChangeText={setSearch} placeholder="Search name, email, or role" placeholderTextColor={theme.textMuted} style={[styles.searchInput, { color: theme.text }]} value={search} /></View>
      {people.isLoading ? <LoadingState label="Loading workspace users" /> : null}
      {people.isError ? <ErrorState message={apiErrorMessage(people.error)} onRetry={() => people.refetch()} /> : null}
      {people.data ? <FlatList contentContainerStyle={styles.list} data={rows} keyExtractor={(item) => String(item.id)} ListEmptyComponent={<EmptyState title="No matching users" message="Try a different name or email." />} renderItem={({ item }) => <UserRow item={item} loading={start.isPending && start.variables === item.id} onPress={() => Alert.alert(`View as ${personName(item)}?`, 'You can return to your owner account from the persistent banner.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Continue', onPress: () => start.mutate(item.id) }])} />} /> : null}
    </Screen>
  );
}

function UserRow({ item, onPress, loading }: { item: EntityRecord; onPress: () => void; loading: boolean }) {
  const theme = useAppTheme();
  const name = personName(item);
  return <Pressable accessibilityRole="button" disabled={loading} onPress={onPress} style={[styles.row, { borderBottomColor: theme.border }]}><Avatar color={String(item.avatar_color || theme.primary)} name={name} size={44} uri={item.profile_picture ? String(item.profile_picture) : undefined} /><View style={styles.copy}><Text style={[styles.name, { color: theme.text }]}>{name}</Text><Text numberOfLines={1} style={[styles.meta, { color: theme.textMuted }]}>{String(item.email || '')} · {String(item.job_title || 'Member')}</Text></View><LogIn color={theme.primary} size={19} /></Pressable>;
}

function personName(item: EntityRecord) { return String(item.full_name || [item.first_name, item.last_name].filter(Boolean).join(' ') || `User ${item.id}`); }

const styles = StyleSheet.create({ iconButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 }, notice: { marginHorizontal: 20, marginTop: 14, padding: 13, borderRadius: 8 }, noticeTitle: { fontSize: 13, fontWeight: '800' }, noticeText: { fontSize: 11, lineHeight: 17, marginTop: 4 }, search: { alignItems: 'center', borderRadius: 8, borderWidth: 1, flexDirection: 'row', marginHorizontal: 20, marginTop: 12, paddingHorizontal: 12 }, searchInput: { flex: 1, fontSize: 14, minHeight: 44, paddingHorizontal: 9 }, list: { paddingHorizontal: 20, paddingBottom: 42, paddingTop: 8 }, row: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 12, minHeight: 72 }, copy: { flex: 1 }, name: { fontSize: 15, fontWeight: '800' }, meta: { fontSize: 11, marginTop: 4 } });
