import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { ArrowLeft, Phone, Video } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { apiErrorMessage } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { CallHistoryEntry } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { PageHeader } from '../components/PageHeader';
import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { EmptyState, ErrorState, LoadingState } from '../components/StateView';
import { useAppTheme } from '../theme';

export function formatCallDuration(seconds: number) {
  const value = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(value / 3600);
  return hours ? `${hours}h ${Math.floor(value % 3600 / 60)}m ${value % 60}s` : `${Math.floor(value / 60)}m ${value % 60}s`;
}
export function CallHistoryScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const { user } = useAuth();
  const [focused, setFocused] = useState(true);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  const pending = useRef(false);
  const query = useInfiniteQuery({ queryKey: ['call-history', user?.workspace.id], initialPageParam: 1,
    queryFn: ({pageParam}) => endpoints.callHistory(pageParam), getNextPageParam: page => page.meta?.next_page || undefined,
    enabled: Boolean(user) && focused, refetchInterval: false });
  const callback = useMutation({ mutationFn: async (entry: CallHistoryEntry) => {
    const response = await endpoints.startCall(entry.conversation_id, entry.call_type);
    return response.call_session;
  }, onSuccess: call => router.push(`/call/${call.id}?type=${call.call_type}` as never), onError: error => Alert.alert('Unable to call back', apiErrorMessage(error)) });
  const callBack = async (entry: CallHistoryEntry) => {
    if (pending.current || user?.demo_account || !entry.can_callback) return;
    pending.current = true;
    try { await callback.mutateAsync(entry); } catch { /* Mutation displays the error. */ } finally { pending.current = false; }
  };
  const rows = [...new Map((query.data?.pages.flatMap(page => page.data) || []).map(row => [row.id, row])).values()];
  return <Screen header={<PageHeader title="Call history" subtitle="Recent voice and video calls" leading={<Pressable accessibilityLabel="Back" onPress={() => router.back()} style={styles.button}><ArrowLeft color={theme.text} size={22}/></Pressable>}/>}>
    {query.isPending && !query.data ? <LoadingState label="Loading calls"/> : null}
    {query.isError ? <ErrorState message={apiErrorMessage(query.error)} onRetry={() => query.isFetchNextPageError ? query.fetchNextPage() : query.refetch()}/> : null}
    {query.data ? <FlashList data={rows} keyExtractor={row => String(row.id)} contentContainerStyle={styles.list} onRefresh={() => { if (!query.isFetching) void query.refetch(); }} refreshing={query.isRefetching && !query.isFetchingNextPage} onEndReached={() => { if (query.hasNextPage && !query.isFetching) void query.fetchNextPage(); }}
      ListEmptyComponent={<EmptyState title="No calls yet" message="Your call history will appear here."/>}
      ListFooterComponent={query.isFetchingNextPage ? <LoadingState label="Loading older calls"/> : query.hasNextPage ? <PrimaryButton label="Load older calls" disabled={query.isFetching} onPress={() => { if (!query.isFetching) void query.fetchNextPage(); }}/> : null}
      renderItem={({item}) => <View style={[styles.row, {backgroundColor:theme.surface,borderColor:theme.border}]}><View style={[styles.icon,{backgroundColor:theme.surfaceMuted}]}>{item.call_type === 'video' ? <Video color={theme.primary} size={22}/> : <Phone color={theme.primary} size={22}/>}</View><View style={styles.copy}><Pressable disabled={!item.can_open_conversation} accessibilityRole={item.can_open_conversation ? 'button' : undefined} accessibilityLabel={`Open conversation with ${item.title}`} onPress={() => router.push(`/chat/${item.conversation_id}` as never)}><Text numberOfLines={2} style={[styles.title,{color:theme.text}]}>{item.title}</Text></Pressable><Text style={[styles.meta,{color:item.participant_status === 'missed' || item.status === 'missed' ? theme.danger : theme.textMuted}]}>{item.direction} · {item.participant_status === 'missed' ? 'missed' : item.status} · {formatCallDuration(item.duration_seconds)}</Text><Text style={[styles.date,{color:theme.textMuted}]}>{new Date(item.created_at).toLocaleString()}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`Call back ${item.title}`} disabled={!item.can_callback || user?.demo_account || callback.isPending} onPress={() => { void callBack(item); }} style={[styles.callback,{backgroundColor:theme.primary,opacity:!item.can_callback || user?.demo_account || callback.isPending ? 0.4 : 1}]}><Phone size={18} color="#fff"/></Pressable></View>}/>: null}
  </Screen>;
}
const styles=StyleSheet.create({
  button:{width:44,height:44,alignItems:'center',justifyContent:'center'}, list:{padding:20,paddingBottom:40},
  row:{flexDirection:'row',alignItems:'center',gap:12,borderWidth:1,borderRadius:16,padding:14,marginBottom:10},
  icon:{width:42,height:42,borderRadius:12,alignItems:'center',justifyContent:'center'},copy:{flex:1,minWidth:0},title:{fontSize:14,fontWeight:'800'},meta:{fontSize:12,marginTop:5,textTransform:'capitalize'},date:{fontSize:11,marginTop:5},callback:{width:44,height:44,borderRadius:12,alignItems:'center',justifyContent:'center'},
});
