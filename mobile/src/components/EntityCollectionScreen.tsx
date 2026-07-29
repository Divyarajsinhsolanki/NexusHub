import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import { ArrowLeft, Pencil, Plus, Search, Trash2, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { apiErrorMessage } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { EntityRecord } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { draftStore } from '../storage/draftStore';
import { useAppTheme } from '../theme';
import { PageHeader } from './PageHeader';
import { PrimaryButton } from './PrimaryButton';
import { Screen } from './Screen';
import { EmptyState, ErrorState, LoadingState } from './StateView';

export type EntityField = { key: string; label: string; multiline?: boolean; placeholder?: string };
type Props = {
  title: string;
  subtitle: string;
  path: string;
  wrapper: string;
  fields: EntityField[];
  primary: string;
  secondary?: string[];
  canWrite?: boolean;
  params?: Record<string, unknown>;
  defaults?: Record<string, unknown>;
};

export function EntityCollectionScreen({ title, subtitle, path, wrapper, fields, primary, secondary = [], canWrite = true, params = {}, defaults = {} }: Props) {
  const theme = useAppTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const writable = canWrite && !user?.demo_account;
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<EntityRecord | null | undefined>(undefined);
  const [form, setForm] = useState<Record<string, string>>({});
  const query = useQuery({ queryKey: ['resource', path, params], queryFn: () => endpoints.resource(path, params) });
  const draftIdentity = useMemo(() => user ? { key: `entity:${path}`, userId: user.id, workspaceId: user.workspace.id } : null, [path, user?.id, user?.workspace.id]);
  const fieldSignature = fields.map((field) => field.key).join(':');
  const rows = useMemo(() => (query.data?.data || []).filter((row) => JSON.stringify(row).toLowerCase().includes(search.toLowerCase())), [query.data, search]);

  useEffect(() => {
    if (editing === undefined) return;
    const fromRecord = Object.fromEntries(fields.map((field) => [field.key, String(editing?.[field.key] ?? '')]));
    if (editing || !draftIdentity) { setForm(fromRecord); return; }
    void draftStore.get<Record<string, string>>(draftIdentity).then((draft) => setForm(draft || fromRecord));
  }, [editing, fieldSignature, draftIdentity]);

  const save = useMutation({
    mutationFn: () => editing?.id
      ? endpoints.updateResource(path, editing.id, wrapper, { ...defaults, ...form })
      : endpoints.createResource(path, wrapper, { ...defaults, ...form }),
    onSuccess: async () => {
      if (draftIdentity) await draftStore.remove(draftIdentity);
      setEditing(undefined);
      await queryClient.invalidateQueries({ queryKey: ['resource', path] });
    },
    onError: (error) => Alert.alert(`Unable to save ${title.toLowerCase()}`, apiErrorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: (id: number) => endpoints.deleteResource(path, id),
    onSuccess: async () => {
      setEditing(undefined);
      await queryClient.invalidateQueries({ queryKey: ['resource', path] });
    },
    onError: (error) => Alert.alert('Unable to delete', apiErrorMessage(error)),
  });
  const updateField = (key: string, value: string) => {
    const next = { ...form, [key]: value };
    setForm(next);
    if (!editing && draftIdentity) void draftStore.set(draftIdentity, next);
  };

  return <Screen header={<PageHeader leading={<Pressable accessibilityLabel="Back" onPress={() => router.back()} style={styles.iconButton}><ArrowLeft color={theme.text} size={22} /></Pressable>} title={title} subtitle={subtitle} action={writable ? <Pressable accessibilityLabel={`Create ${title}`} onPress={() => setEditing(null)} style={[styles.createButton, { backgroundColor: theme.primary }]}><Plus color="#ffffff" size={21} /></Pressable> : undefined} />}>
    <View style={[styles.search, { backgroundColor: theme.surface, borderColor: theme.border }]}><Search color={theme.textMuted} size={18} /><TextInput accessibilityLabel={`Search ${title}`} onChangeText={setSearch} placeholder={`Search ${title.toLowerCase()}`} placeholderTextColor={theme.textMuted} style={[styles.searchInput, { color: theme.text }]} value={search} />{search ? <Pressable accessibilityLabel="Clear search" onPress={() => setSearch('')}><X color={theme.textMuted} size={18} /></Pressable> : null}</View>
    {query.isLoading ? <LoadingState /> : null}
    {query.isError ? <ErrorState message={apiErrorMessage(query.error)} onRetry={() => query.refetch()} /> : null}
    {query.data ? <FlashList contentContainerStyle={styles.list} data={rows} keyExtractor={(item) => String(item.id)} onRefresh={() => query.refetch()} refreshing={query.isRefetching} ListEmptyComponent={<EmptyState title={`No ${title.toLowerCase()}`} message={search ? 'Try another search.' : `Workspace ${title.toLowerCase()} will appear here.`} />} renderItem={({ item }) => <Pressable accessibilityRole={writable ? 'button' : undefined} onPress={writable ? () => setEditing(item) : undefined} style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}><View style={[styles.monogram, { backgroundColor: theme.surfaceMuted }]}><Text style={{ color: theme.primary, fontWeight: '800' }}>{String(item[primary] || title).charAt(0).toUpperCase()}</Text></View><View style={styles.copy}><Text numberOfLines={1} style={[styles.name, { color: theme.text }]}>{String(item[primary] || `${title} ${item.id}`)}</Text><Text numberOfLines={2} style={[styles.meta, { color: theme.textMuted }]}>{secondary.map((key) => readableValue(item[key])).filter(Boolean).join(' · ') || `Record ${item.id}`}</Text></View>{writable ? <Pencil color={theme.textMuted} size={17} /> : null}</Pressable>} /> : null}
    <Modal animationType="slide" onRequestClose={() => setEditing(undefined)} presentationStyle="pageSheet" visible={editing !== undefined}><View style={[styles.modal, { backgroundColor: theme.background }]}><View style={[styles.modalHeader, { borderBottomColor: theme.border }]}><Pressable accessibilityLabel="Close editor" onPress={() => setEditing(undefined)} style={styles.iconButton}><X color={theme.text} size={22} /></Pressable><Text style={[styles.modalTitle, { color: theme.text }]}>{editing ? `Edit ${title}` : `New ${title}`}</Text><View style={styles.iconButton} /></View><View style={styles.form}>{fields.map((field) => <View key={field.key}><Text style={[styles.label, { color: theme.text }]}>{field.label}</Text><TextInput accessibilityLabel={field.label} multiline={field.multiline} onChangeText={(value) => updateField(field.key, value)} placeholder={field.placeholder} placeholderTextColor={theme.textMuted} style={[styles.field, field.multiline && styles.multiline, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]} value={form[field.key] || ''} /></View>)}<PrimaryButton disabled={save.isPending || !form[primary]?.trim()} label={save.isPending ? 'Saving...' : 'Save'} onPress={() => save.mutate()} />{editing ? <Pressable accessibilityRole="button" onPress={() => Alert.alert(`Delete ${String(editing[primary] || title)}?`, 'This cannot be undone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(editing.id) }])} style={styles.delete}><Trash2 color={theme.danger} size={18} /><Text style={{ color: theme.danger, fontWeight: '700' }}>Delete</Text></Pressable> : null}</View></View></Modal>
  </Screen>;
}

function readableValue(value: unknown) {
  if (Array.isArray(value)) return `${value.length} members`;
  if (typeof value === 'object' && value) return '';
  return value == null ? '' : String(value);
}

const styles = StyleSheet.create({
  iconButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  createButton: { alignItems: 'center', borderRadius: 8, height: 42, justifyContent: 'center', width: 42 },
  search: { alignItems: 'center', borderRadius: 8, borderWidth: 1, flexDirection: 'row', marginHorizontal: 20, marginTop: 14, paddingHorizontal: 12 },
  searchInput: { flex: 1, fontSize: 14, minHeight: 44, paddingHorizontal: 9 },
  list: { padding: 20, paddingBottom: 40 },
  row: { alignItems: 'center', borderRadius: 8, borderWidth: 1, flexDirection: 'row', marginBottom: 9, minHeight: 72, padding: 12 },
  monogram: { alignItems: 'center', borderRadius: 8, height: 42, justifyContent: 'center', marginRight: 12, width: 42 },
  copy: { flex: 1, marginRight: 10 },
  name: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  modal: { flex: 1 },
  modalHeader: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', minHeight: 62, paddingHorizontal: 10 },
  modalTitle: { fontSize: 17, fontWeight: '800' },
  form: { gap: 17, padding: 20 },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 7 },
  field: { borderRadius: 8, borderWidth: 1, fontSize: 15, minHeight: 46, paddingHorizontal: 12, paddingVertical: 11 },
  multiline: { minHeight: 112, textAlignVertical: 'top' },
  delete: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 48 },
});
