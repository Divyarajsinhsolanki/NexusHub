import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Send, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { apiErrorMessage } from '@/src/api/client';
import { endpoints } from '@/src/api/endpoints';
import type { CollectionResult, Comment } from '@/src/api/types';
import { useAuth } from '@/src/auth/AuthProvider';
import { mobileQueryKeys, updatePostInFeed } from '@/src/cache/mobileCache';
import { Avatar } from '@/src/components/Avatar';
import { PageHeader } from '@/src/components/PageHeader';
import { Screen } from '@/src/components/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/src/components/StateView';
import { useAppTheme } from '@/src/theme';

export default function PostCommentsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = Number(id);
  const router = useRouter();
  const theme = useAppTheme();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const writable = !user?.demo_account;
  const [body, setBody] = useState('');
  const comments = useQuery({ queryKey: mobileQueryKeys.postComments(postId), queryFn: () => endpoints.postComments(postId), enabled: Number.isFinite(postId) });
  const send = useMutation({
    mutationFn: () => endpoints.createComment(postId, body.trim()),
    onMutate: async () => {
      const text = body.trim();
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
      if (context?.previousComments) queryClient.setQueryData(mobileQueryKeys.postComments(postId), context.previousComments);
      else queryClient.setQueryData(mobileQueryKeys.postComments(postId), { data: [] });
      updatePostInFeed(queryClient, postId, (post) => ({ ...post, comments_count: Math.max(0, post.comments_count - 1) }));
      if (context?.text) setBody(context.text);
      Alert.alert('Comment not sent', apiErrorMessage(error));
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: mobileQueryKeys.postComments(postId) });
      await queryClient.invalidateQueries({ queryKey: mobileQueryKeys.posts });
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
    onError: (_error, _variables, context) => {
      if (context?.previousComments) queryClient.setQueryData(mobileQueryKeys.postComments(postId), context.previousComments);
      else queryClient.setQueryData(mobileQueryKeys.postComments(postId), { data: [] });
      updatePostInFeed(queryClient, postId, (post) => ({ ...post, comments_count: post.comments_count + 1 }));
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: mobileQueryKeys.postComments(postId) });
      await queryClient.invalidateQueries({ queryKey: mobileQueryKeys.posts });
    },
  });
  return <Screen header={<PageHeader leading={<Pressable accessibilityLabel="Back" onPress={() => router.back()} style={styles.iconButton}><ArrowLeft color={theme.text} size={22} /></Pressable>} title="Comments" subtitle="Team discussion" />}>
    {comments.isPending && !comments.data ? <LoadingState /> : null}{comments.isError && !comments.data ? <ErrorState message={apiErrorMessage(comments.error)} onRetry={() => comments.refetch()} /> : null}
    {comments.data ? <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={70} style={styles.flex}><FlatList contentContainerStyle={styles.list} data={comments.data.data} keyExtractor={(item) => String(item.id)} ListEmptyComponent={<EmptyState title="No comments yet" message="Start a focused discussion on this update." />} renderItem={({ item }) => <View style={[styles.comment, { borderBottomColor: theme.border }]}><Avatar color={theme.primary} name={`${item.user.first_name} ${item.user.last_name}`} size={38} uri={item.user.profile_picture} /><View style={styles.copy}><Text style={[styles.name, { color: theme.text }]}>{item.user.first_name} {item.user.last_name}</Text><Text style={[styles.body, { color: theme.text }]}>{item.body}</Text></View>{writable && item.can_delete ? <Pressable accessibilityLabel="Delete comment" onPress={() => remove.mutate(item.id)} style={styles.iconButton}><Trash2 color={theme.danger} size={17} /></Pressable> : null}</View>} />{writable ? <View style={[styles.composer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}><TextInput accessibilityLabel="Comment" multiline onChangeText={setBody} placeholder="Write a comment" placeholderTextColor={theme.textMuted} style={[styles.input, { backgroundColor: theme.surfaceMuted, color: theme.text }]} value={body} /><Pressable accessibilityLabel="Send comment" disabled={!body.trim() || send.isPending} onPress={() => send.mutate()} style={[styles.send, { backgroundColor: theme.primary, opacity: body.trim() ? 1 : 0.45 }]}><Send color="#ffffff" size={19} /></Pressable></View> : null}</KeyboardAvoidingView> : null}
  </Screen>;
}

const styles = StyleSheet.create({ flex: { flex: 1 }, iconButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 }, list: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 20 }, comment: { alignItems: 'flex-start', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 11, paddingVertical: 14 }, copy: { flex: 1 }, name: { fontSize: 13, fontWeight: '800' }, body: { fontSize: 14, lineHeight: 20, marginTop: 5 }, composer: { alignItems: 'flex-end', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 8, padding: 10 }, input: { borderRadius: 8, flex: 1, fontSize: 15, maxHeight: 100, minHeight: 44, paddingHorizontal: 12, paddingVertical: 10 }, send: { alignItems: 'center', borderRadius: 8, height: 44, justifyContent: 'center', width: 44 } });
