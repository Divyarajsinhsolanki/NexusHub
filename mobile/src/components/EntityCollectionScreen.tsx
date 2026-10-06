import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import { ArrowLeft, Pencil, Plus, Search, Trash2, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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

export type EntityField = { key: string; label: string; multiline?: boolean; placeholder?: string; required?: boolean; createOnly?: boolean; secure?: boolean; keyboardType?: 'default' | 'email-address' | 'numeric' };
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
  renderEditFooter?: (record: EntityRecord) => ReactNode;
};

export function EntityCollectionScreen({ title, subtitle, path, wrapper, fields, primary, secondary = [], canWrite = true, params = {}, defaults = {}, renderEditFooter }: Props) {
  const theme = useAppTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const writable = Boolean(user) && canWrite && !user?.demo_account;
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<EntityRecord | null | undefined>(undefined);
  const [form, setForm] = useState<Record<string, string>>({});
  const [restoringDraft, setRestoringDraft] = useState(false);
  const query = useQuery({ queryKey: ['resource', path, params], queryFn: () => endpoints.resource(path, params) });
  const draftIdentity = useMemo(() => user ? { key: `entity:${path}`, userId: user.id, workspaceId: user.workspace.id } : null, [path, user?.id, user?.workspace.id]);
  const fieldSignature = fields.map((field) => field.key).join(':');
  const visibleFields = fields.filter((field) => !editing || !field.createOnly);
  const requiredFields = visibleFields.filter((field) => field.required);
  const valid = (requiredFields.length ? requiredFields : visibleFields.slice(0, 1)).every((field) => Boolean(form[field.key]?.trim()))
    && (!visibleFields.some((field) => field.key === 'password_confirmation') || form.password === form.password_confirmation);
  const rows = useMemo(() => (query.data?.data || []).filter((row) => JSON.stringify(row).toLowerCase().includes(search.toLowerCase())), [query.data, search]);

  useEffect(() => {
    if (editing === undefined) return;
    let cancelled = false;
    const fromRecord = Object.fromEntries(fields.map((field) => [field.key, String(editing?.[field.key] ?? '')]));
    setForm(fromRecord);
    if (editing || !draftIdentity) { setRestoringDraft(false); return; }
    setRestoringDraft(true);
    void draftStore.get<Record<string, string>>(draftIdentity)
      .then((draft) => {
        if (!cancelled && draft) setForm(Object.fromEntries(fields.map((field) => [field.key, field.secure ? '' : typeof draft[field.key] === 'string' ? draft[field.key] : ''])));
      })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setRestoringDraft(false); });
    return () => { cancelled = true; };
  }, [editing, fieldSignature, draftIdentity]);

  const save = useMutation({
    mutationFn: () => editing?.id
      ? endpoints.updateResource(path, editing.id, wrapper, { ...defaults, ...Object.fromEntries(visibleFields.map((field) => [field.key, form[field.key]])) })
      : endpoints.createResource(path, wrapper, { ...defaults, ...form }),
    onSuccess: async () => {
      if (!editing && draftIdentity) await draftStore.remove(draftIdentity).catch(() => undefined);
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
    if (!editing && draftIdentity) void draftStore.set(draftIdentity, Object.fromEntries(fields.filter((field) => !field.secure).map((field) => [field.key, next[field.key]]))).catch(() => undefined);
  };
  const busy = save.isPending || remove.isPending;
  const closeEditor = () => { if (!busy) setEditing(undefined); };

  return <Screen header={<PageHeader leading={<Pressable accessibilityLabel="Back" onPress={() => router.back()} style={styles.iconButton}><ArrowLeft color={theme.text} size={22} /></Pressable>} title={title} subtitle={subtitle} action={writable ? <Pressable accessibilityLabel={`Create ${title}`} onPress={() => setEditing(null)} style={[styles.createButton, { backgroundColor: theme.primary }]}><Plus color="#ffffff" size={21} /></Pressable> : undefined} />}>
    <View style={[styles.search, { backgroundColor: theme.surface, borderColor: theme.border }]}><Search color={theme.textMuted} size={18} /><TextInput accessibilityLabel={`Search ${title}`} onChangeText={setSearch} placeholder={`Search ${title.toLowerCase()}`} placeholderTextColor={theme.textMuted} style={[styles.searchInput, { color: theme.text }]} value={search} />{search ? <Pressable accessibilityLabel="Clear search" onPress={() => setSearch('')}><X color={theme.textMuted} size={18} /></Pressable> : null}</View>
    {query.isLoading && !query.data ? <LoadingState /> : null}
    {query.isError && !query.data ? <ErrorState message={apiErrorMessage(query.error)} onRetry={() => query.refetch()} /> : null}
    {query.data ? <FlashList contentContainerStyle={styles.list} data={rows} keyExtractor={(item) => String(item.id)} onRefresh={() => query.refetch()} refreshing={query.isRefetching} ListEmptyComponent={<EmptyState title={`No ${title.toLowerCase()}`} message={search ? 'Try another search.' : `Workspace ${title.toLowerCase()} will appear here.`} />} renderItem={({ item }) => <Pressable accessibilityRole={writable ? 'button' : undefined} onPress={writable ? () => setEditing(item) : undefined} style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}><View style={[styles.monogram, { backgroundColor: theme.surfaceMuted }]}><Text style={{ color: theme.primary, fontWeight: '800' }}>{String(item[primary] || title).charAt(0).toUpperCase()}</Text></View><View style={styles.copy}><Text numberOfLines={1} style={[styles.name, { color: theme.text }]}>{String(item[primary] || `${title} ${item.id}`)}</Text><Text numberOfLines={2} style={[styles.meta, { color: theme.textMuted }]}>{secondary.map((key) => readableValue(item[key])).filter(Boolean).join(' · ') || `Record ${item.id}`}</Text></View>{writable ? <Pencil color={theme.textMuted} size={17} /> : null}</Pressable>} /> : null}
    <Modal animationType="slide" onRequestClose={closeEditor} presentationStyle="pageSheet" visible={editing !== undefined}>
      <SafeAreaView style={[styles.modal, { backgroundColor: theme.background }]}>
        <KeyboardAvoidingView style={styles.modal} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <Pressable accessibilityLabel="Close editor" disabled={busy} onPress={closeEditor} style={styles.iconButton}><X color={theme.text} size={22} /></Pressable>
            <Text numberOfLines={2} style={[styles.modalTitle, { color: theme.text }]}>{editing ? `Edit ${title}` : `New ${title}`}</Text>
            <View style={styles.iconButton} />
          </View>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            {visibleFields.map((field) => <View key={field.key}>
              <Text style={[styles.label, { color: theme.text }]}>{field.label}{field.required ? ' *' : ''}</Text>
              <TextInput accessibilityLabel={field.label} editable={!busy && !restoringDraft} multiline={field.multiline} secureTextEntry={field.secure} keyboardType={field.keyboardType} autoCapitalize={field.secure || field.keyboardType === 'email-address' ? 'none' : 'sentences'} autoCorrect={!field.secure && field.keyboardType !== 'email-address'} onChangeText={(value) => updateField(field.key, value)} placeholder={field.placeholder} placeholderTextColor={theme.textMuted} style={[styles.field, field.multiline && styles.multiline, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]} value={form[field.key] || ''} />
            </View>)}
            {editing && renderEditFooter ? renderEditFooter(editing) : null}
            {editing ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => Alert.alert(`Delete ${String(editing[primary] || title)}?`, 'This cannot be undone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(editing.id) }])} style={styles.delete}><Trash2 color={theme.danger} size={18} /><Text style={{ color: theme.danger, fontWeight: '700' }}>Delete</Text></Pressable> : null}
          </ScrollView>
          <View style={[styles.footer, { borderTopColor: theme.border }]}><PrimaryButton loading={save.isPending} disabled={busy || restoringDraft || !valid} label="Save" onPress={() => save.mutate()} /></View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
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
  modalTitle: { flex: 1, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, padding: 16 },
  form: { gap: 17, padding: 20 },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 7 },
  field: { borderRadius: 8, borderWidth: 1, fontSize: 15, minHeight: 46, paddingHorizontal: 12, paddingVertical: 11 },
  multiline: { minHeight: 112, textAlignVertical: 'top' },
  delete: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 48 },
});
