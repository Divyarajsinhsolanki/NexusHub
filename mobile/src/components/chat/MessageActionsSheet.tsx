import { useEffect, useState } from "react";
import { ChatActionSheet, ChatSheetAction } from "./ChatActionSheet";
import * as Clipboard from 'expo-clipboard';
import { Copy, CornerUpLeft, MessageSquare, Pin, Pencil, Trash2 } from 'lucide-react-native';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Message } from '../../api/types';
import { useAppTheme } from '../../theme';
const EMOJIS = ['👍', '❤️', '😂', '🎉', '🙌', '🔥', '👏', '🙏', '😊', '😍', '😮', '😢', '😡', '✅', '💯', '🚀', '👀', '🤔', '😎', '🥳', '💪', '✨', '😅', '🤝', '🏆'];
export function MessageActionsSheet({ message, canEdit, onEdit, onDelete, onClose, onSelect, onReply, onThread, onPin, pending }: { message: Message | null; canEdit: boolean; onEdit: () => void; onDelete: () => void; onClose: () => void; onSelect: (emoji: string) => void; onReply: () => void; onThread?: () => void; onPin?: () => void; pending: boolean }) {
  const theme = useAppTheme();
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => setConfirmDelete(false), [message?.id]);
  if (confirmDelete) return <ChatActionSheet title="Delete message?" visible={Boolean(message)} onClose={onClose}><Text style={{ color: theme.textMuted }}>This deletes the message for everyone. A deleted-message indicator will remain.</Text><ChatSheetAction label="Delete for everyone" danger disabled={pending} onPress={onDelete} /><ChatSheetAction label="Keep message" disabled={pending} onPress={() => setConfirmDelete(false)} /></ChatActionSheet>;
  return <ChatActionSheet title="Message actions" visible={Boolean(message)} onClose={onClose}>
      <Text numberOfLines={2} style={{ color: theme.textMuted, fontSize: 13, marginBottom: 8 }}>{String(message?.body || message?.attachments?.[0]?.filename || 'Attachment')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reactions} keyboardShouldPersistTaps="handled">{EMOJIS.map(emoji => <Pressable key={emoji} accessibilityRole="button" accessibilityLabel={`React ${emoji}`} accessibilityState={{ selected: !!message?.reacted_emojis?.includes(emoji) }} disabled={pending} onPress={() => onSelect(emoji)} style={[styles.emoji, message?.reacted_emojis?.includes(emoji) && { backgroundColor: theme.surfaceMuted }]}><Text style={{ fontSize: 26 }}>{emoji}</Text></Pressable>)}</ScrollView>
      <Action label="Reply to message" text="Reply" icon={CornerUpLeft} onPress={onReply} />
      {onThread ? <Action label="View reply thread" text="View reply thread" icon={MessageSquare} onPress={onThread} /> : null}
      {onPin ? <Action label={message?.pinned_at ? 'Unpin message' : 'Pin message'} text={message?.pinned_at ? 'Unpin message' : 'Pin message'} icon={Pin} onPress={onPin} /> : null}
      {message?.body ? <Action label="Copy message" text="Copy message" icon={Copy} onPress={async () => { try { await Clipboard.setStringAsync(message.body || ''); onClose(); } catch { Alert.alert('Unable to copy message'); } }} /> : null}
      {canEdit ? <><Action label="Edit message" text="Edit message" icon={Pencil} onPress={onEdit} /><Action label="Delete message" text="Delete for everyone" icon={Trash2} danger onPress={() => setConfirmDelete(true)} /><Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 4 }}>Editing and deletion are available for 15 minutes after sending.</Text></> : null}
  </ChatActionSheet>;
}
function Action({ label, text, icon: Icon, danger, onPress }: { label: string; text: string; icon: typeof Copy; danger?: boolean; onPress: () => void }) { const theme = useAppTheme(); const color = danger ? theme.danger : theme.text; return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[styles.action, { borderBottomColor: theme.border }]}><Icon size={20} color={color} /><Text style={{ color, fontSize: 15, fontWeight: '600' }}>{text}</Text></Pressable>; }
const styles = StyleSheet.create({ backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }, sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, maxHeight: '85%' }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8 }, close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, reactions: { gap: 6, paddingVertical: 12 }, emoji: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 22 }, action: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 14, borderBottomWidth: StyleSheet.hairlineWidth } });
