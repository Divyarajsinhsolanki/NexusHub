import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, FilePlus2, Phone, Send, Video } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';

import { apiErrorMessage } from '@/src/api/client';
import { endpoints } from '@/src/api/endpoints';
import type { Message } from '@/src/api/types';
import { useAuth } from '@/src/auth/AuthProvider';
import { MOBILE_CACHE_PAGE_LIMIT, mobileQueryKeys } from '@/src/cache/mobileCache';
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
  const conversation = useQuery({ queryKey: mobileQueryKeys.conversation(conversationId), queryFn: () => endpoints.conversation(conversationId), enabled: Number.isFinite(conversationId) });
  const messages = useInfiniteQuery({
    queryKey: mobileQueryKeys.messages(conversationId),
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) => endpoints.messages(conversationId, pageParam),
    getNextPageParam: (page) => Number(page.meta?.next_before_id) || undefined,
    enabled: Number.isFinite(conversationId),
    maxPages: MOBILE_CACHE_PAGE_LIMIT,
  });
  const rows = useMemo(() => [...(messages.data?.pages || [])].reverse().flatMap((page) => page.data), [messages.data]);

  const onRealtime = useCallback((event: ChatEvent) => {
    void handleMobileRealtimeEvent(queryClient, event);
  }, [queryClient]);
  const connection = useChatRealtime(conversationId, onRealtime);

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
          ListHeaderComponent={messages.hasNextPage ? <Pressable onPress={() => messages.fetchNextPage()} style={styles.loadOlder}><Text style={{ color: theme.primary, fontWeight: '700' }}>{messages.isFetchingNextPage ? 'Loading...' : 'Load earlier messages'}</Text></Pressable> : null}
          renderItem={({ item }) => <MessageBubble message={item} mine={item.user_id === user?.id} />}
        />
        {writable && attachment ? <View style={[styles.attachment, { backgroundColor: theme.surfaceMuted }]}><Text numberOfLines={1} style={[styles.attachmentName, { color: theme.text }]}>{attachment.name}</Text><Pressable accessibilityLabel="Remove attachment" onPress={() => setAttachment(null)}><Text style={{ color: theme.danger, fontWeight: '700' }}>Remove</Text></Pressable></View> : null}
        {writable ? <View style={[styles.composer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
          <IconButton label="Attach file" onPress={pickAttachment}><FilePlus2 color={theme.textMuted} size={21} /></IconButton>
          <TextInput accessibilityLabel="Message" multiline onChangeText={setBody} placeholder="Message" placeholderTextColor={theme.textMuted} style={[styles.input, { backgroundColor: theme.surfaceMuted, color: theme.text }]} value={body} />
          <Pressable accessibilityLabel="Send message" accessibilityRole="button" disabled={(!body.trim() && !attachment) || send.isPending} onPress={() => send.mutate()} style={[styles.send, { backgroundColor: theme.primary, opacity: (!body.trim() && !attachment) ? 0.45 : 1 }]}><Send color="#ffffff" size={19} /></Pressable>
        </View> : null}
      </KeyboardAvoidingView> : null}
    </Screen>
  );
}

function MessageBubble({ message, mine }: { message: Message; mine: boolean }) {
  const theme = useAppTheme();
  return <View style={[styles.bubbleRow, mine && styles.mineRow]}><View style={[styles.bubble, { backgroundColor: mine ? theme.primary : theme.surface, borderColor: mine ? theme.primary : theme.border }]}>{!mine ? <Text style={[styles.sender, { color: theme.primary }]}>{message.user_name || 'Teammate'}</Text> : null}<Text style={[styles.body, { color: mine ? '#ffffff' : theme.text }]}>{message.body || 'Attachment'}</Text>{message.attachments?.map((file) => <Text key={Number(file.id)} numberOfLines={1} style={[styles.file, { color: mine ? '#dbeafe' : theme.textMuted }]}>{String(file.filename || 'File')}</Text>)}</View></View>;
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
  file: { fontSize: 12, marginTop: 6 },
  attachment: { alignItems: 'center', flexDirection: 'row', minHeight: 44, paddingHorizontal: 16 },
  attachmentName: { flex: 1, fontSize: 13, marginRight: 12 },
  composer: { alignItems: 'flex-end', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 7, padding: 10 },
  input: { borderRadius: 8, flex: 1, fontSize: 15, maxHeight: 110, minHeight: 44, paddingHorizontal: 13, paddingVertical: 11 },
  send: { alignItems: 'center', borderRadius: 8, height: 44, justifyContent: 'center', width: 44 },
});
