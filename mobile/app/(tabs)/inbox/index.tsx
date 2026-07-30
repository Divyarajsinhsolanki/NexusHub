import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Bell, Heart, MessageCircle, MessagesSquare, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { absoluteAssetUrl, apiErrorMessage } from '@/src/api/client';
import { endpoints } from '@/src/api/endpoints';
import type { CollectionResult, Conversation, Post } from '@/src/api/types';
import { PageHeader } from '@/src/components/PageHeader';
import { Screen } from '@/src/components/Screen';
import { SegmentedControl } from '@/src/components/SegmentedControl';
import { EmptyState, ErrorState, LoadingState } from '@/src/components/StateView';
import { useAppTheme } from '@/src/theme';
import { useAuth } from '@/src/auth/AuthProvider';
import { applyPostToFeed, mobileQueryKeys, updatePostInFeed } from '@/src/cache/mobileCache';

type InboxMode = 'posts' | 'chat';

export default function InboxScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const { user } = useAuth();
  const [mode, setMode] = useState<InboxMode>('posts');
  const posts = useQuery({ queryKey: mobileQueryKeys.posts, queryFn: () => endpoints.posts() });
  const conversations = useQuery({ queryKey: mobileQueryKeys.conversations, queryFn: () => endpoints.conversations() });
  const active = mode === 'posts' ? posts : conversations;

  return (
    <Screen header={<PageHeader title="Inbox" subtitle="Updates and conversations" action={<View style={styles.headerActions}>{!user?.demo_account ? <Pressable accessibilityLabel={mode === 'posts' ? 'Create post' : 'Create message'} onPress={() => router.push(`/create?type=${mode === 'posts' ? 'post' : 'message'}` as never)} style={[styles.iconButton, { backgroundColor: theme.primary }]}><Plus color="#ffffff" size={20} /></Pressable> : null}<Pressable accessibilityLabel="Open notifications" onPress={() => router.push('/inbox/notifications')} style={[styles.iconButton, { backgroundColor: theme.surfaceMuted }]}><Bell color={theme.text} size={20} /></Pressable></View>} />}>
      <View style={styles.segment}><SegmentedControl value={mode} onChange={setMode} options={[{ value: 'posts', label: 'Updates' }, { value: 'chat', label: 'Chat' }]} /></View>
      {active.isPending && !active.data ? <LoadingState label={mode === 'posts' ? 'Loading updates' : 'Loading conversations'} /> : null}
      {active.isError && !active.data ? <ErrorState message="Unable to load inbox." onRetry={() => active.refetch()} /> : null}
      {mode === 'posts' && posts.data ? <PostFeed posts={posts.data.data} /> : null}
      {mode === 'chat' && conversations.data ? <ConversationList conversations={conversations.data.data} /> : null}
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
    onSuccess: (updated) => {
      applyPostToFeed(queryClient, updated);
    },
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(mobileQueryKeys.posts, context.previous);
      Alert.alert('Unable to update reaction', apiErrorMessage(error));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: mobileQueryKeys.posts }),
  });
  return <View style={[styles.post, { borderBottomColor: theme.border }]}><View style={styles.postHeader}><View style={[styles.avatar, { backgroundColor: theme.surfaceMuted }]}><Text style={{ color: theme.primary, fontWeight: '800' }}>{post.user.first_name?.[0]}{post.user.last_name?.[0]}</Text></View><View style={styles.flex}><Text style={[styles.name, { color: theme.text }]}>{post.user.first_name} {post.user.last_name}</Text><Text style={[styles.time, { color: theme.textMuted }]}>{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</Text></View></View><Text style={[styles.message, { color: theme.text }]}>{post.message}</Text>{post.image_url ? <Image contentFit="cover" source={{ uri: absoluteAssetUrl(post.image_url) }} style={styles.postImage} /> : null}<View style={styles.actions}>{!user?.demo_account ? <Pressable accessibilityLabel={post.liked_by_current_user ? 'Unlike post' : 'Like post'} disabled={like.isPending} onPress={() => like.mutate()} style={styles.actionButton}><Heart color={post.liked_by_current_user ? theme.danger : theme.textMuted} fill={post.liked_by_current_user ? theme.danger : 'transparent'} size={18} /><Text style={[styles.actionText, { color: theme.textMuted }]}>{post.likes_count}</Text></Pressable> : <View style={styles.actionButton}><Heart color={theme.textMuted} size={18} /><Text style={[styles.actionText, { color: theme.textMuted }]}>{post.likes_count}</Text></View>}<Pressable accessibilityLabel="Open comments" onPress={() => router.push(`/inbox/post/${post.id}` as never)} style={styles.actionButton}><MessageCircle color={theme.textMuted} size={18} /><Text style={[styles.actionText, { color: theme.textMuted }]}>{post.comments_count}</Text></Pressable></View></View>;
}

function ConversationList({ conversations }: { conversations: Conversation[] }) {
  const theme = useAppTheme();
  const router = useRouter();
  if (!conversations.length) return <EmptyState title="No conversations" message="Start a direct or group conversation from the create button." />;
  return <FlatList contentContainerStyle={styles.list} data={conversations} keyExtractor={(conversation) => String(conversation.id)} renderItem={({ item: conversation }) => <Pressable onPress={() => router.push(`/inbox/chat/${conversation.id}`)} style={[styles.conversation, { borderBottomColor: theme.border }]}><View style={[styles.chatIcon, { backgroundColor: theme.surfaceMuted }]}><MessagesSquare color={theme.primary} size={21} /></View><View style={styles.flex}><Text numberOfLines={1} style={[styles.name, { color: theme.text }]}>{conversation.name || conversation.title || `Conversation ${conversation.id}`}</Text><Text numberOfLines={1} style={[styles.preview, { color: theme.textMuted }]}>{String(conversation.last_message?.body || conversation.last_message?.content || 'Open conversation')}</Text></View>{conversation.unread_count ? <View style={[styles.badge, { backgroundColor: theme.primary }]}><Text style={styles.badgeText}>{conversation.unread_count}</Text></View> : null}</Pressable>} />;
}

const styles = StyleSheet.create({
  segment: { paddingHorizontal: 20, paddingTop: 14 },
  headerActions: { flexDirection: 'row', gap: 7 },
  iconButton: { alignItems: 'center', borderRadius: 8, height: 42, justifyContent: 'center', width: 42 },
  list: { paddingHorizontal: 20, paddingBottom: 36 },
  post: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 19 },
  postHeader: { alignItems: 'center', flexDirection: 'row' },
  avatar: { alignItems: 'center', borderRadius: 20, height: 40, justifyContent: 'center', marginRight: 11, width: 40 },
  flex: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700' },
  time: { fontSize: 12, marginTop: 2 },
  message: { fontSize: 15, lineHeight: 22, marginTop: 13 },
  postImage: { borderRadius: 8, height: 210, marginTop: 13, width: '100%' },
  actions: { alignItems: 'center', flexDirection: 'row', marginTop: 13 },
  actionButton: { alignItems: 'center', flexDirection: 'row', minHeight: 44, marginRight: 15 },
  actionText: { fontSize: 12, marginLeft: 5 },
  conversation: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 76 },
  chatIcon: { alignItems: 'center', borderRadius: 22, height: 44, justifyContent: 'center', marginRight: 12, width: 44 },
  preview: { fontSize: 13, marginTop: 4 },
  badge: { alignItems: 'center', borderRadius: 10, minWidth: 20, paddingHorizontal: 6, paddingVertical: 3 },
  badgeText: { color: '#ffffff', fontSize: 11, fontWeight: '800' },
});
