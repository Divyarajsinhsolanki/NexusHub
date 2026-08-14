import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, LogOut, Mic, MicOff, Plus, Trash2, UserMinus, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { absoluteAssetUrl, apiErrorMessage } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import type { Conversation, EntityRecord } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { mobileQueryKeys } from '../../cache/mobileCache';
import { useAppTheme } from '../../theme';
import { Avatar } from '../Avatar';
import { PrimaryButton } from '../PrimaryButton';
import { ErrorState, LoadingState } from '../StateView';

export function ConversationDetailsSheet({ conversationId, onClose, onConversationRemoved, readOnly = false, visible }: { conversationId: number; onClose: () => void; onConversationRemoved: () => void; readOnly?: boolean; visible: boolean }) {
  const theme = useAppTheme();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState('');
  const conversation = useQuery({ queryKey: mobileQueryKeys.conversation(conversationId), queryFn: () => endpoints.conversationSummary(conversationId), enabled: visible });
  const workspaceUsers = useQuery({ queryKey: ['users', 'conversation-members', conversationId], queryFn: () => endpoints.users({ per_page: 100 }), enabled: visible && adding });
  const current = conversation.data;
  const available = useMemo(() => {
    const memberIds = new Set(current?.participants?.map((participant) => participant.id) || []);
    return (workspaceUsers.data?.data || []).filter((person) => !memberIds.has(person.id));
  }, [current?.participants, workspaceUsers.data]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: mobileQueryKeys.conversation(conversationId) }),
      queryClient.invalidateQueries({ queryKey: mobileQueryKeys.conversations }),
    ]);
  };
  const rename = useMutation({ mutationFn: () => endpoints.updateConversation(conversationId, title.trim()), onSuccess: async () => { setTitle(''); await refresh(); }, onError: showError('Unable to rename group') });
  const mute = useMutation({ mutationFn: () => endpoints.setConversationMuted(conversationId, !current?.muted), onSuccess: refresh, onError: showError('Unable to update notifications') });
  const add = useMutation({ mutationFn: () => endpoints.addConversationParticipants(conversationId, [...selected]), onSuccess: async () => { setSelected(new Set()); setAdding(false); await refresh(); }, onError: showError('Unable to add members') });
  const remove = useMutation({ mutationFn: (userId: number) => endpoints.removeConversationParticipant(conversationId, userId), onSuccess: refresh, onError: showError('Unable to remove member') });
  const leave = useMutation({ mutationFn: () => endpoints.leaveConversation(conversationId), onSuccess: onConversationRemoved, onError: showError('Unable to leave group') });
  const hide = useMutation({ mutationFn: () => endpoints.hideConversation(conversationId), onSuccess: onConversationRemoved, onError: showError('Unable to remove conversation') });
  const deleteForEveryone = useMutation({ mutationFn: () => endpoints.deleteConversationForEveryone(conversationId, confirmDelete), onSuccess: onConversationRemoved, onError: showError('Unable to delete conversation') });

  const toggle = (id: number) => setSelected((existing) => {
    const next = new Set(existing);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={visible}><View style={[styles.sheet, { backgroundColor: theme.background }]}><View style={[styles.header, { borderBottomColor: theme.border }]}><Pressable accessibilityLabel="Close conversation details" onPress={onClose} style={styles.iconButton}><X color={theme.text} size={22} /></Pressable><View style={styles.headerCopy}><Text style={[styles.title, { color: theme.text }]}>Conversation details</Text><Text style={[styles.subtitle, { color: theme.textMuted }]}>{current?.conversation_type === 'group' ? `${current.participants?.length || 0} members` : 'Direct conversation'}</Text></View>{!readOnly ? <Pressable accessibilityLabel={current?.muted ? 'Unmute conversation' : 'Mute conversation'} disabled={!current || mute.isPending} onPress={() => mute.mutate()} style={styles.iconButton}>{current?.muted ? <MicOff color={theme.primary} size={20} /> : <Mic color={theme.textMuted} size={20} />}</Pressable> : <View style={styles.iconButton} />}</View>{conversation.isPending ? <LoadingState label="Loading conversation details" /> : null}{conversation.isError ? <ErrorState message={apiErrorMessage(conversation.error)} onRetry={() => conversation.refetch()} /> : null}{current ? <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled"><View style={styles.identity}><Avatar name={current.title || 'Conversation'} size={72} /><Text style={[styles.identityTitle, { color: theme.text }]}>{current.title}</Text><Text style={[styles.identityMeta, { color: theme.textMuted }]}>{current.muted ? 'Notifications muted' : 'Notifications enabled'}</Text></View>{current.can_edit_group && !readOnly ? <Section title="Group name"><View style={styles.inline}><TextInput accessibilityLabel="Group name" onChangeText={setTitle} placeholder={current.title || 'Group name'} placeholderTextColor={theme.textMuted} style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]} value={title} /><Pressable accessibilityLabel="Save group name" disabled={!title.trim() || rename.isPending} onPress={() => rename.mutate()} style={[styles.save, { backgroundColor: theme.primary, opacity: title.trim() ? 1 : 0.45 }]}><Check color="#ffffff" size={18} /></Pressable></View></Section> : null}<Section action={current.can_manage_members && !readOnly ? <Pressable accessibilityRole="button" onPress={() => setAdding((value) => !value)} style={styles.sectionAction}><Plus color={theme.primary} size={17} /><Text style={{ color: theme.primary, fontWeight: '700' }}>{adding ? 'Done' : 'Add'}</Text></Pressable> : undefined} title="Members">{adding && !readOnly ? <AddMembers rows={available} selected={selected} loading={workspaceUsers.isPending} onToggle={toggle} /> : current.participants?.map((participant) => <View key={participant.id} style={[styles.member, { borderBottomColor: theme.border }]}><Avatar name={participant.name} size={42} uri={absoluteAssetUrl(participant.profile_picture)} /><View style={styles.memberCopy}><Text style={[styles.memberName, { color: theme.text }]}>{participant.name}{participant.id === user?.id ? ' (You)' : ''}</Text><Text style={[styles.memberMeta, { color: participant.online ? theme.success : theme.textMuted }]}>{participant.is_creator ? 'Group creator' : participant.online ? 'Online' : 'Member'}</Text></View>{current.can_manage_members && !readOnly && !participant.is_creator && participant.id !== user?.id ? <Pressable accessibilityLabel={`Remove ${participant.name}`} onPress={() => Alert.alert(`Remove ${participant.name}?`, 'They will also leave any active group call.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => remove.mutate(participant.id) }])} style={styles.iconButton}><UserMinus color={theme.danger} size={19} /></Pressable> : null}</View>)}</Section>{adding && selected.size && !readOnly ? <PrimaryButton label={`Add ${selected.size} member${selected.size === 1 ? '' : 's'}`} loading={add.isPending} onPress={() => add.mutate()} /> : null}{!readOnly ? <Section title="Conversation actions"><Action danger={false} icon={current.muted ? Mic : MicOff} label={current.muted ? 'Unmute notifications' : 'Mute notifications'} onPress={() => mute.mutate()} />{current.can_leave_group ? <Action danger icon={LogOut} label="Leave group" onPress={() => confirmAction('Leave group?', 'You will stop receiving its messages and calls.', () => leave.mutate())} /> : null}<Action danger icon={Trash2} label="Remove from my inbox" onPress={() => confirmAction('Remove conversation?', 'This only hides it for you. A new message can restore a direct chat.', () => hide.mutate())} />{current.can_delete_for_everyone ? <View style={styles.deleteForAll}><Text style={[styles.warning, { color: theme.danger }]}>Delete for everyone</Text><Text style={[styles.warningCopy, { color: theme.textMuted }]}>Type DELETE {conversationId} to permanently delete messages and membership.</Text><TextInput autoCapitalize="characters" accessibilityLabel="Delete confirmation" onChangeText={setConfirmDelete} placeholder={`DELETE ${conversationId}`} placeholderTextColor={theme.textMuted} style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]} value={confirmDelete} /><PrimaryButton danger disabled={confirmDelete !== `DELETE ${conversationId}`} label="Delete conversation for everyone" loading={deleteForEveryone.isPending} onPress={() => deleteForEveryone.mutate()} /></View> : null}</Section> : null}</ScrollView> : null}</View></Modal>;
}

function AddMembers({ rows, selected, loading, onToggle }: { rows: EntityRecord[]; selected: Set<number>; loading: boolean; onToggle: (id: number) => void }) {
  const theme = useAppTheme();
  if (loading) return <LoadingState label="Loading people" />;
  if (!rows.length) return <Text style={[styles.empty, { color: theme.textMuted }]}>Everyone in this workspace is already a member.</Text>;
  return <FlatList data={rows} keyExtractor={(item) => String(item.id)} nestedScrollEnabled renderItem={({ item }) => { const checked = selected.has(item.id); const name = personName(item); return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => onToggle(item.id)} style={[styles.member, { borderBottomColor: theme.border }]}><Avatar color={String(item.avatar_color || theme.primary)} name={name} size={42} uri={absoluteAssetUrl(item.profile_picture as string)} /><View style={styles.memberCopy}><Text style={[styles.memberName, { color: theme.text }]}>{name}</Text><Text style={[styles.memberMeta, { color: theme.textMuted }]}>{String(item.job_title || item.email || 'Workspace member')}</Text></View><View style={[styles.selection, { backgroundColor: checked ? theme.primary : theme.surface, borderColor: checked ? theme.primary : theme.border }]}>{checked ? <Check color="#ffffff" size={15} /> : null}</View></Pressable>; }} style={styles.addList} />;
}

function Section({ action, children, title }: { action?: React.ReactNode; children: React.ReactNode; title: string }) { const theme = useAppTheme(); return <View style={styles.section}><View style={styles.sectionHeader}><Text style={[styles.sectionTitle, { color: theme.textMuted }]}>{title.toUpperCase()}</Text>{action}</View>{children}</View>; }
function Action({ danger, icon: Icon, label, onPress }: { danger: boolean; icon: typeof Mic; label: string; onPress: () => void }) { const theme = useAppTheme(); const color = danger ? theme.danger : theme.text; return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.action, { borderBottomColor: theme.border }]}><Icon color={color} size={19} /><Text style={[styles.actionLabel, { color }]}>{label}</Text></Pressable>; }
function personName(person: EntityRecord) { return String(person.name || person.full_name || [person.first_name, person.last_name].filter(Boolean).join(' ') || person.email || 'Workspace member'); }
function showError(title: string) { return (error: unknown) => Alert.alert(title, apiErrorMessage(error)); }
function confirmAction(title: string, message: string, action: () => void) { Alert.alert(title, message, [{ text: 'Cancel', style: 'cancel' }, { text: 'Continue', style: 'destructive', onPress: action }]); }

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  header: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 68, paddingHorizontal: 8 },
  iconButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  headerCopy: { alignItems: 'center', flex: 1 },
  title: { fontSize: 18, fontWeight: '800' },
  subtitle: { fontSize: 11, marginTop: 2 },
  body: { padding: 18, paddingBottom: 44 },
  identity: { alignItems: 'center', paddingBottom: 12 },
  identityTitle: { fontSize: 21, fontWeight: '800', marginTop: 12 },
  identityMeta: { fontSize: 12, marginTop: 4 },
  section: { marginTop: 24 },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  sectionTitle: { fontSize: 11, fontWeight: '800' },
  sectionAction: { alignItems: 'center', flexDirection: 'row', gap: 4, minHeight: 36, paddingHorizontal: 6 },
  inline: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  input: { borderRadius: 9, borderWidth: 1, flex: 1, fontSize: 14, minHeight: 46, paddingHorizontal: 12 },
  save: { alignItems: 'center', borderRadius: 9, height: 46, justifyContent: 'center', width: 46 },
  member: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 66, paddingVertical: 8 },
  memberCopy: { flex: 1, marginLeft: 11 },
  memberName: { fontSize: 14, fontWeight: '700' },
  memberMeta: { fontSize: 11, marginTop: 3 },
  selection: { alignItems: 'center', borderRadius: 16, borderWidth: 1, height: 32, justifyContent: 'center', width: 32 },
  addList: { maxHeight: 310 },
  empty: { fontSize: 13, lineHeight: 19, paddingVertical: 12 },
  action: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 52 },
  actionLabel: { fontSize: 14, fontWeight: '700', marginLeft: 10 },
  deleteForAll: { gap: 10, marginTop: 22 },
  warning: { fontSize: 14, fontWeight: '800' },
  warningCopy: { fontSize: 12, lineHeight: 18 },
});
