import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Archive, ArrowLeft, Bookmark, CheckCircle2, ExternalLink, RefreshCw, Search, Trash2, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { apiErrorMessage } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { EntityRecord } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { PageHeader } from '../components/PageHeader';
import { Screen } from '../components/Screen';
import { EmptyState, ErrorState, LoadingState } from '../components/StateView';
import { contentFor, decodeEntities, discoveryCards, discoverySourceId, generatedBookmark, readable, safeUrl, type DiscoveryCard } from '../knowledge/catalog';
import { useAppTheme } from '../theme';

type Mode = 'discover' | 'daily' | 'inbox' | 'saved' | 'due' | 'archived' | 'history';
type Card = { key: string; title: string; summary: string; category: string; kind: 'discovery' | 'item' | 'bookmark' | 'history'; item?: EntityRecord; definition?: DiscoveryCard };
const modes: Array<{ key: Mode; label: string }> = [{ key: 'discover', label: 'Discover' }, { key: 'daily', label: 'Daily tech' }, { key: 'inbox', label: 'ChatGPT inbox' }, { key: 'saved', label: 'Saved' }, { key: 'due', label: 'Review due' }, { key: 'archived', label: 'Archive' }, { key: 'history', label: 'Prompt history' }];
const categories = [{ key: 'all', label: 'All' }, { key: 'news', label: 'News' }, { key: 'learning', label: 'Learning' }, { key: 'tech', label: 'Technology' }];

export function KnowledgeScreen() {
  const theme = useAppTheme();
  const client = useQueryClient();
  const router = useRouter();
  const { user } = useAuth();
  const { itemId, bookmark_id: bookmarkId } = useLocalSearchParams<{ itemId?: string; bookmark_id?: string }>();
  const { width } = useWindowDimensions();
  const [mode, setMode] = useState<Mode>('discover');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [collection, setCollection] = useState('');
  const [selected, setSelected] = useState<Card | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const openedId = useRef<number | undefined>(undefined);
  const feed = useQuery({ queryKey: ['knowledge-items', 'active'], queryFn: () => endpoints.knowledgeItems(true) });
  const archived = useQuery({ queryKey: ['knowledge-items', 'archived'], queryFn: () => endpoints.knowledgeItems(false) });
  const saved = useQuery({ queryKey: ['knowledge-bookmarks'], queryFn: endpoints.knowledgeBookmarks });
  const history = useQuery({ queryKey: ['knowledge-prompt-runs'], queryFn: endpoints.knowledgePromptRuns, enabled: mode === 'history' });
  useEffect(() => {
    const id = Number(itemId);
    if (!Number.isSafeInteger(id) || id <= 0 || openedId.current === id) return;
    const item = [...(feed.data?.data || []), ...(archived.data?.data || [])].find(row => row.id === id);
    if (item) { openedId.current = id; setMode(item.active === false ? 'archived' : 'discover'); setSelected(itemCard(item, 'item')); }
  }, [itemId, feed.data, archived.data]);
  const openedBookmark = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!bookmarkId || openedBookmark.current === bookmarkId) return;
    const bookmark = saved.data?.data.find(row => row.id === Number(bookmarkId));
    if (bookmark) { openedBookmark.current = bookmarkId; setMode('saved'); setSelected(itemCard(bookmark, 'bookmark')); }
  }, [bookmarkId, saved.data]);
  const items = feed.data?.data || [];
  const bookmarks = saved.data?.data || [];
  const due = bookmarks.filter(item => item.next_reminder_at && new Date(String(item.next_reminder_at)).getTime() <= Date.now());
  const collections = Array.from(new Set(bookmarks.map(item => String(item.collection_name || 'Unsorted'))));
  const cards = useMemo(() => {
    let rows: Card[];
    if (mode === 'discover') rows = [...items.map(item => itemCard(item, 'item')), ...discoveryCards.map(definition => ({ ...definition, key: `discovery:${definition.key}`, kind: 'discovery' as const, definition }))];
    else if (mode === 'daily' || mode === 'inbox') rows = items.filter(item => (item.generated_source === 'bedrock_daily') === (mode === 'daily')).map(item => itemCard(item, 'item'));
    else if (mode === 'archived') rows = (archived.data?.data || []).map(item => itemCard(item, 'item'));
    else if (mode === 'history') rows = (history.data?.data || []).map(item => ({ key: `history:${item.id}`, title: readable(item.prompt) || 'Knowledge prompt', summary: `${readable(item.status)} · ${readable(item.item_count)} cards`, category: readable(item.source), kind: 'history', item }));
    else rows = (mode === 'due' ? due : bookmarks).filter(item => !collection || String(item.collection_name || 'Unsorted') === collection).map(item => itemCard(item, 'bookmark'));
    const query = search.trim().toLowerCase();
    return rows.filter(card => (mode !== 'discover' || category === 'all' || card.category === category) && (!query || `${card.title} ${card.summary} ${card.category} ${readable(card.item?.body)} ${readable(card.item?.payload)}`.toLowerCase().includes(query)));
  }, [mode, items, archived.data, history.data, bookmarks, collection, category, search]);
  const active = mode === 'saved' || mode === 'due' ? saved : mode === 'archived' ? archived : mode === 'history' ? history : feed;
  const refresh = async () => {
    setRefreshing(true);
    try { await Promise.all([active.refetch(), client.invalidateQueries({ queryKey: ['knowledge-discovery'] })]); }
    finally { setRefreshing(false); }
  };
  const columns = width >= 650 ? 2 : 1;
  return <Screen header={<PageHeader title="Knowledge" subtitle="Discover, learn, and save for later" leading={<Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.canGoBack() ? router.back() : router.replace('/more' as never)} style={styles.icon}><ArrowLeft color={theme.text} size={22} /></Pressable>} action={<Pressable accessibilityRole="button" accessibilityLabel="Refresh knowledge" onPress={refresh} style={styles.icon}><RefreshCw color={theme.primary} size={20} /></Pressable>} />}>
    <View style={{ paddingTop: 12 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{modes.map(option => <Chip key={option.key} label={`${option.label}${option.key === 'saved' ? ` (${bookmarks.length})` : option.key === 'due' ? ` (${due.length})` : ''}`} selected={mode === option.key} onPress={() => { setMode(option.key); setCollection(''); setSearch(''); }} />)}</ScrollView>
      <View style={[styles.search, { backgroundColor: theme.surfaceMuted }]}><Search color={theme.textMuted} size={18} /><TextInput accessibilityLabel="Search knowledge" placeholder="Search cards, topics, and notes" placeholderTextColor={theme.textMuted} value={search} onChangeText={setSearch} style={{ flex: 1, color: theme.text, minHeight: 44 }} />{search ? <Pressable accessibilityRole="button" accessibilityLabel="Clear knowledge search" onPress={() => setSearch('')} style={styles.icon}><X color={theme.textMuted} size={18} /></Pressable> : null}</View>
      {mode === 'discover' ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{categories.map(option => <Chip key={option.key} label={option.label} selected={category === option.key} onPress={() => setCategory(option.key)} />)}</ScrollView> : null}
      {(mode === 'saved' || mode === 'due') && collections.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}><Chip label="All collections" selected={!collection} onPress={() => setCollection('')} />{collections.map(name => <Chip key={name} label={name} selected={collection === name} onPress={() => setCollection(name)} />)}</ScrollView> : null}
      <Text style={{ color: theme.textMuted, marginHorizontal: 18, marginBottom: 8, fontSize: 12 }}>{cards.length} {cards.length === 1 ? 'card' : 'cards'}{mode === 'discover' ? ' · Swipe down to refresh' : ''}</Text>
    </View>
    {active.isError ? <View style={{ height: 180 }}><ErrorState message={`Unable to load ${mode === 'discover' ? 'workspace cards' : 'knowledge'}: ${apiErrorMessage(active.error)}`} onRetry={() => active.refetch()} /></View> : null}
    {mode !== 'discover' && active.isLoading ? <LoadingState /> : <FlatList style={{ flex: 1 }} key={columns} numColumns={columns} columnWrapperStyle={columns > 1 ? { gap: 12 } : undefined} contentContainerStyle={styles.list} data={cards} keyExtractor={card => card.key} refreshing={refreshing} onRefresh={refresh} ListEmptyComponent={<EmptyState title={search ? 'No matching cards' : mode === 'daily' ? 'No daily tech cards yet' : mode === 'inbox' ? 'Your ChatGPT inbox is empty' : mode === 'saved' ? 'No saved cards yet' : mode === 'due' ? 'You’re up to date' : mode === 'history' ? 'No prompt history yet' : 'No archived cards'} message={search ? 'Try another keyword or clear the filters.' : mode === 'saved' ? 'Open a Discover card and save it to a collection.' : mode === 'due' ? 'Saved cards appear here when their review reminder is due.' : 'Pull down to refresh. Discover cards are always available in the Discover tab.'} />} renderItem={({ item }) => <KnowledgeTile card={item} scope={user?.workspace?.id} onPress={() => setSelected(item)} />} />}
    {selected ? <KnowledgeDetails key={selected.key} card={selected} bookmarks={bookmarks} scope={user?.workspace?.id} onClose={() => setSelected(null)} /> : null}
  </Screen>;
}
function itemCard(item: EntityRecord, kind: 'item' | 'bookmark'): Card {
  const definition = discoveryCards.find(card => card.key === item.card_type);
  const content = contentFor(item, definition?.title || readable(item.card_type).replace(/_/g, ' ') || 'Knowledge card');
  return { key: `${kind}:${item.id}`, title: content.title, summary: content.summary || content.body, category: readable(item.category || content.payload.category) || definition?.category || 'knowledge', kind, item };
}
function useDiscovery(card: Card, scope?: number, region = 'in', topic = 'global') {
  return useQuery({ queryKey: ['knowledge-discovery', scope, card.definition?.key, new Date().toDateString(), region, topic], queryFn: async ({ signal }) => {
    const data = card.definition?.key === 'local_headlines' ? await endpoints.knowledgeDiscovery('/news/local_headlines', { region }, signal)
      : card.definition?.key === 'policy_briefs' ? await endpoints.knowledgeDiscovery('/news/policy_briefs', { topic }, signal)
      : await card.definition!.load(signal);
    const content = contentFor(data, card.title);
    if (!content.summary && !content.body && !content.entries.length && !content.url && content.title === card.title) throw new Error('No content available');
    return data;
  }, enabled: card.kind === 'discovery', staleTime: 60 * 60 * 1000, retry: false });
}
function KnowledgeTile({ card, scope, onPress }: { card: Card; scope?: number; onPress: () => void }) {
  const theme = useAppTheme();
  const query = useDiscovery(card, scope);
  const content = query.data ? contentFor(query.data, card.title) : null;
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open ${card.title}`} onPress={onPress} style={[styles.card, { backgroundColor: theme.surfaceRaised, borderColor: theme.border }]}>
    <View style={styles.cardTop}><Text style={{ color: theme.primary, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }}>{card.category}</Text>{card.kind === 'bookmark' ? <Bookmark size={17} color={theme.primary} /> : <ExternalLink size={16} color={theme.textMuted} />}</View>
    {content?.image ? <Image source={{ uri: content.image }} resizeMode="cover" style={{ height: 120, width: '100%', borderRadius: 10, marginTop: 10 }} /> : null}
    <Text numberOfLines={2} style={[styles.title, { color: theme.text }]}>{card.title}</Text>
    <Text numberOfLines={3} style={[styles.body, { color: theme.textMuted }]}>{content?.summary || card.summary || 'Open to read the full card.'}</Text>
    <Text style={{ marginTop: 12, color: query.isError ? theme.danger : theme.primary, fontSize: 12, fontWeight: '600' }}>{query.isLoading ? 'Loading latest content…' : query.isError ? 'Could not load · Tap to retry' : card.item?.workspace_shared ? 'Workspace · AI-generated' : 'Tap to read'}</Text>
  </Pressable>;
}
function KnowledgeDetails({ card, bookmarks, scope, onClose }: { card: Card; bookmarks: EntityRecord[]; scope?: number; onClose: () => void }) {
  const theme = useAppTheme();
  const client = useQueryClient();
  const { user } = useAuth();
  const [region, setRegion] = useState('in');
  const [topic, setTopic] = useState('global');
  const query = useDiscovery(card, scope, region, topic);
  const data = card.kind === 'discovery' ? query.data || {} : card.item || {};
  const content = contentFor(data, card.title);
  const saveInput = card.kind === 'item' ? generatedBookmark(card.item!) : { card_type: card.definition?.key || card.item?.card_type, source_id: discoverySourceId(card.definition?.key || String(card.item?.card_type), content.payload), payload: content.payload };
  const existing = card.kind === 'bookmark' ? card.item : bookmarks.find(row => row.card_type === saveInput.card_type && row.source_id === saveInput.source_id);
  const [collection, setCollection] = useState(readable(existing?.collection_name || ('collection_name' in saveInput && saveInput.collection_name)));
  const [answer, setAnswer] = useState<string>();
  const writable = !user?.demo_account;
  const save = useMutation({ mutationFn: () => endpoints.createKnowledgeBookmark({ ...saveInput, collection_name: collection.trim() || null, reminder_interval_days: 7 }), onSuccess: async () => { await client.invalidateQueries({ queryKey: ['knowledge-bookmarks'] }); Alert.alert('Card saved', 'You can find it in Saved.'); }, onError: error => Alert.alert('Unable to save card', apiErrorMessage(error)) });
  const archive = useMutation({ mutationFn: () => endpoints.archiveKnowledgeItem(card.item!.id), onSuccess: async () => { await client.invalidateQueries({ queryKey: ['knowledge-items'] }); onClose(); }, onError: error => Alert.alert('Unable to archive card', apiErrorMessage(error)) });
  const review = useMutation({ mutationFn: () => endpoints.markKnowledgeBookmarkReviewed(existing!.id), onSuccess: async () => { await client.invalidateQueries({ queryKey: ['knowledge-bookmarks'] }); onClose(); }, onError: error => Alert.alert('Unable to mark reviewed', apiErrorMessage(error)) });
  const remove = useMutation({ mutationFn: () => endpoints.deleteKnowledgeBookmark(existing!.id), onSuccess: async () => { await client.invalidateQueries({ queryKey: ['knowledge-bookmarks'] }); onClose(); }, onError: error => Alert.alert('Unable to remove bookmark', apiErrorMessage(error)) });
  const open = (url: string) => { const safe = safeUrl(url); if (safe) void Linking.openURL(safe).catch(() => Alert.alert('Unable to open link')); };
  const quiz = content.payload;
  const options = Array.isArray(quiz.options) ? quiz.options.map(readable) : [];
  return <Modal transparent animationType="slide" visible onRequestClose={onClose}><View style={styles.backdrop}><View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: theme.surfaceRaised }]}>
    <View style={styles.cardTop}><Text style={{ color: theme.primary, fontWeight: '700' }}>{card.category.toUpperCase()}</Text><Pressable accessibilityRole="button" accessibilityLabel="Close knowledge card" onPress={onClose} style={styles.icon}><X color={theme.text} size={22} /></Pressable></View>
    <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
      <Text style={[styles.detailTitle, { color: theme.text }]}>{card.title}</Text>
      {card.definition?.key === 'local_headlines' ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 12 }}>{[{ key: 'in', label: 'India' }, { key: 'us', label: 'US' }, { key: 'gb', label: 'UK' }, { key: 'ca', label: 'Canada' }, { key: 'au', label: 'Australia' }].map(option => <Chip key={option.key} label={option.label} selected={region === option.key} onPress={() => setRegion(option.key)} />)}</ScrollView> : null}
      {card.definition?.key === 'policy_briefs' ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 12 }}>{['global', 'economy', 'technology', 'health'].map(option => <Chip key={option} label={option} selected={topic === option} onPress={() => setTopic(option)} />)}</ScrollView> : null}
      {card.kind === 'discovery' && query.isLoading ? <LoadingState /> : null}
      {query.isError && card.kind === 'discovery' ? <ErrorState message="This source is temporarily unavailable." onRetry={() => query.refetch()} /> : null}
      {content.title !== card.title ? <Text style={[styles.title, { color: theme.text }]}>{content.title}</Text> : null}
      {content.image ? <Image accessibilityLabel={content.title} source={{ uri: content.image }} resizeMode="cover" style={{ height: 200, width: '100%', borderRadius: 12, marginTop: 12 }} /> : null}
      {content.summary ? <Text selectable style={[styles.body, { color: theme.text }]}>{content.summary}</Text> : null}
      {content.body && content.body !== content.summary ? <Text selectable style={[styles.body, { color: theme.text }]}>{content.body}</Text> : null}
      {content.author ? <Text style={[styles.body, { color: theme.textMuted }]}>— {content.author}</Text> : null}
      {content.entries.map((entry, index) => <View key={index} style={[styles.entry, { borderColor: theme.border }]}><Text selectable style={[styles.title, { color: theme.text }]}>{entry.year ? `${entry.year} · ` : ''}{entry.title}</Text>{entry.summary ? <Text selectable style={[styles.body, { color: theme.textMuted }]}>{entry.summary}</Text> : null}{entry.url ? <Action label="Read source" icon={ExternalLink} onPress={() => open(entry.url!)} /> : null}</View>)}
      {options.length ? <View style={{ gap: 8, marginTop: 12 }}>{options.map(option => <Chip key={option} label={decodeEntities(option)} selected={answer === option} onPress={() => setAnswer(option)} />)}{answer ? <Text style={[styles.body, { color: answer === quiz.correctAnswer ? theme.success : theme.danger }]}>{answer === quiz.correctAnswer ? 'Correct!' : `Correct answer: ${readable(quiz.correctAnswer)}`}</Text> : null}</View> : null}
      {content.url ? <Action label="Open source" icon={ExternalLink} onPress={() => open(content.url!)} /> : null}
      {card.kind === 'history' ? <Text selectable style={[styles.body, { color: theme.textMuted }]}>Status: {readable(card.item?.status)}{'\n'}Cards generated: {readable(card.item?.item_count)}{'\n'}Source: {readable(card.item?.source)}</Text> : null}
      {writable && card.kind !== 'history' && (card.kind !== 'discovery' || Boolean(query.data)) ? <View style={[styles.entry, { borderColor: theme.border }]}>
        {existing ? <><Text style={{ color: theme.success, marginBottom: 8 }}>Saved · {readable(existing.collection_name) || 'Unsorted'}</Text><Action label="Mark reviewed" icon={CheckCircle2} disabled={review.isPending} onPress={() => review.mutate()} /><Action label="Remove saved card" icon={Trash2} disabled={remove.isPending} onPress={() => Alert.alert('Remove saved card?', 'The original Knowledge card will stay available.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => remove.mutate() }])} /></> : <><Text style={{ color: theme.textMuted, marginBottom: 6 }}>Save to a collection · Review in 7 days</Text><TextInput accessibilityLabel="Knowledge collection" placeholder="Collection name (optional)" placeholderTextColor={theme.textMuted} value={collection} onChangeText={setCollection} style={[styles.input, { color: theme.text, backgroundColor: theme.surfaceMuted }]} /><Action label={save.isPending ? 'Saving…' : 'Save card'} icon={Bookmark} disabled={save.isPending} onPress={() => save.mutate()} /></>}
        {card.kind === 'item' && card.item?.active !== false && card.item?.can_archive === true ? <Action label="Archive card" icon={Archive} disabled={archive.isPending} onPress={() => Alert.alert('Archive card?', 'Move this card out of your active Knowledge feed.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Archive', onPress: () => archive.mutate() }])} /> : null}
      </View> : null}
    </ScrollView>
  </View></View></Modal>;
}
function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useAppTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.chip, { borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.surfaceMuted : theme.surface }]}><Text style={{ color: selected ? theme.primary : theme.textMuted, fontWeight: '700', fontSize: 13 }}>{label}</Text></Pressable>;
}
function Action({ label, icon: Icon, onPress, disabled }: { label: string; icon: typeof Bookmark; onPress: () => void; disabled?: boolean }) {
  const theme = useAppTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={[styles.action, { opacity: disabled ? 0.5 : 1 }]}><Icon color={theme.primary} size={18} /><Text style={{ color: theme.primary, fontWeight: '700' }}>{label}</Text></Pressable>;
}
const styles = StyleSheet.create({
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  chips: { paddingHorizontal: 16, paddingBottom: 10, gap: 8 }, chip: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11, minHeight: 44, justifyContent: 'center' },
  search: { marginHorizontal: 16, marginBottom: 12, borderRadius: 12, paddingLeft: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  list: { paddingHorizontal: 16, paddingBottom: 40, flexGrow: 1 }, card: { flex: 1, borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12, minHeight: 176 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, title: { fontSize: 16, fontWeight: '700', lineHeight: 22, marginTop: 10 }, body: { fontSize: 14, lineHeight: 22, marginTop: 8 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(2,6,23,0.55)' }, sheet: { maxHeight: '90%', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 24 }, detailTitle: { fontSize: 23, fontWeight: '800', lineHeight: 30 },
  entry: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 16, paddingTop: 12 }, action: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 10 }, input: { minHeight: 48, borderRadius: 10, paddingHorizontal: 12 },
});
