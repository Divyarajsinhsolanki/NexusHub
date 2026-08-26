import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Bell, Check, Heart, MessageCircle, MicOff, PhoneCall, Plus, Search, UserRound, UsersRound, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { absoluteAssetUrl, apiErrorMessage } from '@/src/api/client';
import { endpoints } from '@/src/api/endpoints';
import type { CollectionResult, Conversation, EntityRecord, Post } from '@/src/api/types';
import { applyPostToFeed, mobileQueryKeys, updatePostInFeed } from '@/src/cache/mobileCache';
import { normalizedParticipants } from '@/src/chat/messageRows';
import { Avatar } from '@/src/components/Avatar';
import { PageHeader } from '@/src/components/PageHeader';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { Screen } from '@/src/components/Screen';
import { SegmentedControl } from '@/src/components/SegmentedControl';
import { EmptyState, ErrorState, LoadingState } from '@/src/components/StateView';
import { useAuth } from '@/src/auth/AuthProvider';
import { useAppTheme } from '@/src/theme';

type InboxMode = 'posts' | 'chat';
type ConversationKind = 'direct' | 'group';

export default function InboxScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<InboxMode>(params.mode === 'chat' ? 'chat' : 'posts');
  const [newConversation, setNewConversation] = useState(false);
  const [search, setSearch] = useState('');
  const posts = useQuery({ queryKey: mobileQueryKeys.posts, queryFn: () => endpoints.posts(), enabled: mode === 'posts' });
  const conversations = useInfiniteQuery({
    queryKey: mobileQueryKeys.conversations,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => endpoints.conversations(Number(pageParam)),
    getNextPageParam: (page) => page.meta?.next_page ?? undefined,
    enabled: mode === 'chat',
  });
  const conversationRows = useMemo(() => conversations.data?.pages.flatMap((page) => page.data) || [], [conversations.data]);
  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return conversationRows;
    return conversationRows.filter((conversation) => conversationTitle(conversation).toLowerCase().includes(query));
  }, [conversationRows, search]);
  const active = mode === 'posts' ? posts : conversations;

  useEffect(() => {
    if (params.mode === 'chat' || params.mode === 'posts') setMode(params.mode);
  }, [params.mode]);

  return (
    <Screen header={<PageHeader title="Inbox" subtitle="Updates and conversations" action={<View style={styles.headerActions}>{!user?.demo_account ? <Pressable accessibilityLabel={mode === 'posts' ? 'Create post' : 'New conversation'} onPress={() => mode === 'posts' ? router.push('/create?type=post' as never) : setNewConversation(true)} style={[styles.iconButton, { backgroundColor: theme.primary }]}><Plus color="#ffffff" size={20} /></Pressable> : null}<Pressable accessibilityLabel="Open notifications" onPress={() => router.push('/inbox/notifications')} style={[styles.iconButton, { backgroundColor: theme.surfaceMuted }]}><Bell color={theme.text} size={20} /></Pressable></View>} /> }>
      <View style={styles.toolbar}>
        <SegmentedControl value={mode} onChange={(next) => { setMode(next); setSearch(''); }} options={[{ value: 'posts', label: 'Updates' }, { value: 'chat', label: 'Chat' }]} />
        {mode === 'chat' ? <View style={[styles.search, { backgroundColor: theme.surface, borderColor: theme.border }]}><Search color={theme.textMuted} size={18} /><TextInput accessibilityLabel="Search conversations" onChangeText={setSearch} placeholder="Search conversations" placeholderTextColor={theme.textMuted} style={[styles.searchInput, { color: theme.text }]} value={search} /></View> : null}
      </View>
      {active.isPending && !active.data ? <LoadingState label={mode === 'posts' ? 'Loading updates' : 'Loading conversations'} /> : null}
      {active.isError && !active.data ? <ErrorState message={apiErrorMessage(active.error)} onRetry={() => active.refetch()} /> : null}
      {mode === 'posts' && posts.data ? <PostFeed posts={posts.data.data} /> : null}
      {mode === 'chat' && conversations.data ? <ConversationList conversations={filteredConversations} loadingMore={conversations.isFetchingNextPage} onEndReached={() => conversations.hasNextPage && conversations.fetchNextPage()} /> : null}
      <NewConversationSheet onClose={() => setNewConversation(false)} visible={newConversation} />
    </Screen>
  );
}

function PostFeed({ posts }: { posts: Post[] }) {
  if (!posts.length) return <EmptyState title="No updates yet" message="Team posts will appear here." />;
  return <FlatList contentContainerStyle={styles.list} data={posts} keyExtractor={(post) => String(post.id)} renderItem={({ item }) => <PostCard post={item} />} />;
}

function PostCard({ post }: { post: Post }) {
  const theme = useAppTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const like = useMutation({
    mutationFn: () => post.liked_by_current_user ? endpoints.unlikePost(post.id) : endpoints.likePost(post.id),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: mobileQueryKeys.posts });
      const previous = queryClient.getQueryData<CollectionResult<Post>>(mobileQueryKeys.posts);
      updatePostInFeed(queryClient, post.id, (current) => ({
        ...current,
        liked_by_current_user: !current.liked_by_current_user,
        likes_count: Math.max(0, current.likes_count + (current.liked_by_current_user ? -1 : 1)),
      }));
      return { previous };
    },
    onSuccess: (updated) => applyPostToFeed(queryClient, updated),
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(mobileQueryKeys.posts, context.previous);
      Alert.alert('Unable to update reaction', apiErrorMessage(error));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: mobileQueryKeys.posts }),
  });
  return <View style={[styles.post, { borderBottomColor: theme.border }]}><View style={styles.postHeader}><Avatar name={`${post.user.first_name} ${post.user.last_name}`} size={42} uri={absoluteAssetUrl(post.user.profile_picture)} /><View style={styles.postCopy}><Text style={[styles.name, { color: theme.text }]}>{post.user.first_name} {post.user.last_name}</Text><Text style={[styles.time, { color: theme.textMuted }]}>{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</Text></View></View><Text style={[styles.message, { color: theme.text }]}>{post.message}</Text>{post.image_url ? <Image contentFit="cover" source={{ uri: absoluteAssetUrl(post.image_url) }} style={styles.postImage} /> : null}<View style={styles.actions}>{!user?.demo_account ? <Pressable accessibilityLabel={post.liked_by_current_user ? 'Unlike post' : 'Like post'} disabled={like.isPending} onPress={() => like.mutate()} style={styles.actionButton}><Heart color={post.liked_by_current_user ? theme.danger : theme.textMuted} fill={post.liked_by_current_user ? theme.danger : 'transparent'} size={18} /><Text style={[styles.actionText, { color: theme.textMuted }]}>{post.likes_count}</Text></Pressable> : null}<Pressable accessibilityLabel="Open comments" onPress={() => router.push(`/inbox/post/${post.id}` as never)} style={styles.actionButton}><MessageCircle color={theme.textMuted} size={18} /><Text style={[styles.actionText, { color: theme.textMuted }]}>{post.comments_count}</Text></Pressable></View></View>;
}

function ConversationList({ conversations, loadingMore, onEndReached }: { conversations: Conversation[]; loadingMore: boolean; onEndReached: () => void }) {
  if (!conversations.length) return <EmptyState title="No conversations" message="Start a direct or group conversation from the create button." />;
  return <FlatList contentContainerStyle={styles.conversationList} data={conversations} keyExtractor={(conversation) => String(conversation.id)} ListFooterComponent={loadingMore ? <LoadingState label="Loading more" /> : null} onEndReached={onEndReached} onEndReachedThreshold={0.4} renderItem={({ item }) => <ConversationRow conversation={item} />} />;
}

function ConversationRow({ conversation }: { conversation: Conversation }) {
  const theme = useAppTheme();
  const router = useRouter();
  const { user } = useAuth();
  const participants = normalizedParticipants(conversation.participants);
  const other = participants.find((participant) => participant.id !== user?.id);
  const group = conversation.conversation_type === 'group';
  const online = !group && Boolean(other?.online);
  return <Pressable accessibilityLabel={`Open ${conversationTitle(conversation)}`} accessibilityRole="button" onPress={() => router.push(`/chat/${conversation.id}` as never)} style={({ pressed }) => [styles.conversation, { backgroundColor: pressed ? theme.surfaceMuted : theme.background, borderBottomColor: theme.border }]}><View><Avatar name={conversationTitle(conversation)} size={48} uri={!group ? absoluteAssetUrl(other?.profile_picture) : undefined} /><View style={[styles.presence, { backgroundColor: online ? theme.success : theme.border, borderColor: theme.background }]} /></View><View style={styles.conversationCopy}><View style={styles.conversationTitleRow}><Text numberOfLines={1} style={[styles.name, { color: theme.text }]}>{conversationTitle(conversation)}</Text>{conversation.muted ? <MicOff color={theme.textMuted} size={14} /> : null}</View><Text numberOfLines={1} style={[styles.preview, { color: theme.textMuted }]}>{conversationPreview(conversation)}</Text></View><View style={styles.conversationMeta}>{conversation.active_call ? <PhoneCall color={theme.success} size={17} /> : null}{conversation.unread_count ? <View style={[styles.badge, { backgroundColor: theme.primary }]}><Text style={styles.badgeText}>{conversation.unread_count > 99 ? '99+' : conversation.unread_count}</Text></View> : null}<Text style={[styles.kind, { color: theme.textMuted }]}>{group ? `${participants.length} people` : online ? 'Online' : ''}</Text></View></Pressable>;
}

function NewConversationSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const theme = useAppTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [kind, setKind] = useState<ConversationKind>('direct');
  const [title, setTitle] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const users = useQuery({ queryKey: ['users', 'new-conversation'], queryFn: () => endpoints.users({ per_page: 100 }), enabled: visible });
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (users.data?.data || []).filter((person) => person.id !== user?.id && (!query || personName(person).toLowerCase().includes(query) || String(person.email || '').toLowerCase().includes(query)));
  }, [search, user?.id, users.data]);
  const create = useMutation({
    mutationFn: async () => {
      const ids = [...selected];
      if (kind === 'direct') return endpoints.startDirectConversation(ids[0]);
      return endpoints.createConversation({ title: title.trim(), participant_ids: ids });
    },
    onSuccess: async (conversation) => {
      await queryClient.invalidateQueries({ queryKey: mobileQueryKeys.conversations });
      reset();
      onClose();
      router.push(`/chat/${conversation.id}` as never);
    },
    onError: (error) => Alert.alert('Unable to start conversation', apiErrorMessage(error)),
  });
  const reset = () => { setKind('direct'); setTitle(''); setSearch(''); setSelected(new Set()); };
  const close = () => { reset(); onClose(); };
  const toggle = (id: number) => setSelected((current) => {
    if (kind === 'direct') return new Set(current.has(id) ? [] : [id]);
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const valid = selected.size > 0 && (kind === 'direct' || Boolean(title.trim()));

  return <Modal animationType="slide" onRequestClose={close} presentationStyle="pageSheet" visible={visible}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.sheet, { backgroundColor: theme.background }]}><View style={[styles.sheetHeader, { borderBottomColor: theme.border }]}><Pressable accessibilityLabel="Close new conversation" onPress={close} style={styles.sheetButton}><X color={theme.text} size={22} /></Pressable><View style={styles.sheetTitleCopy}><Text style={[styles.sheetTitle, { color: theme.text }]}>New conversation</Text><Text style={[styles.sheetSubtitle, { color: theme.textMuted }]}>{selected.size ? `${selected.size} selected` : 'Choose who to message'}</Text></View><View style={styles.sheetButton} /></View><View style={styles.sheetBody}><SegmentedControl value={kind} onChange={(next) => { setKind(next); setSelected(new Set()); }} options={[{ value: 'direct', label: 'Direct' }, { value: 'group', label: 'Group' }]} />{kind === 'group' ? <TextInput accessibilityLabel="Group name" onChangeText={setTitle} placeholder="Group name" placeholderTextColor={theme.textMuted} style={[styles.field, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]} value={title} /> : null}<View style={[styles.search, { backgroundColor: theme.surface, borderColor: theme.border }]}><Search color={theme.textMuted} size={18} /><TextInput accessibilityLabel="Search workspace people" onChangeText={setSearch} placeholder="Search people" placeholderTextColor={theme.textMuted} style={[styles.searchInput, { color: theme.text }]} value={search} /></View></View>{users.isPending ? <LoadingState label="Loading workspace people" /> : null}{users.isError ? <ErrorState message={apiErrorMessage(users.error)} onRetry={() => users.refetch()} /> : null}{users.data ? <FlatList data={rows} keyExtractor={(item) => String(item.id)} keyboardShouldPersistTaps="handled" renderItem={({ item }) => { const checked = selected.has(item.id); const name = personName(item); return <Pressable accessibilityRole={kind === 'direct' ? 'radio' : 'checkbox'} accessibilityState={{ checked }} onPress={() => toggle(item.id)} style={[styles.person, { borderBottomColor: theme.border }]}><Avatar color={String(item.avatar_color || theme.primary)} name={name} size={44} uri={absoluteAssetUrl(item.profile_picture as string)} /><View style={styles.personCopy}><Text style={[styles.name, { color: theme.text }]}>{name}</Text><Text numberOfLines={1} style={[styles.preview, { color: theme.textMuted }]}>{String(item.job_title || item.email || 'Workspace member')}</Text></View><View style={[styles.check, { backgroundColor: checked ? theme.primary : theme.surface, borderColor: checked ? theme.primary : theme.border }]}>{checked ? <Check color="#ffffff" size={16} /> : kind === 'group' ? <UsersRound color={theme.textMuted} size={15} /> : <UserRound color={theme.textMuted} size={15} />}</View></Pressable>; }} /> : null}<View style={[styles.sheetFooter, { borderTopColor: theme.border }]}><PrimaryButton disabled={!valid || create.isPending} label={kind === 'direct' ? 'Start chat' : 'Create group'} loading={create.isPending} onPress={() => create.mutate()} /></View></KeyboardAvoidingView></Modal>;
}

function conversationTitle(conversation: Conversation) { return conversation.title || conversation.name || `Conversation ${conversation.id}`; }
function conversationPreview(conversation: Conversation) {
  if (typeof conversation.last_message === 'string') return conversation.last_message || 'Open conversation';
  return conversation.last_message?.body || conversation.last_message?.content || (conversation.active_call ? 'Call in progress' : 'Open conversation');
}
function personName(person: EntityRecord) { return String(person.name || person.full_name || [person.first_name, person.last_name].filter(Boolean).join(' ') || person.email || 'Workspace member'); }

const styles = StyleSheet.create({
  toolbar: { gap: 12, paddingHorizontal: 16, paddingTop: 12 },
  headerActions: { flexDirection: 'row', gap: 7 },
  iconButton: { alignItems: 'center', borderRadius: 9, height: 42, justifyContent: 'center', width: 42 },
  search: { alignItems: 'center', borderRadius: 9, borderWidth: 1, flexDirection: 'row', minHeight: 44, paddingHorizontal: 12 },
  searchInput: { flex: 1, fontSize: 14, minHeight: 42, paddingHorizontal: 9, paddingVertical: 8 },
  list: { paddingBottom: 36, paddingHorizontal: 16 },
  post: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 18 },
  postHeader: { alignItems: 'center', flexDirection: 'row' },
  postCopy: { flex: 1, marginLeft: 11 },
  name: { flexShrink: 1, fontSize: 15, fontWeight: '700' },
  time: { fontSize: 12, marginTop: 2 },
  message: { fontSize: 15, lineHeight: 22, marginTop: 13 },
  postImage: { borderRadius: 10, height: 220, marginTop: 13, width: '100%' },
  actions: { alignItems: 'center', flexDirection: 'row', marginTop: 10 },
  actionButton: { alignItems: 'center', flexDirection: 'row', marginRight: 15, minHeight: 44 },
  actionText: { fontSize: 12, marginLeft: 5 },
  conversationList: { flexGrow: 1, paddingBottom: 32, paddingTop: 8 },
  conversation: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 78, paddingHorizontal: 16, paddingVertical: 11 },
  conversationCopy: { flex: 1, marginLeft: 12, minWidth: 0 },
  conversationTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  preview: { fontSize: 13, marginTop: 4 },
  conversationMeta: { alignItems: 'flex-end', gap: 4, marginLeft: 10 },
  presence: { borderRadius: 6, borderWidth: 2, bottom: 0, height: 12, position: 'absolute', right: 0, width: 12 },
  badge: { alignItems: 'center', borderRadius: 10, minWidth: 20, paddingHorizontal: 6, paddingVertical: 3 },
  badgeText: { color: '#ffffff', fontSize: 10, fontWeight: '800' },
  kind: { fontSize: 10 },
  sheet: { flex: 1 },
  sheetHeader: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 68, paddingHorizontal: 8 },
  sheetButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  sheetTitleCopy: { alignItems: 'center', flex: 1 },
  sheetTitle: { fontSize: 18, fontWeight: '800' },
  sheetSubtitle: { fontSize: 11, marginTop: 2 },
  sheetBody: { gap: 12, padding: 16 },
  field: { borderRadius: 9, borderWidth: 1, fontSize: 15, minHeight: 46, paddingHorizontal: 13 },
  person: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 70, paddingHorizontal: 16 },
  personCopy: { flex: 1, marginLeft: 12 },
  check: { alignItems: 'center', borderRadius: 17, borderWidth: 1, height: 34, justifyContent: 'center', width: 34 },
  sheetFooter: { borderTopWidth: StyleSheet.hairlineWidth, padding: 16 },
});
