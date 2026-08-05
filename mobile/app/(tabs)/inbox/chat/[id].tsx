import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, FilePlus2, Phone, Send, Video } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, KeyboardAvoidingView, Modal, NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';

import { apiErrorMessage } from '@/src/api/client';
import { endpoints } from '@/src/api/endpoints';
import type { Conversation, Message } from '@/src/api/types';
import { useAuth } from '@/src/auth/AuthProvider';
import { MOBILE_CACHE_PAGE_LIMIT, mobileQueryKeys, trimInfinitePages } from '@/src/cache/mobileCache';
import { outgoingReceiptState } from '@/src/chat/receipts';
import { PageHeader } from '@/src/components/PageHeader';
import { Screen } from '@/src/components/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/src/components/StateView';
import { handleMobileRealtimeEvent } from '@/src/realtime/MobileRealtimeSync';
import { useChatRealtime, type ChatEvent } from '@/src/realtime/useChatRealtime';
import { useAppTheme } from '@/src/theme';

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = Number(id);
  const theme = useAppTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const writable = !user?.demo_account;
  const [body, setBody] = useState('');
  const [attachment, setAttachment] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [hasUnreadBelow, setHasUnreadBelow] = useState(false);
  const [reactionMessage, setReactionMessage] = useState<Message | null>(null);
  const listRef = useRef<FlashListRef<Message>>(null);
  const atLatestRef = useRef(true);
  const focusedRef = useRef(false);
  const appActiveRef = useRef(AppState.currentState === 'active');
  const receiptCursorRef = useRef({ delivered: 0, read: 0 });
  const olderRequestRef = useRef(false);
  const conversation = useQuery({ queryKey: mobileQueryKeys.conversation(conversationId), queryFn: () => endpoints.conversation(conversationId), enabled: Number.isFinite(conversationId) });
  const messages = useInfiniteQuery({
    queryKey: mobileQueryKeys.messages(conversationId),
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) => endpoints.messages(conversationId, pageParam),
    getNextPageParam: (page) => Number(page.meta?.next_before_id) || undefined,
    enabled: Number.isFinite(conversationId),
  });
  const rows = useMemo(() => [...(messages.data?.pages || [])].reverse().flatMap((page) => page.data), [messages.data]);

  const acknowledge = useCallback(async (messageId: number, state: 'delivered' | 'read') => {
    const cursorKey = state;
    if (!messageId || receiptCursorRef.current[cursorKey] >= messageId) return;
    const previous = receiptCursorRef.current[cursorKey];
    const previousDelivered = receiptCursorRef.current.delivered;
    receiptCursorRef.current[cursorKey] = messageId;
    if (state === 'read') receiptCursorRef.current.delivered = Math.max(receiptCursorRef.current.delivered, messageId);
    try {
      await endpoints.updateConversationReceipt(conversationId, messageId, state);
    } catch {
      receiptCursorRef.current[cursorKey] = previous;
      if (state === 'read' && receiptCursorRef.current.delivered === messageId) receiptCursorRef.current.delivered = previousDelivered;
    }
  }, [conversationId]);

  const onRealtime = useCallback((event: ChatEvent) => {
    void handleMobileRealtimeEvent(queryClient, event);
    if (event.type !== 'message_created' || Number(event.conversation_id) !== conversationId) return;
    const incoming = event.message as Message | undefined;
    if (!incoming?.id || incoming.user_id === user?.id) return;
    void acknowledge(incoming.id, 'delivered');
    if (focusedRef.current && appActiveRef.current && atLatestRef.current) {
      void acknowledge(incoming.id, 'read');
    } else {
      setHasUnreadBelow(true);
    }
  }, [acknowledge, conversationId, queryClient, user?.id]);
  const connection = useChatRealtime(conversationId, onRealtime);

  useFocusEffect(useCallback(() => {
    focusedRef.current = true;
    const latestId = Number(rows.at(-1)?.id);
    if (appActiveRef.current && atLatestRef.current && latestId) void acknowledge(latestId, 'read');
    return () => { focusedRef.current = false; };
  }, [acknowledge, rows]));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      appActiveRef.current = state === 'active';
      const latestId = Number(rows.at(-1)?.id);
      if (appActiveRef.current && focusedRef.current && atLatestRef.current && latestId) void acknowledge(latestId, 'read');
    });
    return () => subscription.remove();
  }, [acknowledge, rows]);

  useEffect(() => {
    const latestId = Number(rows.at(-1)?.id);
    if (!latestId) return;
    void acknowledge(latestId, 'delivered');
    if (focusedRef.current && appActiveRef.current && atLatestRef.current) void acknowledge(latestId, 'read');
  }, [acknowledge, rows]);

  useEffect(() => {
    receiptCursorRef.current = { delivered: 0, read: 0 };
    atLatestRef.current = true;
    setHasUnreadBelow(false);
    return () => {
      queryClient.setQueryData(mobileQueryKeys.messages(conversationId), (previous) => trimInfinitePages(previous as never, MOBILE_CACHE_PAGE_LIMIT));
    };
  }, [conversationId, queryClient]);

  const send = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.append('message[body]', body.trim());
      if (attachment) form.append('message[attachments][]', { uri: attachment.uri, name: attachment.name, type: attachment.mimeType || 'application/octet-stream' } as never);
      return endpoints.createMessage(conversationId, form);
    },
    onSuccess: async () => {
      setBody('');
      setAttachment(null);
      await queryClient.invalidateQueries({ queryKey: mobileQueryKeys.messages(conversationId) });
      await queryClient.invalidateQueries({ queryKey: mobileQueryKeys.conversations });
    },
    onError: (error) => Alert.alert('Message not sent', apiErrorMessage(error)),
  });
  const startCall = async (callType: 'audio' | 'video') => {
    try {
      const result = await endpoints.startCall(conversationId, callType);
      router.push(`/inbox/call/${result.call_session.id}` as never);
    } catch (error) {
      Alert.alert('Unable to start call', apiErrorMessage(error));
    }
  };
  const pickAttachment = async () => {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (!result.canceled) setAttachment(result.assets[0]);
  };
  const react = useMutation({
    mutationFn: async ({ message, emoji }: { message: Message; emoji: string }) => {
      if (message.reacted_emojis?.includes(emoji)) return endpoints.removeMessageReaction(conversationId, message.id, emoji);
      return endpoints.reactToMessage(conversationId, message.id, emoji);
    },
    onSuccess: async () => {
      setReactionMessage(null);
      await queryClient.invalidateQueries({ queryKey: mobileQueryKeys.messages(conversationId) });
    },
    onError: (error) => Alert.alert('Reaction not updated', apiErrorMessage(error)),
  });

  const loadOlder = useCallback(async () => {
    if (!messages.hasNextPage || olderRequestRef.current) return;
    olderRequestRef.current = true;
    try { await messages.fetchNextPage(); } finally { olderRequestRef.current = false; }
  }, [messages]);

  const fetchOlderIfNeeded = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const atLatest = contentOffset.y + layoutMeasurement.height >= contentSize.height - 72;
    atLatestRef.current = atLatest;
    if (atLatest) {
      setHasUnreadBelow(false);
      const latestId = Number(rows.at(-1)?.id);
      if (focusedRef.current && appActiveRef.current && latestId) void acknowledge(latestId, 'read');
    }
    if (contentOffset.y <= 120 && messages.hasNextPage && !messages.isFetchNextPageError) {
      void loadOlder();
    }
  }, [acknowledge, loadOlder, messages.hasNextPage, messages.isFetchNextPageError, rows]);

  const jumpToLatest = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true });
    atLatestRef.current = true;
    setHasUnreadBelow(false);
    const latestId = Number(rows.at(-1)?.id);
    if (latestId) void acknowledge(latestId, 'read');
  }, [acknowledge, rows]);

  return (
    <Screen header={<PageHeader leading={<IconButton label="Back" onPress={() => router.back()}><ArrowLeft color={theme.text} size={22} /></IconButton>} title={conversation.data?.title || 'Conversation'} subtitle={connection === 'connected' ? 'Live' : 'Reconnecting'} action={writable ? <View style={styles.headerActions}><IconButton label="Start audio call" onPress={() => startCall('audio')}><Phone color={theme.text} size={20} /></IconButton><IconButton label="Start video call" onPress={() => startCall('video')}><Video color={theme.text} size={20} /></IconButton></View> : undefined} />}>
      {messages.isPending && !messages.data ? <LoadingState label="Loading conversation" /> : null}
      {messages.isError && !messages.data ? <ErrorState message={apiErrorMessage(messages.error)} onRetry={() => messages.refetch()} /> : null}
      {messages.data ? <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={74} style={styles.flex}>
        <FlashList
          contentContainerStyle={styles.messageList}
          data={rows}
          keyExtractor={(item) => String(item.id)}
          ListEmptyComponent={<EmptyState title="Start the conversation" message="Messages and attachments are delivered in real time." />}
          ListHeaderComponent={<HistoryState hasMessages={rows.length > 0} hasNextPage={Boolean(messages.hasNextPage)} isError={messages.isFetchNextPageError} isLoading={messages.isFetchingNextPage} onRetry={loadOlder} />}
          maintainVisibleContentPosition={{ startRenderingFromBottom: true, autoscrollToBottomThreshold: 72, animateAutoScrollToBottom: true }}
          onScroll={fetchOlderIfNeeded}
          ref={listRef}
          renderItem={({ item }) => <MessageBubble conversation={conversation.data} message={item} mine={item.user_id === user?.id} onLongPress={() => setReactionMessage(item)} userId={user?.id} />}
          scrollEventThrottle={80}
        />
        {hasUnreadBelow ? <Pressable accessibilityLabel="Jump to new messages" accessibilityRole="button" onPress={jumpToLatest} style={[styles.newMessages, { backgroundColor: theme.primary }]}><Text style={styles.newMessagesText}>New messages</Text></Pressable> : null}
        {writable && attachment ? <View style={[styles.attachment, { backgroundColor: theme.surfaceMuted }]}><Text numberOfLines={1} style={[styles.attachmentName, { color: theme.text }]}>{attachment.name}</Text><Pressable accessibilityLabel="Remove attachment" onPress={() => setAttachment(null)}><Text style={{ color: theme.danger, fontWeight: '700' }}>Remove</Text></Pressable></View> : null}
        {writable ? <View style={[styles.composer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
          <IconButton label="Attach file" onPress={pickAttachment}><FilePlus2 color={theme.textMuted} size={21} /></IconButton>
          <TextInput accessibilityLabel="Message" multiline onChangeText={setBody} placeholder="Message" placeholderTextColor={theme.textMuted} style={[styles.input, { backgroundColor: theme.surfaceMuted, color: theme.text }]} value={body} />
          <Pressable accessibilityLabel="Send message" accessibilityRole="button" disabled={(!body.trim() && !attachment) || send.isPending} onPress={() => send.mutate()} style={[styles.send, { backgroundColor: theme.primary, opacity: (!body.trim() && !attachment) ? 0.45 : 1 }]}><Send color="#ffffff" size={19} /></Pressable>
        </View> : null}
      </KeyboardAvoidingView> : null}
      <ReactionPicker message={reactionMessage} onClose={() => setReactionMessage(null)} onSelect={(emoji) => reactionMessage && react.mutate({ message: reactionMessage, emoji })} pending={react.isPending} />
    </Screen>
  );
}

function MessageBubble({ conversation, message, mine, onLongPress, userId }: { conversation?: Conversation; message: Message; mine: boolean; onLongPress: () => void; userId?: number }) {
  const theme = useAppTheme();
  const receipt = mine ? outgoingReceiptState(conversation, message, userId) : null;
  const reactions = reactionEntries(message.reactions);
  return <View style={[styles.bubbleRow, mine && styles.mineRow]}><Pressable accessibilityHint="Long press to react" accessibilityLabel={receipt ? `Message. ${receipt.label}` : 'Message'} delayLongPress={350} onLongPress={onLongPress} style={[styles.bubble, { backgroundColor: mine ? theme.primary : theme.surface, borderColor: mine ? theme.primary : theme.border }]}>{!mine ? <Text style={[styles.sender, { color: theme.primary }]}>{message.user_name || 'Teammate'}</Text> : null}<Text style={[styles.body, { color: mine ? '#ffffff' : theme.text }]}>{message.body || 'Attachment'}{'  '}<Text style={[styles.inlineMeta, { color: mine ? '#dbeafe' : theme.textMuted }]}>{formatTime(message.created_at)}{receipt ? <Text style={{ color: receipt.read ? '#86efac' : '#dbeafe' }}> {receipt.symbol}</Text> : null}</Text></Text>{message.attachments?.map((file) => <Text key={Number(file.id)} numberOfLines={1} style={[styles.file, { color: mine ? '#dbeafe' : theme.textMuted }]}>{String(file.filename || 'File')}</Text>)}</Pressable>{reactions.length ? <View style={[styles.reactionChips, mine && styles.mineReactionChips]}>{reactions.map(([emoji, count]) => <Pressable key={emoji} accessibilityLabel={`${emoji}, ${count} reactions`} onPress={() => onLongPress()} style={[styles.reactionChip, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text>{emoji} {count}</Text></Pressable>)}</View> : null}</View>;
}

function HistoryState({ hasMessages, hasNextPage, isError, isLoading, onRetry }: { hasMessages: boolean; hasNextPage: boolean; isError: boolean; isLoading: boolean; onRetry: () => void }) {
  const theme = useAppTheme();
  if (!hasMessages) return null;
  if (isError) return <Pressable accessibilityRole="button" onPress={onRetry} style={styles.loadOlder}><Text style={{ color: theme.danger, fontWeight: '700' }}>Could not load earlier messages · Retry</Text></Pressable>;
  if (isLoading) return <View style={styles.loadOlder}><Text style={{ color: theme.textMuted }}>Loading earlier messages…</Text></View>;
  if (!hasNextPage) return <View style={styles.loadOlder}><Text style={{ color: theme.textMuted }}>Beginning of conversation</Text></View>;
  return <View style={styles.loadOlder}><Text style={{ color: theme.textMuted }}>Scroll up for earlier messages</Text></View>;
}

const REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '😮'];

function ReactionPicker({ message, onClose, onSelect, pending }: { message: Message | null; onClose: () => void; onSelect: (emoji: string) => void; pending: boolean }) {
  const theme = useAppTheme();
  return <Modal animationType="fade" onRequestClose={onClose} transparent visible={Boolean(message)}><Pressable accessibilityLabel="Close reaction picker" onPress={onClose} style={styles.modalBackdrop}><View style={[styles.reactionPicker, { backgroundColor: theme.surface }]}><Text style={[styles.reactionTitle, { color: theme.text }]}>React to message</Text><View style={styles.reactionOptions}>{REACTION_EMOJIS.map((emoji) => <Pressable accessibilityLabel={`React ${emoji}`} accessibilityRole="button" disabled={pending} key={emoji} onPress={() => onSelect(emoji)} style={[styles.reactionOption, message?.reacted_emojis?.includes(emoji) && { backgroundColor: theme.surfaceMuted }]}><Text style={styles.reactionEmoji}>{emoji}</Text></Pressable>)}</View></View></Pressable></Modal>;
}

function reactionEntries(reactions: Message['reactions']): Array<[string, number]> {
  if (!reactions || Array.isArray(reactions)) return [];
  return Object.entries(reactions).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] > 0);
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function IconButton({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return <Pressable accessibilityLabel={label} accessibilityRole="button" hitSlop={8} onPress={onPress} style={styles.iconButton}>{children}</Pressable>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerActions: { flexDirection: 'row' },
  iconButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  messageList: { paddingHorizontal: 16, paddingVertical: 15 },
  loadOlder: { alignItems: 'center', minHeight: 44, paddingVertical: 12 },
  bubbleRow: { alignItems: 'flex-start', marginVertical: 4 },
  mineRow: { alignItems: 'flex-end' },
  bubble: { borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, maxWidth: '84%', paddingHorizontal: 13, paddingVertical: 10 },
  sender: { fontSize: 11, fontWeight: '800', marginBottom: 3 },
  body: { fontSize: 15, lineHeight: 20 },
  inlineMeta: { fontSize: 10, lineHeight: 14 },
  file: { fontSize: 12, marginTop: 6 },
  reactionChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginLeft: 5, marginTop: -1 },
  mineReactionChips: { justifyContent: 'flex-end', marginLeft: 0, marginRight: 5 },
  reactionChip: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, minHeight: 25, paddingHorizontal: 7, paddingVertical: 2 },
  newMessages: { alignSelf: 'center', borderRadius: 18, bottom: 78, elevation: 4, paddingHorizontal: 15, paddingVertical: 9, position: 'absolute', shadowColor: '#000000', shadowOpacity: 0.18, shadowRadius: 7 },
  newMessagesText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)', flex: 1, justifyContent: 'center', padding: 24 },
  reactionPicker: { borderRadius: 14, padding: 18, width: '100%', maxWidth: 360 },
  reactionTitle: { fontSize: 15, fontWeight: '800', marginBottom: 14 },
  reactionOptions: { flexDirection: 'row', justifyContent: 'space-between' },
  reactionOption: { alignItems: 'center', borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
  reactionEmoji: { fontSize: 25 },
  attachment: { alignItems: 'center', flexDirection: 'row', minHeight: 44, paddingHorizontal: 16 },
  attachmentName: { flex: 1, fontSize: 13, marginRight: 12 },
  composer: { alignItems: 'flex-end', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 7, padding: 10 },
  input: { borderRadius: 8, flex: 1, fontSize: 15, maxHeight: 110, minHeight: 44, paddingHorizontal: 13, paddingVertical: 11 },
  send: { alignItems: 'center', borderRadius: 8, height: 44, justifyContent: 'center', width: 44 },
});
