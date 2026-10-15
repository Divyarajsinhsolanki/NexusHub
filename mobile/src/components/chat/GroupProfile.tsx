import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { apiErrorMessage } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import type { Conversation } from '../../api/types';
import { useAppTheme } from '../../theme';
import { PrimaryButton } from '../PrimaryButton';

export function GroupProfile({ conversation, onUpdated, readOnly = false }: { conversation: Conversation; onUpdated: () => Promise<void>; readOnly?: boolean }) {
  const theme = useAppTheme();
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState('');
  const [allowMembers, setAllowMembers] = useState(false);
  const [photo, setPhoto] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setEditing(false); setError(''); }, [conversation.id]);
  if (conversation.conversation_type !== 'group') return null;
  const canEdit = !readOnly && (conversation.can_edit_group_info || conversation.can_edit_group);
  const begin = () => {
    setDescription(conversation.description || ''); setAllowMembers(Boolean(conversation.members_can_edit_group_info));
    setPhoto(null); setRemovePhoto(false); setError(''); setEditing(true);
  };
  const choosePhoto = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'], copyToCacheDirectory: true });
      if (result.canceled) return;
      const file = result.assets[0];
      if (file.size && file.size > 5 * 1024 * 1024) { setError('Choose an image 5 MB or smaller.'); return; }
      setPhoto(file); setRemovePhoto(false); setError('');
    } catch (failure) { setError(apiErrorMessage(failure)); }
  };
  const save = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const form = new FormData();
      form.append('conversation[description]', description);
      if (conversation.can_edit_group) form.append('conversation[members_can_edit_group_info]', String(allowMembers));
      if (photo) form.append('conversation[group_photo]', { uri: photo.uri, name: photo.name, type: photo.mimeType || 'application/octet-stream' } as never);
      if (removePhoto) form.append('conversation[remove_group_photo]', 'true');
      await endpoints.updateConversation(conversation.id, form);
      await onUpdated(); setEditing(false);
    } catch (failure) { setError(apiErrorMessage(failure)); }
    finally { setBusy(false); }
  };
  return <View style={styles.section}>
    <Text accessibilityRole="header" style={{ color: theme.textMuted, fontWeight: '700', fontSize: 12 }}>ABOUT THIS GROUP</Text>
    {!editing || !canEdit ? <><Text style={{ color: theme.text, fontSize: 14 }}>{conversation.description || 'No description yet.'}</Text>{canEdit ? <PrimaryButton label="Edit group info" onPress={begin} /> : null}</> : <>
      <TextInput accessibilityLabel="Group description" multiline maxLength={2000} editable={!busy} value={description} onChangeText={setDescription} placeholder="Group description" placeholderTextColor={theme.textMuted} style={[styles.description, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]} />
      <PrimaryButton label={photo ? `Photo: ${photo.name}` : 'Choose group photo'} disabled={busy} onPress={() => { void choosePhoto(); }} />
      <Text style={{ color: theme.textMuted, fontSize: 12 }}>JPEG, PNG, GIF or WebP · Up to 5 MB</Text>
      {conversation.group_photo_url ? <Pressable accessibilityRole="checkbox" accessibilityLabel="Remove group photo" accessibilityState={{ checked: removePhoto, disabled: busy }} disabled={busy} onPress={() => { setRemovePhoto(value => !value); setPhoto(null); }} style={styles.permission}><Text style={{ color: theme.text }}>{removePhoto ? '✓ ' : ''}Remove group photo</Text></Pressable> : null}
      {conversation.can_edit_group ? <View style={styles.permission}><Text style={{ color: theme.text, flex: 1, fontSize: 14 }}>Allow all group members to edit the photo and description</Text><Switch accessibilityLabel="Allow members to edit group info" disabled={busy} value={allowMembers} onValueChange={setAllowMembers} /></View> : null}
      {error ? <Text accessibilityRole="alert" style={{ color: theme.danger }}>{error}</Text> : null}
      <PrimaryButton label="Save group info" loading={busy} onPress={() => { void save(); }} />
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => setEditing(false)} style={styles.cancel}><Text style={{ color: theme.text }}>Cancel</Text></Pressable>
    </>}
  </View>;
}
const styles = StyleSheet.create({ section: { marginTop: 20, gap: 12 }, description: { minHeight: 100, borderWidth: 1, borderRadius: 8, padding: 12, textAlignVertical: 'top', fontSize: 14 }, permission: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12 }, cancel: { minHeight: 44, alignItems: 'center', justifyContent: 'center' } });
