import { formatDistanceToNow } from 'date-fns';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Send, Trash2 } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { apiErrorMessage } from '@/src/api/client';
import { endpoints } from '@/src/api/endpoints';
import type { CollectionResult, Comment, Post } from '@/src/api/types';
import { useAuth } from '@/src/auth/AuthProvider';
import { mobileQueryKeys, updatePostInFeed } from '@/src/cache/mobileCache';
import { Avatar } from '@/src/components/Avatar';
import { PostAttachment } from '@/src/components/PostAttachment';
import { PageHeader } from '@/src/components/PageHeader';
import { Screen } from '@/src/components/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/src/components/StateView';
import { useAppTheme } from '@/src/theme';

export function PostCommentsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = Number(id);
  const router = useRouter();
  const theme = useAppTheme();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const validPostId = Number.isSafeInteger(postId) && postId > 0;
  const writable = Boolean(user) && !user?.demo_account && validPostId;
  const listRef = useRef<FlatList<Comment>>(null);
  const [body, setBody] = useState('');
  useEffect(() => { setBody(''); }, [postId]);
  const post = useQuery({ queryKey: mobileQueryKeys.post(postId), queryFn: () => endpoints.post(postId), enabled: validPostId });
  const comments = useQuery({ queryKey: mobileQueryKeys.postComments(postId), queryFn: () => endpoints.postComments(postId), enabled: validPostId });
  const send = useMutation({
    mutationFn: (text: string) => endpoints.createComment(postId, text),
    onMutate: async (text: string) => {
      const optimisticId = -Date.now();
      await queryClient.cancelQueries({ queryKey: mobileQueryKeys.postComments(postId) });
      await queryClient.cancelQueries({ queryKey: mobileQueryKeys.posts });
      const previousComments = queryClient.getQueryData<CollectionResult<Comment>>(mobileQueryKeys.postComments(postId));
      const optimistic: Comment = {
        id: optimisticId,
        body: text,
        can_delete: false,
        created_at: new Date().toISOString(),
        user: {
          id: user?.id || 0,
          first_name: user?.first_name || 'You',
          last_name: user?.last_name || '',
          profile_picture: user?.profile_picture,
        },
      };
      setBody('');
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
      queryClient.setQueryData<CollectionResult<Comment>>(mobileQueryKeys.postComments(postId), (previous) => ({
        ...(previous || { data: [] }),
        data: [...(previous?.data || []), optimistic],
      }));
      updatePostInFeed(queryClient, postId, (post) => ({ ...post, comments_count: post.comments_count + 1 }));
      return { optimisticId, previousComments, text };
    },
    onSuccess: (created, _variables, context) => {
      if (!context) return;
      queryClient.setQueryData<CollectionResult<Comment>>(mobileQueryKeys.postComments(postId), (previous) => {
        if (!previous) return previous;
        return {
          ...previous,
          data: previous.data.map((comment) => Number(comment.id) === context.optimisticId ? created : comment),
        };
      });
    },
    onError: (error, _variables, context) => {
      queryClient.setQueryData<CollectionResult<Comment>>(mobileQueryKeys.postComments(postId), (previous) => previous ? { ...previous, data: previous.data.filter((comment) => comment.id !== context?.optimisticId) } : previous);
      updatePostInFeed(queryClient, postId, (post) => ({ ...post, comments_count: Math.max(0, post.comments_count - 1) }));
      if (context?.text) setBody((current) => current || context.text);
      Alert.alert('Comment not sent', apiErrorMessage(error));
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: mobileQueryKeys.postComments(postId) });
      await queryClient.invalidateQueries({ queryKey: mobileQueryKeys.posts });
      await queryClient.invalidateQueries({ queryKey: mobileQueryKeys.post(postId) });
    },
  });
  const remove = useMutation({
    mutationFn: (commentId: number) => endpoints.deleteComment(postId, commentId),
    onMutate: async (commentId) => {
      await queryClient.cancelQueries({ queryKey: mobileQueryKeys.postComments(postId) });
      await queryClient.cancelQueries({ queryKey: mobileQueryKeys.posts });
      const previousComments = queryClient.getQueryData<CollectionResult<Comment>>(mobileQueryKeys.postComments(postId));
      queryClient.setQueryData<CollectionResult<Comment>>(mobileQueryKeys.postComments(postId), (previous) => {
        if (!previous) return previous;
        return { ...previous, data: previous.data.filter((comment) => Number(comment.id) !== Number(commentId)) };
      });
      updatePostInFeed(queryClient, postId, (post) => ({ ...post, comments_count: Math.max(0, post.comments_count - 1) }));
      return { previousComments };
    },
    onError: (error, _variables, context) => {
      if (context?.previousComments) queryClient.setQueryData(mobileQueryKeys.postComments(postId), context.previousComments);
      else queryClient.setQueryData(mobileQueryKeys.postComments(postId), { data: [] });
      updatePostInFeed(queryClient, postId, (post) => ({ ...post, comments_count: post.comments_count + 1 }));
      Alert.alert('Unable to delete comment', apiErrorMessage(error));
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: mobileQueryKeys.postComments(postId) });
      await queryClient.invalidateQueries({ queryKey: mobileQueryKeys.posts });
      await queryClient.invalidateQueries({ queryKey: mobileQueryKeys.post(postId) });
    },
  });
  const refresh = () => Promise.all([post.refetch(), comments.refetch()]);
  const confirmDelete = (comment: Comment) => Alert.alert('Delete comment?', 'This removes the comment from the discussion.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(comment.id) },
  ]);
  if (!validPostId) return <Screen header={<PageHeader title="Post unavailable" />}><EmptyState title="Post unavailable" message="This post link is invalid." /></Screen>;
  return <Screen header={<PageHeader leading={<Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.iconButton}><ArrowLeft color={theme.text} size={22} /></Pressable>} title="Discussion" subtitle={`${comments.data?.data.length ?? post.data?.comments_count ?? 0} comments`} />}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={70} style={styles.flex}>
      <FlatList ref={listRef} contentContainerStyle={styles.list} data={comments.data?.data || []} keyExtractor={(item) => String(item.id)} keyboardShouldPersistTaps="handled" onRefresh={() => void refresh()} refreshing={comments.isRefetching || post.isRefetching}
        ListHeaderComponent={<View style={styles.context}>
          {post.data ? <PostContext post={post.data} /> : post.isError ? <ErrorState message={apiErrorMessage(post.error)} onRetry={() => post.refetch()} /> : <LoadingState label="Loading post" />}
          <Text style={[styles.discussionTitle, { color: theme.text }]}>Comments</Text>
          {comments.isError ? <ErrorState message={apiErrorMessage(comments.error)} onRetry={() => comments.refetch()} /> : null}
        </View>}
        ListEmptyComponent={comments.isPending ? <LoadingState label="Loading comments" /> : !comments.isError ? <EmptyState title="Start the conversation" message="Share a thought or ask a question about this update." /> : null}
        renderItem={({ item }) => <View style={[styles.comment, { borderBottomColor: theme.border }]}>
          <Avatar color={theme.primary} name={commentName(item)} size={38} uri={item.user.profile_picture} />
          <View style={styles.copy}><View style={styles.commentHeading}><Text style={[styles.name, { color: theme.text }]}>{commentName(item)}{item.user.id === user?.id ? ' · You' : ''}</Text><Text style={[styles.time, { color: theme.textMuted }]}>{item.id < 0 ? 'Sending…' : formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}</Text></View><Text selectable style={[styles.body, { color: theme.text }]}>{item.body}</Text></View>
          {writable && item.can_delete ? <Pressable accessibilityRole="button" accessibilityLabel={`Delete comment by ${commentName(item)}`} disabled={remove.isPending || send.isPending} onPress={() => confirmDelete(item)} style={styles.iconButton}><Trash2 color={theme.danger} size={17} /></Pressable> : null}
        </View>} />
      {writable ? <View style={[styles.composer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
        <Avatar name={user?.full_name || 'You'} uri={user?.profile_picture} size={32} />
        <TextInput accessibilityLabel="Comment" multiline editable={!send.isPending} onChangeText={setBody} placeholder="Add to the discussion…" placeholderTextColor={theme.textMuted} style={[styles.input, { backgroundColor: theme.surfaceMuted, color: theme.text }]} value={body} />
        <Pressable accessibilityRole="button" accessibilityLabel={send.isPending ? 'Sending comment' : 'Send comment'} accessibilityState={{ disabled: !body.trim() || send.isPending || remove.isPending }} disabled={!body.trim() || send.isPending || remove.isPending} onPress={() => send.mutate(body.trim())} style={[styles.send, { backgroundColor: theme.primary, opacity: body.trim() && !send.isPending ? 1 : 0.45 }]}><Send color="#ffffff" size={19} /></Pressable>
      </View> : user?.demo_account ? <Text style={[styles.demoNote, { color: theme.textMuted }]}>Comments are read only in the demo.</Text> : null}
    </KeyboardAvoidingView>
  </Screen>;
}

function commentName(comment: Comment) { return [comment.user.first_name, comment.user.last_name].filter(Boolean).join(' ') || 'Workspace member'; }
function PostContext({ post }: { post: Post }) {
  const theme = useAppTheme();
  const name = [post.user.first_name, post.user.last_name].filter(Boolean).join(' ') || 'Workspace member';
  return <View style={[styles.postContext, { backgroundColor: theme.surface, borderColor: theme.border }]}><View style={styles.postAuthor}><Avatar name={name} uri={post.user.profile_picture} size={42} /><View style={styles.copy}><Text style={[styles.name, { color: theme.text }]}>{name}</Text><Text style={[styles.time, { color: theme.textMuted }]}>{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</Text></View></View><Text selectable style={[styles.postMessage, { color: theme.text }]}>{post.message}</Text><PostAttachment uri={post.image_url} /><Text style={[styles.time, { color: theme.textMuted }]}>{post.likes_count} likes</Text></View>;
}
export default PostCommentsScreen;

const styles = StyleSheet.create({
  flex: { flex: 1 }, iconButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 }, list: { flexGrow: 1, padding: 16 }, context: { marginBottom: 6 }, postContext: { padding: 16, gap: 12, borderRadius: 14, borderWidth: 1 }, postAuthor: { flexDirection: 'row', alignItems: 'center', gap: 12 }, postMessage: { fontSize: 16, lineHeight: 24 }, discussionTitle: { fontSize: 17, fontWeight: '700', marginTop: 24, marginBottom: 8 },
  comment: { alignItems: 'flex-start', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10, paddingVertical: 14 }, copy: { flex: 1, minWidth: 0 }, commentHeading: { gap: 3 }, name: { fontSize: 13, fontWeight: '700' }, time: { fontSize: 11, lineHeight: 16 }, body: { fontSize: 14, lineHeight: 21, marginTop: 6 }, composer: { alignItems: 'flex-end', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 8, padding: 12 }, input: { borderRadius: 14, flex: 1, fontSize: 15, maxHeight: 120, minHeight: 44, padding: 12 }, send: { alignItems: 'center', borderRadius: 12, height: 44, justifyContent: 'center', width: 44 }, demoNote: { padding: 16, fontSize: 12, textAlign: 'center' },
});
