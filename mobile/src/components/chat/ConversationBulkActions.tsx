import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { endpoints } from '../../api/endpoints';
import { mobileQueryKeys, removeConversationFromCache, updateConversationCaches } from '../../cache/mobileCache';
import type { MuteDuration } from '../../chat/muteOptions';
import { useAppTheme } from '../../theme';
import { ChatActionSheet, ChatSheetAction } from './ChatActionSheet';
import { MuteOptions } from './MuteDurationSheet';

export function ConversationBulkActions({ selected, visibleIds, onSelection, onClose, onBusy }: { selected: Set<number>; visibleIds: number[]; onSelection: (ids: Set<number>) => void; onClose: () => void; onBusy: (busy: boolean) => void }) {
  const theme = useAppTheme();
  const client = useQueryClient();
  const [stage, setStage] = useState<'mute' | 'delete' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const apply = async (action: 'mute' | 'unmute' | 'delete', duration?: MuteDuration) => {
    if (pending.current || !selected.size) return;
    pending.current = true; setBusy(true); onBusy(true); setStage(null); setError('');
    const failed: number[] = [];
    const ids = [...selected];
    for (const id of ids) {
      try {
        if (action === 'delete') { await endpoints.hideConversation(id); removeConversationFromCache(client, id); }
        else { const updated = await endpoints.setConversationMuted(id, action === 'mute', duration); updateConversationCaches(client, id, current => ({ ...current, ...updated })); }
      } catch { failed.push(id); }
    }
    onSelection(new Set(failed));
    if (failed.length) setError(`${ids.length - failed.length} updated; ${failed.length} could not be updated. Retry the selected chats.`);
    else onClose();
    void client.invalidateQueries({ queryKey: mobileQueryKeys.conversations });
    pending.current = false; setBusy(false); onBusy(false);
  };
  const button = (label: string, onPress: () => void, disabled = false) => <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={busy || disabled} onPress={onPress} style={{ minHeight: 44, paddingHorizontal: 10, justifyContent: 'center', opacity: busy || disabled ? 0.45 : 1 }}><Text style={{ color: theme.primary, fontWeight: '600', fontSize: 13 }}>{label}</Text></Pressable>;
  return <View style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.surfaceMuted }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text accessibilityRole="text" style={{ color: theme.text, fontWeight: '700' }}>{selected.size} selected</Text>{button('Cancel selection', onClose)}</View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{button('Clear chat selection', () => onSelection(new Set()), !selected.size)}{button('Select visible', () => onSelection(new Set([...selected, ...visibleIds])), !visibleIds.length)}{button('Mute selected', () => setStage('mute'), !selected.size)}{button('Unmute selected', () => { void apply('unmute'); }, !selected.size)}{button('Delete selected for me', () => setStage('delete'), !selected.size)}</View>
    {busy ? <Text style={{ color: theme.textMuted }}>Updating selected chats…</Text> : null}
    {error ? <Text accessibilityRole="alert" style={{ color: theme.danger }}>{error}</Text> : null}
    <ChatActionSheet visible={stage !== null} title={stage === 'mute' ? 'Mute selected chats for…' : 'Delete selected chats for me?'} onClose={() => setStage(null)}>
      {stage === 'mute' ? <MuteOptions onClose={() => setStage(null)} onSelect={duration => { void apply('mute', duration); }} /> : <><Text style={{ color: theme.textMuted }}>Remove {selected.size} chats from your inbox? Other members keep their messages.</Text><ChatSheetAction label="Confirm delete for me" danger onPress={() => { void apply('delete'); }} /></>}
    </ChatActionSheet>
  </View>;
}
