import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import * as WebBrowser from 'expo-web-browser';
import { format } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Bookmark, CalendarPlus, ChevronRight, ExternalLink, FilePlus2, FileText, Plus, RefreshCw, Search, Settings2 } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { apiErrorMessage } from '@/src/api/client';
import { endpoints } from '@/src/api/endpoints';
import type { CalendarEvent, EntityRecord, PdfDocument } from '@/src/api/types';
import { useAuth } from '@/src/auth/AuthProvider';
import { EntityCollectionScreen, type EntityField } from '@/src/components/EntityCollectionScreen';
import { PageHeader } from '@/src/components/PageHeader';
import { Screen } from '@/src/components/Screen';
import { SegmentedControl } from '@/src/components/SegmentedControl';
import { EmptyState, ErrorState, LoadingState } from '@/src/components/StateView';
import { useAppTheme } from '@/src/theme';

const configs: Record<string, { title: string; subtitle: string; path: string; wrapper: string; primary: string; secondary: string[]; fields: EntityField[]; permission?: string }> = {
  teams: { title: 'Teams', subtitle: 'Members, capabilities, and goals', path: '/teams', wrapper: 'team', primary: 'name', secondary: ['description', 'users'], fields: [{ key: 'name', label: 'Team name' }, { key: 'description', label: 'Description', multiline: true }], permission: 'teams.manage' },
  skills: { title: 'Skills', subtitle: 'Your capabilities and proficiency', path: '/user_skills', wrapper: 'user_skill', primary: 'name', secondary: ['proficiency_label', 'endorsements_count'], fields: [{ key: 'name', label: 'Skill name' }, { key: 'proficiency', label: 'Proficiency', placeholder: 'beginner, intermediate, advanced, expert' }] },
  goals: { title: 'Learning goals', subtitle: 'Outcomes, checkpoints, and progress', path: '/learning_goals', wrapper: 'learning_goal', primary: 'title', secondary: ['due_date', 'progress'], fields: [{ key: 'title', label: 'Goal' }, { key: 'description', label: 'Description', multiline: true }, { key: 'due_date', label: 'Due date', placeholder: 'YYYY-MM-DD' }] },
  people: { title: 'People', subtitle: 'Workspace directory and availability', path: '/users', wrapper: 'user', primary: 'full_name', secondary: ['job_title', 'email'], fields: [{ key: 'first_name', label: 'First name' }, { key: 'last_name', label: 'Last name' }, { key: 'email', label: 'Email' }, { key: 'job_title', label: 'Job title' }], permission: 'users.manage' },
  departments: { title: 'Departments', subtitle: 'Organization structure and membership', path: '/departments', wrapper: 'department', primary: 'name', secondary: ['description', 'users_count'], fields: [{ key: 'name', label: 'Department name' }, { key: 'description', label: 'Description', multiline: true }], permission: 'departments.manage' },
  vault: { title: 'Vault', subtitle: 'Private notes and references', path: '/items', wrapper: 'item', primary: 'title', secondary: ['category', 'content'], fields: [{ key: 'title', label: 'Title' }, { key: 'category', label: 'Category' }, { key: 'content', label: 'Content', multiline: true }] },
};

export default function MoreFeatureScreen() {
  const { feature } = useLocalSearchParams<{ feature: string }>();
  const { user } = useAuth();
  const config = configs[feature];
  if (config) return <EntityCollectionScreen {...config} canWrite={!config.permission || Boolean(user?.permissions?.includes(config.permission))} />;
  if (feature === 'calendar') return <CalendarScreen />;
  if (feature === 'momentum') return <MomentumScreen />;
  if (feature === 'knowledge') return <KnowledgeScreen />;
  if (feature === 'pdf') return <PdfLibraryScreen />;
  if (feature === 'keka') return <KekaScreen />;
  if (feature === 'settings') return <SettingsScreen />;
  if (feature === 'admin') return <AdminScreen />;
  if (feature === 'website') return <WebsiteScreen />;
  return <Screen header={<BackHeader title="Not available" />}><EmptyState title="Feature unavailable" message="This workspace has not enabled this module." /></Screen>;
}

function CalendarScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const events = useQuery({ queryKey: ['calendar-events'], queryFn: () => endpoints.calendarEvents() });
  return <Screen header={<BackHeader title="Calendar" subtitle="Events, reminders, and schedules" action={<Pressable accessibilityLabel="Create event" onPress={() => router.push('/create?type=event' as never)} style={[styles.action, { backgroundColor: theme.primary }]}><CalendarPlus color="#ffffff" size={20} /></Pressable>} />}>
    {events.isLoading ? <LoadingState label="Loading calendar" /> : null}
    {events.isError ? <ErrorState message={apiErrorMessage(events.error)} onRetry={() => events.refetch()} /> : null}
    {events.data ? <FlatList contentContainerStyle={styles.list} data={events.data.data} keyExtractor={(item) => String(item.id)} onRefresh={() => events.refetch()} refreshing={events.isRefetching} ListEmptyComponent={<EmptyState title="No upcoming events" message="Create an event or import an ICS calendar." />} renderItem={({ item }) => <CalendarRow event={item} />} /> : null}
  </Screen>;
}

function CalendarRow({ event }: { event: CalendarEvent }) {
  const theme = useAppTheme();
  const date = new Date(event.start_at);
  return <View style={[styles.calendarRow, { backgroundColor: theme.surface, borderColor: theme.border }]}><View style={[styles.dateBlock, { backgroundColor: theme.surfaceMuted }]}><Text style={[styles.month, { color: theme.primary }]}>{format(date, 'MMM').toUpperCase()}</Text><Text style={[styles.day, { color: theme.text }]}>{format(date, 'd')}</Text></View><View style={styles.flex}><Text style={[styles.rowTitle, { color: theme.text }]}>{event.title}</Text><Text style={[styles.rowMeta, { color: theme.textMuted }]}>{event.all_day ? 'All day' : format(date, 'h:mm a')}{event.location_or_meet_link ? ` · ${event.location_or_meet_link}` : ''}</Text></View></View>;
}

function MomentumScreen() {
  const theme = useAppTheme();
  const query = useQuery({ queryKey: ['momentum'], queryFn: endpoints.momentum });
  const data = query.data as Record<string, any> | undefined;
  const briefing = data?.morning_briefing || {};
  const reflection = data?.reflection || {};
  const cards = [
    { label: 'Focus', value: briefing.focus_tasks?.length || 0, detail: 'tasks lined up' },
    { label: 'Overdue', value: briefing.overdue_tasks?.length || 0, detail: 'need attention' },
    { label: 'Meetings', value: briefing.meetings?.length || 0, detail: 'scheduled today' },
    { label: 'Yesterday', value: reflection.yesterday?.total_minutes || 0, detail: 'minutes logged' },
  ];
  return <Screen header={<BackHeader title="Momentum Hub" subtitle="Your daily focus and reflection" />}>
    {query.isLoading ? <LoadingState label="Building your briefing" /> : null}
    {query.isError ? <ErrorState message={apiErrorMessage(query.error)} onRetry={() => query.refetch()} /> : null}
    {data ? <ScrollView contentContainerStyle={styles.scroll}><Text style={[styles.eyebrow, { color: theme.textMuted }]}>{format(new Date(), 'EEEE, MMMM d').toUpperCase()}</Text><Text style={[styles.heroTitle, { color: theme.text }]}>Keep the important work moving.</Text><View style={styles.metricGrid}>{cards.map((card) => <View key={card.label} style={[styles.metric, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text style={[styles.metricLabel, { color: theme.textMuted }]}>{card.label}</Text><Text style={[styles.metricValue, { color: theme.text }]}>{card.value}</Text><Text style={[styles.metricDetail, { color: theme.textMuted }]}>{card.detail}</Text></View>)}</View><TaskSection title="Focus now" rows={briefing.focus_tasks || []} /><TaskSection title="Needs triage" rows={briefing.needs_triage || []} /></ScrollView> : null}
  </Screen>;
}

function TaskSection({ title, rows }: { title: string; rows: EntityRecord[] }) {
  const theme = useAppTheme();
  if (!rows.length) return null;
  return <View style={styles.section}><Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>{rows.map((row) => <View key={row.id} style={[styles.simpleRow, { borderBottomColor: theme.border }]}><View style={styles.flex}><Text style={[styles.rowTitle, { color: theme.text }]}>{String(row.title)}</Text><Text style={[styles.rowMeta, { color: theme.textMuted }]}>{String(row.project_name || row.status || '')}</Text></View></View>)}</View>;
}

function KnowledgeScreen() {
  const theme = useAppTheme();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'feed' | 'saved'>('feed');
  const feed = useQuery({ queryKey: ['knowledge-items'], queryFn: endpoints.knowledgeItems });
  const saved = useQuery({ queryKey: ['knowledge-bookmarks'], queryFn: endpoints.knowledgeBookmarks });
  const active = mode === 'feed' ? feed : saved;
  const save = useMutation({ mutationFn: (item: EntityRecord) => endpoints.createKnowledgeBookmark({ card_type: String(item.item_type || 'knowledge'), collection_name: item.collection_name, source_id: String(item.id), payload: item }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['knowledge-bookmarks'] }) });
  return <Screen header={<BackHeader title="Knowledge" subtitle="Briefings, prompts, and saved cards" />}><View style={styles.segment}><SegmentedControl value={mode} onChange={setMode} options={[{ value: 'feed', label: 'Briefing' }, { value: 'saved', label: 'Saved' }]} /></View>
    {active.isLoading ? <LoadingState /> : null}{active.isError ? <ErrorState message={apiErrorMessage(active.error)} onRetry={() => active.refetch()} /> : null}
    {active.data ? <FlatList contentContainerStyle={styles.list} data={active.data.data} keyExtractor={(item) => String(item.id)} ListEmptyComponent={<EmptyState title={mode === 'feed' ? 'No briefing cards' : 'No saved cards'} message="Knowledge collected for your workspace appears here." />} renderItem={({ item }) => <View style={[styles.knowledgeCard, { backgroundColor: theme.surface, borderColor: theme.border }]}><View style={styles.knowledgeHeader}><Text style={[styles.knowledgeType, { color: theme.primary }]}>{String(item.category || item.card_type || 'KNOWLEDGE').toUpperCase()}</Text>{mode === 'feed' ? <Pressable accessibilityLabel="Save knowledge card" onPress={() => save.mutate(item)}><Bookmark color={theme.textMuted} size={19} /></Pressable> : null}</View><Text style={[styles.rowTitle, { color: theme.text }]}>{String(item.title || (item.payload as Record<string, unknown>)?.title || 'Knowledge card')}</Text><Text numberOfLines={5} style={[styles.knowledgeBody, { color: theme.textMuted }]}>{String(item.summary || item.body || (item.payload as Record<string, unknown>)?.summary || '')}</Text></View>} /> : null}
  </Screen>;
}

function PdfLibraryScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const docs = useQuery({ queryKey: ['pdf-documents'], queryFn: endpoints.pdfDocuments });
  const upload = useMutation({ mutationFn: (file: DocumentPicker.DocumentPickerAsset) => endpoints.uploadPdf(file), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pdf-documents'] }), onError: (error) => Alert.alert('Upload failed', apiErrorMessage(error)) });
  const pick = async () => { const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true }); if (!result.canceled) upload.mutate(result.assets[0]); };
  return <Screen header={<BackHeader title="PDF Master" subtitle="Secure document workspace" action={<Pressable accessibilityLabel="Upload PDF" onPress={pick} style={[styles.action, { backgroundColor: theme.primary }]}><FilePlus2 color="#ffffff" size={20} /></Pressable>} />}>
    {upload.isPending ? <View style={[styles.uploading, { backgroundColor: theme.surfaceMuted }]}><RefreshCw color={theme.primary} size={17} /><Text style={{ color: theme.text }}>Uploading and inspecting document...</Text></View> : null}
    {docs.isLoading ? <LoadingState label="Loading documents" /> : null}{docs.isError ? <ErrorState message={apiErrorMessage(docs.error)} onRetry={() => docs.refetch()} /> : null}
    {docs.data ? <FlatList contentContainerStyle={styles.list} data={docs.data.data} keyExtractor={(item) => String(item.id)} ListEmptyComponent={<EmptyState title="No PDF documents" message="Upload a PDF to edit, organize, export, and share it." />} renderItem={({ item }) => <PdfRow document={item} onPress={() => router.push(`/more/pdf/${item.id}` as never)} />} /> : null}
  </Screen>;
}

function PdfRow({ document, onPress }: { document: PdfDocument; onPress: () => void }) {
  const theme = useAppTheme();
  return <Pressable onPress={onPress} style={[styles.pdfRow, { backgroundColor: theme.surface, borderColor: theme.border }]}><View style={[styles.fileIcon, { backgroundColor: '#fff1f2' }]}><FileText color={theme.danger} size={23} /></View><View style={styles.flex}><Text numberOfLines={1} style={[styles.rowTitle, { color: theme.text }]}>{document.title}</Text><Text style={[styles.rowMeta, { color: theme.textMuted }]}>{document.page_count || 0} pages · {formatBytes(document.byte_size || 0)}</Text></View><ChevronRight color={theme.textMuted} size={19} /></Pressable>;
}

function SettingsScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const prefs = user?.preferences?.notification_preferences || {};
  const mutation = useMutation({ mutationFn: async ({ key, value }: { key: string; value: boolean }) => { await endpoints.updateMe({ notification_preferences: { ...prefs, [key]: value } }); await refreshUser(); }, onSuccess: () => queryClient.invalidateQueries(), onError: (error) => Alert.alert('Unable to save setting', apiErrorMessage(error)) });
  const options = [{ key: 'email_notifications', label: 'Email notifications', detail: 'Account and workspace email updates' }, { key: 'push_notifications', label: 'Push notifications', detail: 'Tasks, mentions, calls, and reminders' }, { key: 'calendar_reminders', label: 'Calendar reminders', detail: 'Upcoming events and schedules' }, { key: 'chat_notifications', label: 'Chat notifications', detail: 'Messages, mentions, and missed calls' }];
  return <Screen header={<BackHeader title="Settings" subtitle="Appearance, alerts, and account behavior" />}><ScrollView contentContainerStyle={styles.scroll}><Text style={[styles.sectionTitle, { color: theme.text }]}>Notifications</Text><View style={[styles.settingsPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}>{options.map((option, index) => <View key={option.key} style={[styles.settingRow, index > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}><View style={styles.flex}><Text style={[styles.rowTitle, { color: theme.text }]}>{option.label}</Text><Text style={[styles.rowMeta, { color: theme.textMuted }]}>{option.detail}</Text></View><Switch accessibilityLabel={option.label} disabled={mutation.isPending} onValueChange={(value) => mutation.mutate({ key: option.key, value })} trackColor={{ false: theme.surfaceMuted, true: theme.primary }} value={prefs[option.key] ?? true} /></View>)}</View><Text style={[styles.sectionTitle, { color: theme.text }]}>Security</Text><Pressable onPress={() => router.push('/more/profile')} style={[styles.settingsLink, { backgroundColor: theme.surface, borderColor: theme.border }]}><Settings2 color={theme.primary} size={20} /><View style={styles.flex}><Text style={[styles.rowTitle, { color: theme.text }]}>Device sessions</Text><Text style={[styles.rowMeta, { color: theme.textMuted }]}>Review and revoke signed-in devices from Profile.</Text></View></Pressable></ScrollView></Screen>;
}

function KekaScreen() {
  const theme = useAppTheme();
  const queryClient = useQueryClient();
  const profile = useQuery({ queryKey: ['keka-profile'], queryFn: () => endpoints.rawResource<Record<string, unknown>>('/keka/profile') });
  const refresh = useMutation({
    mutationFn: endpoints.kekaRefresh,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['keka-profile'] }),
    onError: (error) => Alert.alert('Unable to refresh Keka', apiErrorMessage(error)),
  });
  const payload = profile.data?.keka as Record<string, unknown> | undefined;
  const data = payload?.data as Record<string, unknown> | undefined;
  const rows = data ? Object.entries(data).filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value)).slice(0, 24) : [];
  return <Screen header={<BackHeader title="Keka profile" subtitle="Employee information synced to Nexus Hub" action={<Pressable accessibilityLabel="Refresh Keka profile" disabled={refresh.isPending} onPress={() => refresh.mutate()} style={[styles.action, { backgroundColor: theme.primary }]}><RefreshCw color="#ffffff" size={20} /></Pressable>} />}>
    {profile.isLoading ? <LoadingState label="Loading Keka profile" /> : null}
    {profile.isError ? <ErrorState message={apiErrorMessage(profile.error)} onRetry={() => profile.refetch()} /> : null}
    {profile.data ? <ScrollView contentContainerStyle={styles.scroll}>{rows.length ? rows.map(([key, value]) => <View key={key} style={[styles.simpleRow, { borderBottomColor: theme.border }]}><Text style={[styles.rowMeta, { color: theme.textMuted }]}>{humanize(key)}</Text><Text style={[styles.rowTitle, { color: theme.text, marginTop: 4 }]}>{String(value)}</Text></View>) : <EmptyState title="Keka is not connected" message="Add Keka credentials on the Nexus Hub website, then refresh this profile." />}</ScrollView> : null}
  </Screen>;
}

function AdminScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const tables = useQuery({ queryKey: ['admin-tables'], queryFn: () => endpoints.resource('/admin/tables') });
  const rows = (tables.data?.raw as string[] | undefined) || tables.data?.data.map(String) || [];
  return <Screen header={<BackHeader title="Administration" subtitle="Metadata-driven workspace control" />}>
    {tables.isLoading ? <LoadingState /> : null}{tables.isError ? <ErrorState message={apiErrorMessage(tables.error)} onRetry={() => tables.refetch()} /> : null}
    {tables.data ? <FlatList contentContainerStyle={styles.list} data={rows} keyExtractor={(item) => item} ListEmptyComponent={<EmptyState title="No admin resources" message="Your role does not expose administrative tables." />} renderItem={({ item }) => <Pressable onPress={() => router.push(`/more/admin/${encodeURIComponent(item)}` as never)} style={[styles.adminRow, { borderBottomColor: theme.border }]}><View style={[styles.fileIcon, { backgroundColor: theme.surfaceMuted }]}><Settings2 color={theme.primary} size={20} /></View><Text style={[styles.rowTitle, { color: theme.text, flex: 1 }]}>{humanize(item)}</Text><ChevronRight color={theme.textMuted} size={19} /></Pressable>} /> : null}
  </Screen>;
}

function WebsiteScreen() {
  const theme = useAppTheme();
  const config = useQuery({ queryKey: ['mobile-config'], queryFn: endpoints.config });
  const links = [{ label: 'Portfolio', path: '/' }, { label: 'Contact', path: '/contact' }, { label: 'Privacy', path: '/privacy' }, { label: 'Terms', path: '/terms' }, { label: 'Demo tour', path: '/demo' }, { label: 'Metaverse', path: '/metaverse' }];
  return <Screen header={<BackHeader title="Nexus Hub web" subtitle="Public, legal, and immersive experiences" />}><ScrollView contentContainerStyle={styles.scroll}>{links.map((link) => <Pressable key={link.label} onPress={() => WebBrowser.openBrowserAsync(`${config.data?.web_url || ''}${link.path}`)} style={[styles.settingsLink, { backgroundColor: theme.surface, borderColor: theme.border }]}><ExternalLink color={theme.primary} size={20} /><Text style={[styles.rowTitle, { color: theme.text, flex: 1 }]}>{link.label}</Text><ChevronRight color={theme.textMuted} size={19} /></Pressable>)}</ScrollView></Screen>;
}

function BackHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  const theme = useAppTheme();
  const router = useRouter();
  return <PageHeader leading={<Pressable accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}><ArrowLeft color={theme.text} size={22} /></Pressable>} title={title} subtitle={subtitle} action={action} />;
}

function formatBytes(bytes: number) { if (!bytes) return '0 KB'; return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`; }
function humanize(value: string) { return value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase()); }

const styles = StyleSheet.create({
  flex: { flex: 1 }, back: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 }, action: { alignItems: 'center', borderRadius: 8, height: 42, justifyContent: 'center', width: 42 },
  list: { padding: 20, paddingBottom: 40 }, scroll: { padding: 20, paddingBottom: 40 }, segment: { paddingHorizontal: 20, paddingTop: 14 },
  calendarRow: { alignItems: 'center', borderRadius: 8, borderWidth: 1, flexDirection: 'row', marginBottom: 9, minHeight: 76, padding: 11 }, dateBlock: { alignItems: 'center', borderRadius: 7, height: 52, justifyContent: 'center', marginRight: 12, width: 52 }, month: { fontSize: 10, fontWeight: '800' }, day: { fontSize: 20, fontWeight: '800' }, rowTitle: { fontSize: 15, fontWeight: '700' }, rowMeta: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  eyebrow: { fontSize: 11, fontWeight: '800' }, heroTitle: { fontSize: 25, fontWeight: '800', lineHeight: 32, marginTop: 8, maxWidth: 330 }, metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 22 }, metric: { borderRadius: 8, borderWidth: 1, minHeight: 110, padding: 13, width: '48%' }, metricLabel: { fontSize: 11, fontWeight: '700' }, metricValue: { fontSize: 28, fontWeight: '800', marginTop: 8 }, metricDetail: { fontSize: 11, marginTop: 3 }, section: { marginTop: 28 }, sectionTitle: { fontSize: 17, fontWeight: '800', marginBottom: 10 }, simpleRow: { borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 62, paddingVertical: 11 },
  knowledgeCard: { borderRadius: 8, borderWidth: 1, marginBottom: 10, padding: 15 }, knowledgeHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }, knowledgeType: { fontSize: 10, fontWeight: '800' }, knowledgeBody: { fontSize: 13, lineHeight: 20, marginTop: 8 },
  uploading: { alignItems: 'center', flexDirection: 'row', gap: 9, minHeight: 44, paddingHorizontal: 20 }, pdfRow: { alignItems: 'center', borderRadius: 8, borderWidth: 1, flexDirection: 'row', marginBottom: 9, minHeight: 70, padding: 11 }, fileIcon: { alignItems: 'center', borderRadius: 7, height: 42, justifyContent: 'center', marginRight: 12, width: 42 },
  settingsPanel: { borderRadius: 8, borderWidth: 1, overflow: 'hidden' }, settingRow: { alignItems: 'center', flexDirection: 'row', minHeight: 70, paddingHorizontal: 14 }, settingsLink: { alignItems: 'center', borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 12, marginBottom: 9, minHeight: 66, padding: 13 }, adminRow: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 66 },
});
