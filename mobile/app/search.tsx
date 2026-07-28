import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ArrowLeft, FileText, FolderKanban, Search, UserRound, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { apiErrorMessage } from '@/src/api/client';
import { endpoints } from '@/src/api/endpoints';
import type { EntityRecord } from '@/src/api/types';
import { Screen } from '@/src/components/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/src/components/StateView';
import { useAppTheme } from '@/src/theme';

export default function SearchScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => { const timer = setTimeout(() => setQuery(input.trim()), 250); return () => clearTimeout(timer); }, [input]);
  const results = useQuery({ queryKey: ['global-search', query], queryFn: () => endpoints.search(query), enabled: query.length >= 2 });
  const open = (item: EntityRecord) => {
    const type = String(item.type);
    if (type === 'project') router.push(`/projects/${item.id}`);
    else if (type === 'task') { const projectId = String(item.path || '').match(/projects\/(\d+)/)?.[1]; router.push(projectId ? `/projects/${projectId}?taskId=${item.id}` as never : '/work'); }
    else if (type === 'pdf_document') router.push(`/more/pdf/${item.id}` as never);
    else if (type === 'knowledge') router.push('/more/knowledge');
    else if (type === 'post') router.push('/inbox');
    else router.push('/more/people');
  };
  return <Screen><View style={[styles.header, { borderBottomColor: theme.border }]}><Pressable accessibilityLabel="Close search" onPress={() => router.back()} style={styles.iconButton}><ArrowLeft color={theme.text} size={22} /></Pressable><View style={[styles.searchBox, { backgroundColor: theme.surfaceMuted }]}><Search color={theme.textMuted} size={19} /><TextInput accessibilityLabel="Search Nexus Hub" autoFocus onChangeText={setInput} placeholder="Search tasks, projects, people..." placeholderTextColor={theme.textMuted} returnKeyType="search" style={[styles.input, { color: theme.text }]} value={input} />{input ? <Pressable accessibilityLabel="Clear search" onPress={() => setInput('')}><X color={theme.textMuted} size={18} /></Pressable> : null}</View></View>
    {query.length < 2 ? <EmptyState title="Search your workspace" message="Enter at least two characters to find work across Nexus Hub." /> : null}
    {results.isLoading ? <LoadingState label="Searching" /> : null}{results.isError ? <ErrorState message={apiErrorMessage(results.error)} onRetry={() => results.refetch()} /> : null}
    {results.data ? <FlatList contentContainerStyle={styles.list} data={results.data.data} keyboardShouldPersistTaps="handled" keyExtractor={(item) => `${item.type}-${item.id}`} ListEmptyComponent={<EmptyState title="No results" message={`Nothing matched “${query}”.`} />} renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => open(item)} style={[styles.row, { borderBottomColor: theme.border }]}><ResultIcon type={String(item.type)} /><View style={styles.copy}><Text numberOfLines={1} style={[styles.title, { color: theme.text }]}>{String(item.title || 'Untitled')}</Text><Text numberOfLines={2} style={[styles.subtitle, { color: theme.textMuted }]}>{String(item.subtitle || item.type)}</Text></View><Text style={[styles.type, { color: theme.primary }]}>{String(item.type).replace('_', ' ')}</Text></Pressable>} /> : null}
  </Screen>;
}

function ResultIcon({ type }: { type: string }) { const theme = useAppTheme(); const Icon = type === 'project' || type === 'task' ? FolderKanban : type === 'pdf_document' ? FileText : type === 'user' ? UserRound : Search; return <View style={[styles.resultIcon, { backgroundColor: theme.surfaceMuted }]}><Icon color={theme.primary} size={20} /></View>; }

const styles = StyleSheet.create({ header: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 68, paddingHorizontal: 10 }, iconButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 }, searchBox: { alignItems: 'center', borderRadius: 8, flex: 1, flexDirection: 'row', paddingHorizontal: 12 }, input: { flex: 1, fontSize: 15, minHeight: 44, paddingHorizontal: 9 }, list: { paddingHorizontal: 20, paddingBottom: 40 }, row: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 74 }, resultIcon: { alignItems: 'center', borderRadius: 8, height: 42, justifyContent: 'center', marginRight: 12, width: 42 }, copy: { flex: 1, marginRight: 10 }, title: { fontSize: 15, fontWeight: '700' }, subtitle: { fontSize: 12, lineHeight: 17, marginTop: 3 }, type: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' } });
