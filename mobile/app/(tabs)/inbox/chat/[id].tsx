import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { ArrowLeft, FilePlus2, MoreHorizontal, Phone, Send, UsersRound, Video } from 'lucide-react-native';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, KeyboardAvoidingView, Linking, Modal, NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { absoluteAssetUrl, apiErrorMessage } from '@/src/api/client';
import { endpoints } from '@/src/api/endpoints';
import type { CallSession, Conversation, Message } from '@/src/api/types';
import { useAuth } from '@/src/auth/AuthProvider';
import { MOBILE_CACHE_PAGE_LIMIT, appendIncomingMessage, mobileQueryKeys, removeCachedMessage, replaceCachedMessage, trimInfinitePages, updateCachedMessage, updateConversationPreview } from '@/src/cache/mobileCache';
import { requestCallMediaPermissions } from '@/src/calls/mediaPermissions';
import { outgoingReceiptState } from '@/src/chat/receipts';
import { ConversationDetailsSheet } from '@/src/components/chat/ConversationDetailsSheet';
import { PageHeader } from '@/src/components/PageHeader';
import { Screen } from '@/src/components/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/src/components/StateView';
import { captureCallError, recordCallBreadcrumb } from '@/src/observability/callDiagnostics';
import { useRealtime } from '@/src/realtime/RealtimeProvider';
import { useChatRealtime, type ChatEvent } from '@/src/realtime/useChatRealtime';
import { useAppTheme } from '@/src/theme';

type MessageDraft = { body: string; attachment: DocumentPicker.DocumentPickerAsset | null };

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = Number(id);
  const pathname = usePathname();
  const theme = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const realtime = useRealtime();
  const { user } = useAuth();
  const writable = !user?.demo_account;
  const [body, setBody] = useState('');
  const [attachment, setAttachment] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [hasUnreadBelow, setHasUnreadBelow] = useState(false);
  const [reactionMessage, setReactionMessage] = useState<Message | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Record<number, string>>({});
  const listRef = useRef<FlashListRef<Message>>(null);
  const atLatestRef = useRef(true);
  const focusedRef = useRef(false);
  const appActiveRef = useRef(AppState.currentState === 'active');
  const receiptCursorRef = useRef({ delivered: 0, read: 0 });
  const olderRequestRef = useRef(false);
  const typingRef = useRef(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteTypingTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const failedDrafts = useRef(new Map<number, MessageDraft>());
  const conversation = useQuery({ queryKey: mobileQueryKeys.conversation(conversationId), queryFn: () => endpoints.conversationSummary(conversationId), enabled: Number.isFinite(conversationId) });
  const messages = useInfiniteQuery({
    queryKey: mobileQueryKeys.messages(conversationId),
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) => endpoints.messages(conversationId, pageParam),
    getNextPageParam: (page) => Number(page.meta?.next_before_id) || undefined,
    enabled: Number.isFinite(conversationId),
  });
  const rows = useMemo(() => [...(messages.data?.pages || [])].reverse().flatMap((page) => page.data), [messages.data]);
  const latestMessage = rows.length ? rows[rows.length - 1] : undefined;

  useEffect(() => {
    if (pathname.startsWith('/inbox/chat/')) router.replace(`/chat/${conversationId}` as never);
  }, [conversationId, pathname, router]);

  const performTyping = useCallback((isTyping: boolean) => {
    realtime.perform({ channel: 'ChatChannel', conversation_id: conversationId }, 'typing', { conversation_id: conversationId, is_typing: isTyping });
  }, [conversationId, realtime]);
  const stopTyping = useCallback(() => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = null;
    if (!typingRef.current) return;
    typingRef.current = false;
    performTyping(false);
  }, [performTyping]);
  const changeBody = useCallback((value: string) => {
    setBody(value);
    if (!typingRef.current && value.trim()) {
      typingRef.current = true;
      performTyping(true);
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(stopTyping, 1_800);
  }, [performTyping, stopTyping]);

  const acknowledge = useCallback(async (messageId: number, state: 'delivered' | 'read') => {
    if (!messageId || messageId < 0 || receiptCursorRef.current[state] >= messageId) return;
    const previous = receiptCursorRef.current[state];
    const previousDelivered = receiptCursorRef.current.delivered;
    receiptCursorRef.current[state] = messageId;
    if (state === 'read') receiptCursorRef.current.delivered = Math.max(receiptCursorRef.current.delivered, messageId);
    try {
      await endpoints.updateConversationReceipt(conversationId, messageId, state);
    } catch {
      receiptCursorRef.current[state] = previous;
      if (state === 'read' && receiptCursorRef.current.delivered === messageId) receiptCursorRef.current.delivered = previousDelivered;
    }
  }, [conversationId]);

  const onRealtime = useCallback((event: ChatEvent) => {
    if (Number(event.conversation_id) !== conversationId) return;
    if (event.type === 'typing_indicator' && Number(event.user_id) !== user?.id) {
      const userId = Number(event.user_id);
      const existingTimer = remoteTypingTimers.current.get(userId);
      if (existingTimer) clearTimeout(existingTimer);
      setTypingUsers((current) => {
        const next = { ...current };
        if (event.is_typing) next[userId] = String(event.user_name || 'Someone'); else delete next[userId];
        return next;
      });
      if (event.is_typing) remoteTypingTimers.current.set(userId, setTimeout(() => setTypingUsers((current) => { const next = { ...current }; delete next[userId]; return next; }), 3_000));
      return;
    }
    if (event.type === 'call_started' || event.type === 'call_ringing' || event.type === 'call_participant_joined') {
      const call = event.call_session as CallSession | undefined;
      if (call && typeof call === 'object' && Number(call.id)) {
        queryClient.setQueryData(mobileQueryKeys.conversation(conversationId), (current?: Conversation) => current ? { ...current, active_call: call } : current);
      }
      return;
    }
    if (event.type === 'call_ended' || event.type === 'call_missed') {
      queryClient.setQueryData(mobileQueryKeys.conversation(conversationId), (current?: Conversation) => current ? { ...current, active_call: null } : current);
      return;
    }
    if (event.type !== 'message_created') return;
    const incoming = event.message as Message | undefined;
    if (!incoming?.id || incoming.user_id === user?.id) return;
    void acknowledge(incoming.id, 'delivered');
    if (focusedRef.current && appActiveRef.current && atLatestRef.current) void acknowledge(incoming.id, 'read');
    else setHasUnreadBelow(true);
  }, [acknowledge, conversationId, queryClient, user?.id]);
  const connection = useChatRealtime(conversationId, onRealtime);

  useFocusEffect(useCallback(() => {
    focusedRef.current = true;
    const latestId = Number(latestMessage?.id);
    if (appActiveRef.current && atLatestRef.current && latestId) void acknowledge(latestId, 'read');
    return () => { focusedRef.current = false; stopTyping(); };
  }, [acknowledge, latestMessage?.id, stopTyping]));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      appActiveRef.current = state === 'active';
      if (!appActiveRef.current) stopTyping();
      const latestId = Number(latestMessage?.id);
      if (appActiveRef.current && focusedRef.current && atLatestRef.current && latestId) void acknowledge(latestId, 'read');
    });
    return () => subscription.remove();
  }, [acknowledge, latestMessage?.id, stopTyping]);

  useEffect(() => {
    const latestId = Number(latestMessage?.id);
    if (!latestId) return;
    void acknowledge(latestId, 'delivered');
    if (focusedRef.current && appActiveRef.current && atLatestRef.current) void acknowledge(latestId, 'read');
  }, [acknowledge, latestMessage?.id]);

  useEffect(() => {
    receiptCursorRef.current = { delivered: 0, read: 0 };
    atLatestRef.current = true;
    setHasUnreadBelow(false);
    return () => {
      stopTyping();
      remoteTypingTimers.current.forEach(clearTimeout);
      queryClient.setQueryData(mobileQueryKeys.messages(conversationId), (previous) => trimInfinitePages(previous as never, MOBILE_CACHE_PAGE_LIMIT));
    };
  }, [conversationId, queryClient, stopTyping]);

  const send = useMutation({
    mutationFn: async (draft: MessageDraft) => {
      const form = new FormData();
      form.append('message[body]', draft.body.trim());
      if (draft.attachment) form.append('message[attachments][]', { uri: draft.attachment.uri, name: draft.attachment.name, type: draft.attachment.mimeType || 'application/octet-stream' } as never);
      return endpoints.createMessage(conversationId, form);
    },
    onMutate: (draft) => {
      const temporaryId = -Date.now();
      const optimistic: Message = {
        id: temporaryId,
        body: draft.body.trim(),
        client_id: String(-temporaryId),
        created_at: new Date().toISOString(),
        send_state: 'sending',
        user_id: user?.id,
        user_name: user?.full_name,
        attachments: draft.attachment ? [{ id: temporaryId, filename: draft.attachment.name, url: draft.attachment.uri, content_type: draft.attachment.mimeType }] : [],
      };
      failedDrafts.current.set(temporaryId, draft);
      appendIncomingMessage(queryClient, conversationId, optimistic);
      updateConversationPreview(queryClient, conversationId, optimistic);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
      return { temporaryId };
    },
    onSuccess: (created, _draft, context) => {
      if (context) {
        replaceCachedMessage(queryClient, conversationId, context.temporaryId, created);
        failedDrafts.current.delete(context.temporaryId);
      }
      updateConversationPreview(queryClient, conversationId, created);
    },
    onError: (error, _draft, context) => {
      if (context) updateCachedMessage(queryClient, conversationId, context.temporaryId, (message) => ({ ...message, send_state: 'failed' }));
      Alert.alert('Message not sent', apiErrorMessage(error));
    },
  });
  const sendCurrent = () => {
    if (!body.trim() && !attachment) return;
    const draft = { body, attachment };
    setBody('');
    setAttachment(null);
    stopTyping();
    send.mutate(draft);
  };
  const retryMessage = useCallback((messageId: number) => {
    const draft = failedDrafts.current.get(messageId);
    if (!draft) return;
    removeCachedMessage(queryClient, conversationId, messageId);
    failedDrafts.current.delete(messageId);
    send.mutate(draft);
  }, [conversationId, queryClient, send]);

  const startCall = async (callType: 'audio' | 'video') => {
    setMenuOpen(false);
    recordCallBreadcrumb('create', { call_type: callType, conversation_id: conversationId });
    try {
      if (conversation.data?.active_call) {
        router.push(`/call/${conversation.data.active_call.id}?type=${conversation.data.active_call.call_type}` as never);
        return;
      }
      const permission = await requestCallMediaPermissions(callType === 'video');
      if (!permission.microphone || (callType === 'video' && !permission.camera)) {
        Alert.alert('Media permission needed', callType === 'video' ? 'Allow microphone and camera access before starting a video call.' : 'Allow microphone access before starting a voice call.');
        return;
      }
      const result = await endpoints.startCall(conversationId, callType);
      router.push(`/call/${result.call_session.id}?type=${callType}&ready=1` as never);
    } catch (error) {
      captureCallError(error, 'create', { call_type: callType, conversation_id: conversationId });
      try {
        const refreshed = await endpoints.conversationSummary(conversationId);
        queryClient.setQueryData(mobileQueryKeys.conversation(conversationId), refreshed);
        if (refreshed.active_call) {
          Alert.alert('Call already active', 'Join the call already running in this conversation?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Join', onPress: () => router.push(`/call/${refreshed.active_call?.id}?type=${refreshed.active_call?.call_type}` as never) }]);
          return;
        }
      } catch { /* Preserve the original error. */ }
      Alert.alert('Unable to start call', apiErrorMessage(error));
    }
  };
  const pickAttachment = async () => {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (!result.canceled) setAttachment(result.assets[0]);
  };
  const react = useMutation({
    mutationFn: async ({ message, emoji }: { message: Message; emoji: string }) => {
      const removing = message.reacted_emojis?.includes(emoji);
      if (removing) {
        await endpoints.removeMessageReaction(conversationId, message.id, emoji);
        return { emoji, removing: true, result: undefined };
      }
      return { emoji, removing: false, result: await endpoints.reactToMessage(conversationId, message.id, emoji) };
    },
    onSuccess: ({ emoji, removing, result }, { message }) => {
      updateCachedMessage(queryClient, conversationId, message.id, (current) => {
        const reacted = new Set(current.reacted_emojis || []);
        if (removing) reacted.delete(emoji); else reacted.add(emoji);
        const reactions = result?.reactions || { ...(current.reactions && !Array.isArray(current.reactions) ? current.reactions : {}) };
        if (removing) reactions[emoji] = Math.max(0, Number(reactions[emoji] || 1) - 1);
        return { ...current, reactions, reacted_emojis: [...reacted] };
      });
      setReactionMessage(null);
    },
    onError: (error) => Alert.alert('Reaction not updated', apiErrorMessage(error)),
  });

  const loadOlder = useCallback(async () => {
    if (!messages.hasNextPage || olderRequestRef.current) return;
    olderRequestRef.current = true;
    try { await messages.fetchNextPage(); } finally { olderRequestRef.current = false; }
  }, [messages]);
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const atLatest = contentOffset.y + layoutMeasurement.height >= contentSize.height - 72;
    atLatestRef.current = atLatest;
    if (atLatest) {
      setHasUnreadBelow(false);
      const latestId = Number(latestMessage?.id);
      if (focusedRef.current && appActiveRef.current && latestId) void acknowledge(latestId, 'read');
    }
    if (contentOffset.y <= 120 && messages.hasNextPage && !messages.isFetchNextPageError) void loadOlder();
  }, [acknowledge, latestMessage?.id, loadOlder, messages.hasNextPage, messages.isFetchNextPageError]);
  const jumpToLatest = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true });
    atLatestRef.current = true;
    setHasUnreadBelow(false);
    const latestId = Number(latestMessage?.id);
    if (latestId) void acknowledge(latestId, 'read');
  }, [acknowledge, latestMessage?.id]);
  const renderMessage = useCallback(({ item }: { item: Message }) => <MessageBubble conversation={conversation.data} message={item} mine={item.user_id === user?.id} onLongPress={() => item.id > 0 && setReactionMessage(item)} onRetry={retryMessage} userId={user?.id} />, [conversation.data, retryMessage, user?.id]);
  const typingNames = Object.values(typingUsers);
  const subtitle = typingNames.length ? `${typingNames.join(', ')} ${typingNames.length === 1 ? 'is' : 'are'} typing…` : connection === 'connected' ? conversation.data?.conversation_type === 'group' ? `${conversation.data.participants?.length || 0} members` : conversation.data?.participants?.some((participant) => participant.id !== user?.id && participant.online) ? 'Online' : 'Live conversation' : 'Reconnecting…';
  const back = () => router.canGoBack() ? router.back() : router.replace('/inbox' as never);

  return <Screen header={<PageHeader leading={<IconButton label="Back" onPress={back}><ArrowLeft color={theme.text} size={22} /></IconButton>} title={conversation.data?.title || 'Conversation'} subtitle={subtitle} action={writable ? <View style={styles.headerActions}><IconButton label={conversation.data?.active_call ? 'Join active call' : 'Start video call'} onPress={() => startCall('video')}><Video color={conversation.data?.active_call ? theme.success : theme.text} size={20} /></IconButton><IconButton label="More conversation actions" onPress={() => setMenuOpen(true)}><MoreHorizontal color={theme.text} size={22} /></IconButton></View> : <IconButton label="Conversation details" onPress={() => setDetailsOpen(true)}><UsersRound color={theme.text} size={20} /></IconButton>} />}>
    {messages.isPending && !messages.data ? <LoadingState label="Loading conversation" /> : null}
    {messages.isError && !messages.data ? <ErrorState message={apiErrorMessage(messages.error)} onRetry={() => messages.refetch()} /> : null}
    {messages.data ? <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0} style={styles.flex}><FlashList contentContainerStyle={styles.messageList} data={rows} keyExtractor={(item, index) => `${item.id || 'message'}-${index}`} ListEmptyComponent={<EmptyState title="Start the conversation" message="Messages and attachments are delivered in real time." />} ListHeaderComponent={<HistoryState hasMessages={rows.length > 0} hasNextPage={Boolean(messages.hasNextPage)} isError={messages.isFetchNextPageError} isLoading={messages.isFetchingNextPage} onRetry={loadOlder} />} maintainVisibleContentPosition={{ startRenderingFromBottom: true, autoscrollToBottomThreshold: 72, animateAutoScrollToBottom: true }} onScroll={onScroll} ref={listRef} renderItem={renderMessage} scrollEventThrottle={80} />{hasUnreadBelow ? <Pressable accessibilityLabel="Jump to new messages" accessibilityRole="button" onPress={jumpToLatest} style={[styles.newMessages, { backgroundColor: theme.primary }]}><Text style={styles.newMessagesText}>New messages</Text></Pressable> : null}{writable && attachment ? <View style={[styles.attachment, { backgroundColor: theme.surfaceMuted }]}><Text numberOfLines={1} style={[styles.attachmentName, { color: theme.text }]}>{attachment.name}</Text><Pressable accessibilityLabel="Remove attachment" onPress={() => setAttachment(null)}><Text style={{ color: theme.danger, fontWeight: '700' }}>Remove</Text></Pressable></View> : null}{writable ? <View style={[styles.composer, { backgroundColor: theme.surface, borderTopColor: theme.border, paddingBottom: Math.max(10, insets.bottom) }]}><IconButton label="Attach file" onPress={pickAttachment}><FilePlus2 color={theme.textMuted} size={21} /></IconButton><TextInput accessibilityLabel="Message" multiline onChangeText={changeBody} placeholder="Message" placeholderTextColor={theme.textMuted} style={[styles.input, { backgroundColor: theme.surfaceMuted, color: theme.text }]} value={body} /><Pressable accessibilityLabel="Send message" accessibilityRole="button" disabled={!body.trim() && !attachment} onPress={sendCurrent} style={[styles.send, { backgroundColor: theme.primary, opacity: (!body.trim() && !attachment) ? 0.45 : 1 }]}><Send color="#ffffff" size={19} /></Pressable></View> : null}</KeyboardAvoidingView> : null}
    <ReactionPicker message={reactionMessage} onClose={() => setReactionMessage(null)} onSelect={(emoji) => reactionMessage && react.mutate({ message: reactionMessage, emoji })} pending={react.isPending} />
    <HeaderMenu activeCall={conversation.data?.active_call?.id} onAudio={() => startCall('audio')} onClose={() => setMenuOpen(false)} onDetails={() => { setMenuOpen(false); setDetailsOpen(true); }} onJoin={(callId) => { setMenuOpen(false); router.push(`/call/${callId}?type=${conversation.data?.active_call?.call_type || 'audio'}` as never); }} onVideo={() => startCall('video')} visible={menuOpen} />
    <ConversationDetailsSheet conversationId={conversationId} onClose={() => setDetailsOpen(false)} onConversationRemoved={() => { setDetailsOpen(false); router.replace('/inbox' as never); }} readOnly={!writable} visible={detailsOpen} />
  </Screen>;
}

const MessageBubble = memo(function MessageBubble({ conversation, message, mine, onLongPress, onRetry, userId }: { conversation?: Conversation; message: Message; mine: boolean; onLongPress: () => void; onRetry: (messageId: number) => void; userId?: number }) {
  const theme = useAppTheme();
  const receipt = mine && message.id > 0 ? outgoingReceiptState(conversation, message, userId) : null;
  const reactions = reactionEntries(message.reactions);
  return <View style={[styles.bubbleRow, mine && styles.mineRow]}><Pressable accessibilityHint={message.id > 0 ? 'Long press to react' : undefined} accessibilityLabel={message.send_state === 'failed' ? 'Message failed to send' : receipt ? `Message. ${receipt.label}` : 'Message'} delayLongPress={350} onLongPress={onLongPress} style={[styles.bubble, { backgroundColor: mine ? theme.primary : theme.surface, borderColor: message.send_state === 'failed' ? theme.danger : mine ? theme.primary : theme.border }]}>{!mine ? <Text style={[styles.sender, { color: theme.primary }]}>{message.user_name || 'Teammate'}</Text> : null}{message.body ? <Text style={[styles.body, { color: mine ? '#ffffff' : theme.text }]}>{message.body}{'  '}<Text style={[styles.inlineMeta, { color: mine ? '#dbeafe' : theme.textMuted }]}>{formatTime(message.created_at)}{message.send_state === 'sending' ? ' …' : receipt ? <Text style={{ color: receipt.read ? '#86efac' : '#dbeafe' }}> {receipt.symbol}</Text> : null}</Text></Text> : null}{message.attachments?.map((file) => <Attachment key={Number(file.id)} file={file} mine={mine} />)}{message.send_state === 'failed' ? <Pressable accessibilityRole="button" onPress={() => onRetry(message.id)} style={styles.retryMessage}><Text style={styles.retryMessageText}>Not sent · Tap to retry</Text></Pressable> : null}</Pressable>{reactions.length ? <View style={[styles.reactionChips, mine && styles.mineReactionChips]}>{reactions.map(([emoji, count]) => <Pressable key={emoji} accessibilityLabel={`${emoji}, ${count} reactions`} onPress={onLongPress} style={[styles.reactionChip, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text>{emoji} {count}</Text></Pressable>)}</View> : null}</View>;
});

function Attachment({ file, mine }: { file: Record<string, unknown> & { id: number }; mine: boolean }) {
  const theme = useAppTheme();
  const rawUrl = String(file.url || file.download_url || '');
  const url = /^(https?|file|content):/.test(rawUrl) ? rawUrl : absoluteAssetUrl(rawUrl);
  const contentType = String(file.content_type || '');
  const filename = String(file.filename || 'Attachment');
  const open = () => url && void Linking.openURL(url);
  if (url && contentType.startsWith('image/')) return <Pressable accessibilityLabel={`Open ${filename}`} onPress={open}><Image contentFit="cover" source={{ uri: url }} style={styles.messageImage} /><Text numberOfLines={1} style={[styles.file, { color: mine ? '#dbeafe' : theme.textMuted }]}>{filename}</Text></Pressable>;
  return <Pressable accessibilityLabel={`Open ${filename}`} disabled={!url} onPress={open} style={[styles.fileRow, { backgroundColor: mine ? 'rgba(255,255,255,0.12)' : theme.surfaceMuted }]}><FilePlus2 color={mine ? '#dbeafe' : theme.textMuted} size={17} /><Text numberOfLines={1} style={[styles.file, { color: mine ? '#dbeafe' : theme.text }]}>{filename}</Text></Pressable>;
}

function HeaderMenu({ activeCall, onAudio, onClose, onDetails, onJoin, onVideo, visible }: { activeCall?: number; onAudio: () => void; onClose: () => void; onDetails: () => void; onJoin: (id: number) => void; onVideo: () => void; visible: boolean }) {
  const theme = useAppTheme();
  return <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}><Pressable accessibilityLabel="Close conversation menu" onPress={onClose} style={styles.menuBackdrop}><View style={[styles.menu, { backgroundColor: theme.surface }]}>{activeCall ? <MenuAction icon={Phone} label="Join active call" onPress={() => onJoin(activeCall)} /> : <><MenuAction icon={Video} label="Start video call" onPress={onVideo} /><MenuAction icon={Phone} label="Start audio call" onPress={onAudio} /></>}<MenuAction icon={UsersRound} label="Conversation details" onPress={onDetails} /></View></Pressable></Modal>;
}
function MenuAction({ icon: Icon, label, onPress }: { icon: typeof Phone; label: string; onPress: () => void }) { const theme = useAppTheme(); return <Pressable accessibilityRole="menuitem" onPress={onPress} style={styles.menuAction}><Icon color={theme.text} size={19} /><Text style={[styles.menuLabel, { color: theme.text }]}>{label}</Text></Pressable>; }
function HistoryState({ hasMessages, hasNextPage, isError, isLoading, onRetry }: { hasMessages: boolean; hasNextPage: boolean; isError: boolean; isLoading: boolean; onRetry: () => void }) { const theme = useAppTheme(); if (!hasMessages) return null; if (isError) return <Pressable accessibilityRole="button" onPress={onRetry} style={styles.loadOlder}><Text style={{ color: theme.danger, fontWeight: '700' }}>Could not load earlier messages · Retry</Text></Pressable>; if (isLoading) return <View style={styles.loadOlder}><Text style={{ color: theme.textMuted }}>Loading earlier messages…</Text></View>; if (!hasNextPage) return <View style={styles.loadOlder}><Text style={{ color: theme.textMuted }}>Beginning of conversation</Text></View>; return <View style={styles.loadOlder}><Text style={{ color: theme.textMuted }}>Scroll up for earlier messages</Text></View>; }

const REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '😮'];
function ReactionPicker({ message, onClose, onSelect, pending }: { message: Message | null; onClose: () => void; onSelect: (emoji: string) => void; pending: boolean }) { const theme = useAppTheme(); return <Modal animationType="fade" onRequestClose={onClose} transparent visible={Boolean(message)}><Pressable accessibilityLabel="Close reaction picker" onPress={onClose} style={styles.modalBackdrop}><View style={[styles.reactionPicker, { backgroundColor: theme.surface }]}><Text style={[styles.reactionTitle, { color: theme.text }]}>React to message</Text><View style={styles.reactionOptions}>{REACTION_EMOJIS.map((emoji) => <Pressable accessibilityLabel={`React ${emoji}`} accessibilityRole="button" disabled={pending} key={emoji} onPress={() => onSelect(emoji)} style={[styles.reactionOption, message?.reacted_emojis?.includes(emoji) && { backgroundColor: theme.surfaceMuted }]}><Text style={styles.reactionEmoji}>{emoji}</Text></Pressable>)}</View></View></Pressable></Modal>; }
function reactionEntries(reactions: Message['reactions']): Array<[string, number]> { if (!reactions || Array.isArray(reactions)) return []; return Object.entries(reactions).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] > 0); }
function formatTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function IconButton({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) { return <Pressable accessibilityLabel={label} accessibilityRole="button" hitSlop={8} onPress={onPress} style={styles.iconButton}>{children}</Pressable>; }

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerActions: { flexDirection: 'row' },
  iconButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  messageList: { paddingHorizontal: 14, paddingVertical: 12 },
  loadOlder: { alignItems: 'center', minHeight: 44, paddingVertical: 12 },
  bubbleRow: { alignItems: 'flex-start', marginVertical: 3 },
  mineRow: { alignItems: 'flex-end' },
  bubble: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, maxWidth: '86%', paddingHorizontal: 12, paddingVertical: 9 },
  sender: { fontSize: 11, fontWeight: '800', marginBottom: 3 },
  body: { fontSize: 15, lineHeight: 20 },
  inlineMeta: { fontSize: 10, lineHeight: 14 },
  fileRow: { alignItems: 'center', borderRadius: 7, flexDirection: 'row', gap: 7, marginTop: 7, maxWidth: 250, minHeight: 38, paddingHorizontal: 9 },
  file: { flexShrink: 1, fontSize: 12 },
  messageImage: { borderRadius: 7, height: 150, marginTop: 7, width: 220 },
  retryMessage: { marginTop: 7, minHeight: 28, justifyContent: 'center' },
  retryMessageText: { color: '#fecaca', fontSize: 11, fontWeight: '800' },
  reactionChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginLeft: 5, marginTop: -1 },
  mineReactionChips: { justifyContent: 'flex-end', marginLeft: 0, marginRight: 5 },
  reactionChip: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, minHeight: 25, paddingHorizontal: 7, paddingVertical: 2 },
  newMessages: { alignSelf: 'center', borderRadius: 18, bottom: 78, elevation: 3, paddingHorizontal: 15, paddingVertical: 9, position: 'absolute' },
  newMessagesText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)', flex: 1, justifyContent: 'center', padding: 24 },
  reactionPicker: { borderRadius: 14, maxWidth: 360, padding: 18, width: '100%' },
  reactionTitle: { fontSize: 15, fontWeight: '800', marginBottom: 14 },
  reactionOptions: { flexDirection: 'row', justifyContent: 'space-between' },
  reactionOption: { alignItems: 'center', borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
  reactionEmoji: { fontSize: 25 },
  attachment: { alignItems: 'center', flexDirection: 'row', minHeight: 44, paddingHorizontal: 16 },
  attachmentName: { flex: 1, fontSize: 13, marginRight: 12 },
  composer: { alignItems: 'flex-end', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 6, paddingHorizontal: 9, paddingTop: 9 },
  input: { borderRadius: 9, flex: 1, fontSize: 15, maxHeight: 110, minHeight: 44, paddingHorizontal: 13, paddingVertical: 11 },
  send: { alignItems: 'center', borderRadius: 9, height: 44, justifyContent: 'center', width: 44 },
  menuBackdrop: { alignItems: 'flex-end', backgroundColor: 'rgba(0,0,0,0.22)', flex: 1, paddingRight: 12, paddingTop: 72 },
  menu: { borderRadius: 11, minWidth: 230, padding: 6 },
  menuAction: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 48, paddingHorizontal: 12 },
  menuLabel: { fontSize: 14, fontWeight: '700' },
});
