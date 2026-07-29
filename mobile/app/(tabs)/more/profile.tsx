import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { ArrowLeft, Camera, LogOut, MonitorSmartphone, Pencil, ShieldCheck, StopCircle, UserCog, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { apiErrorMessage } from '@/src/api/client';
import { endpoints } from '@/src/api/endpoints';
import type { EntityRecord } from '@/src/api/types';
import { useAuth } from '@/src/auth/AuthProvider';
import { Avatar } from '@/src/components/Avatar';
import { PageHeader } from '@/src/components/PageHeader';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { Screen } from '@/src/components/Screen';
import { LoadingState } from '@/src/components/StateView';
import { useAppTheme } from '@/src/theme';

export default function ProfileScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, signOut, refreshUser, startImpersonation, stopImpersonation } = useAuth();
  const [editorOpen, setEditorOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [form, setForm] = useState({ first_name: '', last_name: '', bio: '' });
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const sessions = useQuery({ queryKey: ['mobile-sessions'], queryFn: endpoints.sessions, enabled: Boolean(user) });
  const people = useQuery({ queryKey: ['people-for-impersonation'], queryFn: () => endpoints.users(), enabled: peopleOpen });
  const revoke = useMutation({ mutationFn: endpoints.revokeSession, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mobile-sessions'] }), onError: (error) => Alert.alert('Unable to revoke session', apiErrorMessage(error)) });
  const save = useMutation({
    mutationFn: async () => {
      if (photo) {
        const body = new FormData();
        body.append('auth[first_name]', form.first_name);
        body.append('auth[last_name]', form.last_name);
        body.append('auth[bio]', form.bio);
        body.append('auth[profile_picture]', { uri: photo.uri, name: photo.fileName || 'profile.jpg', type: photo.mimeType || 'image/jpeg' } as never);
        await endpoints.updateMe(body);
      } else await endpoints.updateMe(form);
      await refreshUser();
    },
    onSuccess: () => { setEditorOpen(false); setPhoto(null); },
    onError: (error) => Alert.alert('Unable to update profile', apiErrorMessage(error)),
  });
  if (!user) return <Screen><LoadingState /></Screen>;

  const openEditor = () => { setForm({ first_name: user.first_name, last_name: user.last_name, bio: user.bio || '' }); setEditorOpen(true); };
  const pickPhoto = async () => { const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.85 }); if (!result.canceled) setPhoto(result.assets[0]); };
  const confirmSignOut = () => Alert.alert('Sign out?', 'Encrypted local workspace data will be cleared from this device.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: signOut }]);
  const impersonate = async (person: EntityRecord) => { try { await startImpersonation(person.id); setPeopleOpen(false); } catch (error) { Alert.alert('Unable to switch account', apiErrorMessage(error)); } };

  return <Screen header={<PageHeader leading={<Pressable accessibilityLabel="Back" onPress={() => router.back()} style={styles.iconButton}><ArrowLeft color={theme.text} size={22} /></Pressable>} title="Profile" subtitle={user.workspace.name} action={!user.demo_account ? <Pressable accessibilityLabel="Edit profile" onPress={openEditor} style={styles.iconButton}><Pencil color={theme.text} size={20} /></Pressable> : undefined} />}>
    <ScrollView contentContainerStyle={styles.scroll}>
      {user.impersonation?.active ? <View style={[styles.impersonationBanner, { backgroundColor: '#fff7ed', borderColor: '#fdba74' }]}><UserCog color="#c2410c" size={20} /><View style={styles.flex}><Text style={styles.impersonationTitle}>Viewing as {user.full_name}</Text><Text style={styles.impersonationText}>Actions are audited under the owner account.</Text></View><Pressable accessibilityLabel="Stop impersonating" onPress={stopImpersonation}><StopCircle color="#c2410c" size={22} /></Pressable></View> : null}
      <View style={styles.identity}><Avatar color={user.avatar_color} name={user.full_name} size={82} uri={user.profile_picture} /><Text style={[styles.name, { color: theme.text }]}>{user.full_name}</Text><Text style={[styles.job, { color: theme.textMuted }]}>{user.job_title || 'Nexus Hub member'}</Text><Text style={[styles.email, { color: theme.textMuted }]}>{user.email}</Text></View>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>Account</Text><View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}><InfoRow icon={<ShieldCheck color={theme.success} size={20} />} label="Roles" value={user.roles.join(', ') || 'Member'} /><View style={[styles.divider, { backgroundColor: theme.border }]} /><InfoRow icon={<MonitorSmartphone color={theme.primary} size={20} />} label="Workspace" value={user.workspace.name} /></View>
      {user.bio ? <Text style={[styles.bio, { color: theme.textMuted }]}>{user.bio}</Text> : null}

      <View style={styles.sectionHeader}><Text style={[styles.sectionTitle, { color: theme.text }]}>Signed-in devices</Text><Text style={[styles.sectionHint, { color: theme.textMuted }]}>{sessions.data?.data.length || 0}</Text></View>
      <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>{sessions.isLoading ? <LoadingState label="Loading sessions" /> : sessions.data?.data.map((session, index) => <View key={session.id} style={[styles.sessionRow, index > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}><MonitorSmartphone color={session.current ? theme.success : theme.textMuted} size={20} /><View style={styles.flex}><Text style={[styles.sessionName, { color: theme.text }]}>{session.device_name || 'Mobile device'}{session.current ? ' · This device' : ''}</Text><Text style={[styles.sessionMeta, { color: theme.textMuted }]}>Last used {session.last_used_at ? new Date(session.last_used_at).toLocaleDateString() : 'recently'}</Text></View>{!user.demo_account && !session.current ? <Pressable accessibilityLabel="Revoke session" disabled={revoke.isPending} onPress={() => revoke.mutate(session.id)} style={styles.revoke}><X color={theme.danger} size={18} /></Pressable> : null}</View>)}</View>

      {user.permissions?.includes('impersonation.manage') && !user.impersonation?.active ? <Pressable onPress={() => setPeopleOpen(true)} style={[styles.impersonate, { borderColor: theme.border }]}><UserCog color={theme.primary} size={20} /><View style={styles.flex}><Text style={[styles.sessionName, { color: theme.text }]}>Secure impersonation</Text><Text style={[styles.sessionMeta, { color: theme.textMuted }]}>Troubleshoot another owner-managed account.</Text></View></Pressable> : null}
      <View style={styles.signOut}><PrimaryButton icon={<LogOut color="#ffffff" size={18} />} label="Sign out" onPress={confirmSignOut} /></View>
    </ScrollView>

    <Modal animationType="slide" onRequestClose={() => setEditorOpen(false)} presentationStyle="pageSheet" visible={editorOpen}><View style={[styles.modal, { backgroundColor: theme.background }]}><PageHeader leading={<Pressable accessibilityLabel="Close editor" onPress={() => setEditorOpen(false)} style={styles.iconButton}><X color={theme.text} size={22} /></Pressable>} title="Edit profile" /><ScrollView contentContainerStyle={styles.form}><Pressable accessibilityRole="button" onPress={pickPhoto} style={styles.photoEditor}><Avatar color={user.avatar_color} name={user.full_name} size={76} uri={photo?.uri || user.profile_picture} /><View style={[styles.cameraBadge, { backgroundColor: theme.primary }]}><Camera color="#ffffff" size={15} /></View></Pressable><Field label="First name" onChangeText={(first_name) => setForm((value) => ({ ...value, first_name }))} value={form.first_name} /><Field label="Last name" onChangeText={(last_name) => setForm((value) => ({ ...value, last_name }))} value={form.last_name} /><Field label="Bio" multiline onChangeText={(bio) => setForm((value) => ({ ...value, bio }))} value={form.bio} /><PrimaryButton disabled={save.isPending || !form.first_name.trim() || !form.last_name.trim()} label={save.isPending ? 'Saving...' : 'Save profile'} onPress={() => save.mutate()} /></ScrollView></View></Modal>

    <Modal animationType="slide" onRequestClose={() => setPeopleOpen(false)} presentationStyle="pageSheet" visible={peopleOpen}><View style={[styles.modal, { backgroundColor: theme.background }]}><PageHeader leading={<Pressable accessibilityLabel="Close" onPress={() => setPeopleOpen(false)} style={styles.iconButton}><X color={theme.text} size={22} /></Pressable>} title="View as user" subtitle="Owner-only audited access" />{people.isLoading ? <LoadingState /> : <FlatList contentContainerStyle={styles.peopleList} data={people.data?.data.filter((person) => person.id !== user.id)} keyExtractor={(item) => String(item.id)} renderItem={({ item }) => <Pressable onPress={() => impersonate(item)} style={[styles.personRow, { borderBottomColor: theme.border }]}><Avatar color={String(item.avatar_color || '#2563eb')} name={String(item.full_name || item.name || item.email)} size={42} uri={item.profile_picture ? String(item.profile_picture) : undefined} /><View style={styles.flex}><Text style={[styles.sessionName, { color: theme.text }]}>{String(item.full_name || item.name || item.email)}</Text><Text style={[styles.sessionMeta, { color: theme.textMuted }]}>{String(item.job_title || item.email || '')}</Text></View></Pressable>} />}</View></Modal>
  </Screen>;
}

function Field({ label, multiline, value, onChangeText }: { label: string; multiline?: boolean; value: string; onChangeText: (value: string) => void }) { const theme = useAppTheme(); return <View><Text style={[styles.label, { color: theme.text }]}>{label}</Text><TextInput accessibilityLabel={label} multiline={multiline} onChangeText={onChangeText} style={[styles.field, multiline && styles.multiline, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]} value={value} /></View>; }
function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { const theme = useAppTheme(); return <View style={styles.infoRow}>{icon}<Text style={[styles.infoLabel, { color: theme.text }]}>{label}</Text><Text numberOfLines={1} style={[styles.infoValue, { color: theme.textMuted }]}>{value}</Text></View>; }

const styles = StyleSheet.create({
  flex: { flex: 1 }, iconButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 }, scroll: { padding: 20, paddingBottom: 40 }, identity: { alignItems: 'center', paddingVertical: 18 }, name: { fontSize: 23, fontWeight: '800', marginTop: 13 }, job: { fontSize: 14, marginTop: 4 }, email: { fontSize: 13, marginTop: 3 }, sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 10, marginTop: 22 }, sectionHeader: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between' }, sectionHint: { fontSize: 12, marginBottom: 10 }, panel: { borderRadius: 8, borderWidth: 1, overflow: 'hidden', paddingHorizontal: 14 }, infoRow: { alignItems: 'center', flexDirection: 'row', gap: 11, minHeight: 54 }, infoLabel: { flex: 1, fontSize: 14, fontWeight: '600' }, infoValue: { flexShrink: 1, fontSize: 13, maxWidth: '48%' }, divider: { height: StyleSheet.hairlineWidth, marginLeft: 31 }, bio: { fontSize: 14, lineHeight: 21, marginTop: 20 }, signOut: { marginTop: 30 },
  impersonationBanner: { alignItems: 'center', borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 10, padding: 12 }, impersonationTitle: { color: '#9a3412', fontSize: 13, fontWeight: '800' }, impersonationText: { color: '#c2410c', fontSize: 11, marginTop: 2 },
  sessionRow: { alignItems: 'center', flexDirection: 'row', gap: 11, minHeight: 65 }, sessionName: { fontSize: 14, fontWeight: '700' }, sessionMeta: { fontSize: 12, marginTop: 3 }, revoke: { alignItems: 'center', height: 44, justifyContent: 'center', width: 40 }, impersonate: { alignItems: 'center', borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 11, marginTop: 20, minHeight: 68, padding: 13 },
  modal: { flex: 1 }, form: { gap: 17, padding: 20 }, photoEditor: { alignSelf: 'center', marginBottom: 8 }, cameraBadge: { alignItems: 'center', borderRadius: 15, bottom: 0, height: 30, justifyContent: 'center', position: 'absolute', right: -3, width: 30 }, label: { fontSize: 13, fontWeight: '700', marginBottom: 7 }, field: { borderRadius: 8, borderWidth: 1, fontSize: 15, minHeight: 46, paddingHorizontal: 12, paddingVertical: 11 }, multiline: { minHeight: 112, textAlignVertical: 'top' }, peopleList: { paddingHorizontal: 20, paddingBottom: 36 }, personRow: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 12, minHeight: 68 },
});
