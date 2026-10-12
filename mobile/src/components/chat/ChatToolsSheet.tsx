import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { apiErrorMessage } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import type { Message, ScheduledChatMessage } from '../../api/types';
import { useAppTheme } from '../../theme';
import { CreateDateField } from '../CreateDateField';
import { ChatAttachment } from './ChatAttachment';
import { ChatActionSheet, ChatSheetAction } from './ChatActionSheet';
export type ChatToolMode = { kind: 'pins' | 'scheduled' | 'media' | 'files' } | { kind: 'thread'; id: number };
export function ChatToolsSheet({ mode, conversationId, onClose, onReply, onOpen, onSchedule, draftLabel, canSchedule, readOnly }: { mode: ChatToolMode | null; conversationId: number; onClose: () => void; onReply: (message: Message) => void; onOpen: (id: number) => void; onSchedule: (when: Date) => Promise<unknown>; draftLabel: string; canSchedule: boolean; readOnly: boolean }) {
  const theme = useAppTheme();
  const client = useQueryClient();
  const [date, setDate] = useState(() => new Date(Date.now() + 3600000));
  useEffect(() => { if (mode) setDate(new Date(Date.now() + 3600000)); }, [mode]);
  const threadId = mode?.kind === 'thread' ? mode.id : undefined;
  const queryKey = ['chat-tools', conversationId, mode?.kind, threadId];
  const rows = useInfiniteQuery({ queryKey, initialPageParam: undefined as number | undefined, enabled: !!mode,
    queryFn: async ({ pageParam }) => mode?.kind === 'scheduled' ? endpoints.scheduledMessages(conversationId, pageParam) : endpoints.chatToolMessages(conversationId, mode?.kind === 'pins' ? { pinned: true } : mode?.kind === 'media' || mode?.kind === 'files' ? { attachments: mode.kind } : { thread_id: threadId }, pageParam),
    getNextPageParam: page => page.meta?.has_more ? Number(page.meta.next_before_id) : undefined });
  const action = useMutation({ mutationFn: async (operation: () => Promise<unknown>) => operation(), onSuccess: () => client.invalidateQueries({ queryKey }) });
  const data: (Message | ScheduledChatMessage)[] = rows.data?.pages.reduce<(Message | ScheduledChatMessage)[]>((all, page) => [...page.data, ...all], []) || [];
  const root = rows.data?.pages[0]?.meta?.thread_root as Message | undefined;
  const title = mode?.kind === 'thread' ? 'Reply thread' : mode?.kind === 'pins' ? 'Pinned messages' : mode?.kind === 'media' ? 'Shared media' : mode?.kind === 'files' ? 'Shared files' : 'Scheduled messages';
  return <ChatActionSheet visible={!!mode} title={title} onClose={onClose}>
    {rows.isPending && mode ? <Text style={{ color: theme.textMuted }}>Loading…</Text> : null}
    {rows.isError ? <ChatSheetAction label="Retry loading messages" onPress={() => { void rows.refetch(); }} /> : null}
    {action.isError ? <Text accessibilityRole="alert" style={{ color: theme.danger }}>{apiErrorMessage(action.error)}</Text> : null}
    {!rows.isPending && !data.length ? <Text style={{ color: theme.textMuted, paddingVertical: 16 }}>No messages yet.</Text> : null}
    {data.map(row => {
      const message = row as Message;
      const scheduled = row as ScheduledChatMessage;
      return <View key={row.id} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border }}><Text style={{ color: theme.primary, fontWeight: '700' }}>{mode?.kind === 'scheduled' ? new Date(scheduled.send_at).toLocaleString() : message.user_name}</Text><Text style={{ color: theme.text, paddingVertical: 8 }}>{message.body || 'Attachment'}</Text>{scheduled.attachment_count ? <Text style={{ color: theme.textMuted }}>{scheduled.attachment_count} attachment(s)</Text> : null}{message.attachments?.filter(file => !['media', 'files'].includes(mode?.kind || '') || (mode?.kind === 'media') === /^(image|video|audio)\//.test(String(file.content_type || ''))).map(file => <ChatAttachment key={file.id} file={file} mine={false} />)}
        {mode?.kind === 'scheduled' ? <ChatSheetAction label="Cancel scheduled send" disabled={action.isPending} onPress={() => action.mutate(() => endpoints.cancelScheduledMessage(conversationId, row.id))} /> : <><ChatSheetAction label="Open in conversation" onPress={() => { onClose(); onOpen(row.id); }} />{mode?.kind === 'pins' && !readOnly ? <ChatSheetAction label="Unpin" disabled={action.isPending} onPress={() => action.mutate(() => endpoints.pinMessage(conversationId, row.id, false))} /> : null}</>}
      </View>;
    })}
    {rows.hasNextPage ? <ChatSheetAction label="Load older messages" disabled={rows.isFetchingNextPage} onPress={() => { void rows.fetchNextPage(); }} /> : null}
    {mode?.kind === 'thread' && root && !root.deleted_at && !readOnly ? <ChatSheetAction label="Reply in thread" onPress={() => { onReply(root); onClose(); }} /> : null}
    {mode?.kind === 'scheduled' && !readOnly ? <View style={{ marginTop: 18, gap: 12 }}><Text style={{ color: theme.text, fontWeight: '700' }}>Schedule your current draft</Text><Text style={{ color: theme.textMuted }}>{draftLabel || 'Write a message in the composer first.'}</Text><CreateDateField date={date} includeTime onChange={setDate} /><Text style={{ color: theme.textMuted }}>Times use your device’s timezone.</Text><ChatSheetAction label="Schedule message" disabled={!canSchedule || action.isPending || date <= new Date()} onPress={() => action.mutate(() => onSchedule(date))} /></View> : null}
  </ChatActionSheet>;
}
