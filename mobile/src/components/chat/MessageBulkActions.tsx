import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import type { Message } from '../../api/types';
import { endpoints } from '../../api/endpoints';
import { canChangeMessage } from '../../chat/messageLifecycle';
import { useAppTheme } from '../../theme';
export function MessageBulkActions({ messages, selected, onSelection, onClose, conversationId, userId, readOnly, onChanged, onBusy }: { messages: Message[]; selected: Set<number>; onSelection: (ids: Set<number>) => void; onClose: () => void; conversationId: number; userId?: number; readOnly: boolean; onChanged: (message: Message) => void; onBusy: (busy: boolean) => void }) {
  const theme = useAppTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; onBusy(false); }; }, [onBusy]);
  const eligible = messages.filter(m => m.id > 0 && !m.deleted_at && m.message_type !== 'system');
  const chosen = eligible.filter(m => selected.has(m.id)).sort((a, b) => a.id - b.id);
  const deletable = chosen.length > 0 && chosen.every(m => canChangeMessage(m, userId));
  useEffect(() => {
    if (!busy && chosen.length !== selected.size) onSelection(new Set(chosen.map(message => message.id)));
  }, [messages, selected, busy, onSelection]);
  const apply = async (action: 'delete' | 'pin' | 'unpin') => {
    if (pending.current || !chosen.length || readOnly || (action === 'delete' && !deletable)) return;
    pending.current = true; setBusy(true); onBusy(true); setError('');
    const failed: number[] = [];
    for (const message of chosen) {
      if (!mounted.current) break;
      try { onChanged(action === 'delete' ? await endpoints.deleteMessage(conversationId, message.id) : await endpoints.pinMessage(conversationId, message.id, action === 'pin')); }
      catch { failed.push(message.id); }
    }
    if (!mounted.current) return;
    onSelection(new Set(failed));
    if (failed.length) setError(`${chosen.length - failed.length} updated; ${failed.length} failed. Retry the selected messages.`);
    else onClose();
    pending.current = false; setBusy(false); onBusy(false);
  };
  const button = (label: string, onPress: () => void, disabled = false) => <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={busy || disabled} onPress={onPress} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8, opacity: busy || disabled ? 0.45 : 1 }}><Text style={{ color: theme.primary, fontWeight: '600', fontSize: 13 }}>{label}</Text></Pressable>;
  return <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0, maxHeight: 240, backgroundColor: theme.surfaceMuted, borderBottomWidth: 1, borderColor: theme.border }} contentContainerStyle={{ padding: 10 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text accessibilityLiveRegion="polite" style={{ color: theme.text, fontWeight: '700' }}>{chosen.length} messages selected</Text>{button('Cancel message selection', onClose)}</View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {button('Select loaded messages', () => onSelection(new Set(eligible.slice(0, 100).map(m => m.id))))}
      {button('Clear message selection', () => onSelection(new Set()), !selected.size)}
      {button('Copy selected messages', () => { void Clipboard.setStringAsync(chosen.map(m => m.body || '[Attachment]').join('\n\n')).then(() => setError('Messages copied.')).catch(() => setError('Could not copy messages.')); }, !chosen.length)}
      {!readOnly ? <>{button('Pin selected messages', () => { void apply('pin'); }, !chosen.length)}{button('Unpin selected messages', () => { void apply('unpin'); }, !chosen.length)}{button('Delete selected messages', () => Alert.alert('Delete selected messages?', `Delete ${chosen.length} messages for everyone? This cannot be undone.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { void apply('delete'); } }]), !deletable)}</> : null}
    </View>
    {!readOnly && chosen.length > 0 && !deletable ? <Text style={{ color: theme.textMuted, fontSize: 12 }}>Delete is available only when all selected messages are yours and less than 15 minutes old.</Text> : null}
    <Text style={{ color: theme.textMuted, fontSize: 12 }}>Select up to 100 loaded messages. Attachments are not copied.</Text>
    {error ? <Text accessibilityLiveRegion="polite" style={{ color: theme.text }}>{error}</Text> : null}
  </ScrollView>;
}
