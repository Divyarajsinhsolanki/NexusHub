import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import * as WebBrowser from 'expo-web-browser';
import { format } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Archive, ArrowLeft, Bookmark, CalendarPlus, CheckCircle2, ChevronRight, ExternalLink, FilePlus2, FileText, Plus, RefreshCw, Search, Settings2, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { apiErrorMessage } from '@/src/api/client';
import { endpoints } from '@/src/api/endpoints';
import type { CalendarEvent, EntityRecord, PdfDocument } from '@/src/api/types';
import { useAuth } from '@/src/auth/AuthProvider';
import { EntityCollectionScreen, type EntityField } from '@/src/components/EntityCollectionScreen';
import { PageHeader } from '@/src/components/PageHeader';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { Screen } from '@/src/components/Screen';
import { SegmentedControl } from '@/src/components/SegmentedControl';
import { EmptyState, ErrorState, LoadingState } from '@/src/components/StateView';
import { themePresets, useAppTheme } from '@/src/theme';
import { DemoTourScreen } from '@/src/screens/DemoTourScreen';
import { PortfolioAdminScreen } from '@/src/screens/PortfolioAdminScreen';
import { PortfolioScreen } from '@/src/screens/PortfolioScreen';
import { OwnerAccessScreen } from '@/src/screens/OwnerAccessScreen';
import { FullCalendarScreen } from '@/src/screens/CalendarScreen';
import { DepartmentsScreen } from '@/src/screens/DepartmentsScreen';
import { TeamsScreen } from '@/src/screens/TeamsScreen';
import { LearningGoalsScreen } from '@/src/screens/LearningGoalsScreen';

const configs: Record<string, { title: string; subtitle: string; path: string; wrapper: string; primary: string; secondary: string[]; fields: EntityField[]; permission?: string }> = {
  skills: { title: 'Skills', subtitle: 'Your capabilities and proficiency', path: '/user_skills', wrapper: 'user_skill', primary: 'name', secondary: ['proficiency_label', 'endorsements_count'], fields: [{ key: 'name', label: 'Skill name' }, { key: 'proficiency', label: 'Proficiency', placeholder: 'beginner, intermediate, advanced, expert' }] },
  people: { title: 'People', subtitle: 'Workspace directory and availability', path: '/users', wrapper: 'user', primary: 'full_name', secondary: ['job_title', 'email'], fields: [{ key: 'first_name', label: 'First name' }, { key: 'last_name', label: 'Last name' }, { key: 'email', label: 'Email' }, { key: 'job_title', label: 'Job title' }], permission: 'users.manage' },
  vault: { title: 'Vault', subtitle: 'Private notes and references', path: '/items', wrapper: 'item', primary: 'title', secondary: ['category', 'content'], fields: [{ key: 'title', label: 'Title' }, { key: 'category', label: 'Category' }, { key: 'content', label: 'Content', multiline: true }] },
};

const notificationOptions = [
  { key: 'commented', label: 'Comments', detail: 'Replies and comments on your posts' },
  { key: 'assigned', label: 'Assignments', detail: 'Tasks or projects assigned to you' },
  { key: 'update', label: 'Task updates', detail: 'Status changes on work assigned to you' },
  { key: 'chat_message', label: 'Chat messages', detail: 'New messages in your conversations' },
  { key: 'chat_ping', label: 'Chat mentions', detail: 'Direct mentions in chat' },
  { key: 'reacted', label: 'Message reactions', detail: 'Reactions to your chat messages' },
  { key: 'missed_call', label: 'Missed calls', detail: 'Calls you did not answer' },
  { key: 'calendar_reminder', label: 'Calendar reminders', detail: 'Upcoming meetings and reminders' },
  { key: 'digest', label: 'Weekly digest', detail: 'Summary of team activity' },
];

const landingPageOptions = [
  { value: 'calendar', label: 'Calendar' },
  { value: 'posts', label: 'Updates' },
  { value: 'profile', label: 'Profile' },
  { value: 'vault', label: 'Vault' },
  { value: 'knowledge', label: 'Knowledge' },
  { value: 'worklog', label: 'Work logs' },
  { value: 'projects', label: 'Projects' },
  { value: 'teams', label: 'Teams' },
  { value: 'pdf', label: 'PDF Master' },
  { value: 'users', label: 'People' },
  { value: 'departments', label: 'Departments' },
  { value: 'chat', label: 'Chat' },
  { value: 'notifications', label: 'Notifications' },
];

export default function MoreFeatureScreen() {
  const { feature } = useLocalSearchParams<{ feature: string }>();
  const { user } = useAuth();
  const config = configs[feature];
  if (config) return <EntityCollectionScreen {...config} canWrite={!config.permission || Boolean(user?.permissions?.includes(config.permission))} />;
  if (feature === 'teams') return <TeamsScreen />;
  if (feature === 'departments') return <DepartmentsScreen />;
  if (feature === 'goals') return <LearningGoalsScreen />;
  if (feature === 'calendar') return <FullCalendarScreen />;
  if (feature === 'momentum') return <MomentumScreen />;
  if (feature === 'knowledge') return <KnowledgeScreen />;
  if (feature === 'pdf') return <PdfLibraryScreen />;
  if (feature === 'keka') return <KekaScreen />;
  if (feature === 'settings') return <SettingsScreen />;
  if (feature === 'admin') return <AdminScreen />;
  if (feature === 'demo') return <DemoTourScreen />;
  if (feature === 'portfolio') return <PortfolioScreen />;
  if (feature === 'portfolio-admin') return <PortfolioAdminScreen />;
  if (feature === 'impersonation') return <OwnerAccessScreen />;
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
  const { user } = useAuth();
  const [mode, setMode] = useState<'feed' | 'saved' | 'archived'>('feed');
  const feed = useQuery({ queryKey: ['knowledge-items', 'active'], queryFn: () => endpoints.knowledgeItems(true) });
  const saved = useQuery({ queryKey: ['knowledge-bookmarks'], queryFn: endpoints.knowledgeBookmarks });
  const archived = useQuery({ queryKey: ['knowledge-items', 'archived'], queryFn: () => endpoints.knowledgeItems(false) });
  const active = mode === 'feed' ? feed : mode === 'saved' ? saved : archived;
  const save = useMutation({ mutationFn: (item: EntityRecord) => endpoints.createKnowledgeBookmark({ card_type: String(item.item_type || 'knowledge'), collection_name: item.collection_name, source_id: String(item.id), payload: item }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['knowledge-bookmarks'] }) });
  const archiveItem = useMutation({ mutationFn: endpoints.archiveKnowledgeItem, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['knowledge-items'] }); }, onError: (error) => Alert.alert('Unable to archive card', apiErrorMessage(error)) });
  const review = useMutation({ mutationFn: endpoints.markKnowledgeBookmarkReviewed, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['knowledge-bookmarks'] }), onError: (error) => Alert.alert('Unable to mark reviewed', apiErrorMessage(error)) });
  const remove = useMutation({ mutationFn: endpoints.deleteKnowledgeBookmark, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['knowledge-bookmarks'] }), onError: (error) => Alert.alert('Unable to remove bookmark', apiErrorMessage(error)) });
  const emptyTitle = mode === 'feed' ? 'No briefing cards' : mode === 'saved' ? 'No saved cards' : 'No archived cards';
  return <Screen header={<BackHeader title="Knowledge" subtitle="Briefings, prompts, and saved cards" />}><View style={styles.segment}><SegmentedControl value={mode} onChange={setMode} options={[{ value: 'feed', label: 'Briefing' }, { value: 'saved', label: 'Saved' }, { value: 'archived', label: 'Archive' }]} /></View>
    {active.isLoading ? <LoadingState /> : null}{active.isError ? <ErrorState message={apiErrorMessage(active.error)} onRetry={() => active.refetch()} /> : null}
    {active.data ? <FlatList contentContainerStyle={styles.list} data={active.data.data} keyExtractor={(item) => String(item.id)} ListEmptyComponent={<EmptyState title={emptyTitle} message="Knowledge collected for your workspace appears here." />} renderItem={({ item }) => { const payload = item.payload as Record<string, unknown> | undefined; return <View style={[styles.knowledgeCard, { backgroundColor: theme.surface, borderColor: theme.border }]}><View style={styles.knowledgeHeader}><Text style={[styles.knowledgeType, { color: theme.primary }]}>{String(item.category || item.card_type || 'KNOWLEDGE').toUpperCase()}</Text>{!user?.demo_account ? <View style={styles.knowledgeActions}>{mode === 'feed' ? <><Pressable accessibilityLabel="Save knowledge card" onPress={() => save.mutate(item)} style={styles.knowledgeAction}><Bookmark color={theme.textMuted} size={18} /></Pressable><Pressable accessibilityLabel="Archive knowledge card" onPress={() => archiveItem.mutate(item.id)} style={styles.knowledgeAction}><Archive color={theme.textMuted} size={18} /></Pressable></> : null}{mode === 'saved' ? <><Pressable accessibilityLabel="Mark bookmark reviewed" onPress={() => review.mutate(item.id)} style={styles.knowledgeAction}><CheckCircle2 color={theme.success} size={18} /></Pressable><Pressable accessibilityLabel="Delete bookmark" onPress={() => remove.mutate(item.id)} style={styles.knowledgeAction}><Trash2 color={theme.danger} size={17} /></Pressable></> : null}</View> : null}</View><Text style={[styles.rowTitle, { color: theme.text }]}>{String(item.title || payload?.title || 'Knowledge card')}</Text><Text numberOfLines={5} style={[styles.knowledgeBody, { color: theme.textMuted }]}>{String(item.summary || item.body || payload?.summary || '')}</Text></View>; }} /> : null}
  </Screen>;
}

function PdfLibraryScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const docs = useQuery({ queryKey: ['pdf-documents'], queryFn: endpoints.pdfDocuments });
  const upload = useMutation({ mutationFn: (file: DocumentPicker.DocumentPickerAsset) => endpoints.uploadPdf(file), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pdf-documents'] }), onError: (error) => Alert.alert('Upload failed', apiErrorMessage(error)) });
  const pick = async () => { const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true }); if (!result.canceled) upload.mutate(result.assets[0]); };
  return <Screen header={<BackHeader title="PDF Master" subtitle="Secure document workspace" action={!user?.demo_account ? <Pressable accessibilityLabel="Upload PDF" onPress={pick} style={[styles.action, { backgroundColor: theme.primary }]}><FilePlus2 color="#ffffff" size={20} /></Pressable> : undefined} />}>
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
  const [passwordForm, setPasswordForm] = useState({ current_password: '', password: '', password_confirmation: '' });
  const preferences = user?.preferences || {};
  const prefs = preferences.notification_preferences || {};
  const selectedColor = preferences.color_theme || user?.color_theme || 'blue';
  const selectedLandingPage = preferences.landing_page || 'posts';
  const darkMode = Boolean(preferences.dark_mode ?? user?.dark_mode);
  const readOnly = Boolean(user?.demo_account);

  const preferenceMutation = useMutation({
    mutationFn: (input: Record<string, unknown>) => endpoints.updateMe(input),
    onSuccess: async () => {
      await refreshUser();
      await queryClient.invalidateQueries();
    },
    onError: (error) => Alert.alert('Unable to save setting', apiErrorMessage(error)),
  });

  const passwordMutation = useMutation({
    mutationFn: endpoints.changePassword,
    onSuccess: () => {
      setPasswordForm({ current_password: '', password: '', password_confirmation: '' });
      Alert.alert('Password updated', 'Your password was changed and other mobile sessions were revoked.');
    },
    onError: (error) => Alert.alert('Unable to change password', apiErrorMessage(error)),
  });

  const updatePreference = (input: Record<string, unknown>) => preferenceMutation.mutate(input);
  const updateNotification = (key: string, value: boolean) => updatePreference({ notification_preferences: { ...prefs, [key]: value } });
  const submitPassword = () => {
    if (passwordForm.password.length < 8) {
      Alert.alert('Password too short', 'Use at least 8 characters.');
      return;
    }
    if (passwordForm.password !== passwordForm.password_confirmation) {
      Alert.alert('Passwords do not match', 'Confirm the same new password.');
      return;
    }
    passwordMutation.mutate(passwordForm);
  };

  return <Screen header={<BackHeader title="Settings" subtitle="Appearance, alerts, and account behavior" />}>
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <Text style={[styles.sectionTitle, { color: theme.text }]}>Appearance</Text>
      <View style={[styles.settingsPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.settingRow}>
          <View style={styles.flex}>
            <Text style={[styles.rowTitle, { color: theme.text }]}>Dark mode</Text>
            <Text style={[styles.rowMeta, { color: theme.textMuted }]}>Use the dark mobile theme on this account.</Text>
          </View>
          <Switch accessibilityLabel="Dark mode" disabled={preferenceMutation.isPending || readOnly} onValueChange={(value) => updatePreference({ dark_mode: value })} trackColor={{ false: theme.surfaceMuted, true: theme.primary }} value={darkMode} />
        </View>
        <View style={[styles.preferenceBlock, { borderTopColor: theme.border }]}>
          <Text style={[styles.rowTitle, { color: theme.text }]}>Accent color</Text>
          <View style={styles.colorGrid}>
            {themePresets.map((preset) => {
              const selected = selectedColor === preset.key || selectedColor === preset.value;
              return <Pressable accessibilityLabel={`${preset.name} theme`} accessibilityRole="button" key={preset.key} disabled={preferenceMutation.isPending || readOnly} onPress={() => updatePreference({ color_theme: preset.key })} style={[styles.colorOption, { borderColor: selected ? theme.text : theme.border }]}>
                <View style={[styles.swatch, { backgroundColor: preset.value }]} />
                {selected ? <Text style={[styles.selectedMark, { color: theme.text }]}>Selected</Text> : <Text style={[styles.selectedMark, { color: theme.textMuted }]}>{preset.name}</Text>}
              </Pressable>;
            })}
          </View>
        </View>
        <View style={[styles.preferenceBlock, { borderTopColor: theme.border }]}>
          <Text style={[styles.rowTitle, { color: theme.text }]}>Landing page</Text>
          <View style={styles.chipGrid}>
            {landingPageOptions.map((option) => {
              const selected = selectedLandingPage === option.value;
              return <Pressable accessibilityRole="button" key={option.value} disabled={preferenceMutation.isPending || readOnly} onPress={() => updatePreference({ landing_page: option.value })} style={[styles.chip, { backgroundColor: selected ? theme.primary : theme.surfaceMuted }]}>
                <Text style={{ color: selected ? '#ffffff' : theme.text, fontSize: 12, fontWeight: '800' }}>{option.label}</Text>
              </Pressable>;
            })}
          </View>
        </View>
      </View>

      <Text style={[styles.sectionTitle, { color: theme.text }]}>Notifications</Text>
      <View style={[styles.settingsPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {notificationOptions.map((option, index) => <View key={option.key} style={[styles.settingRow, index > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
          <View style={styles.flex}>
            <Text style={[styles.rowTitle, { color: theme.text }]}>{option.label}</Text>
            <Text style={[styles.rowMeta, { color: theme.textMuted }]}>{option.detail}</Text>
          </View>
          <Switch accessibilityLabel={option.label} disabled={preferenceMutation.isPending || readOnly} onValueChange={(value) => updateNotification(option.key, value)} trackColor={{ false: theme.surfaceMuted, true: theme.primary }} value={prefs[option.key] ?? option.key !== 'digest'} />
        </View>)}
      </View>

      <Text style={[styles.sectionTitle, { color: theme.text }]}>Security</Text>
      <Pressable onPress={() => router.push('/more/profile')} style={[styles.settingsLink, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Settings2 color={theme.primary} size={20} />
        <View style={styles.flex}>
          <Text style={[styles.rowTitle, { color: theme.text }]}>Device sessions</Text>
          <Text style={[styles.rowMeta, { color: theme.textMuted }]}>Review and revoke signed-in devices from Profile.</Text>
        </View>
      </Pressable>
      {!readOnly ? <View style={[styles.passwordPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.rowTitle, { color: theme.text }]}>Change password</Text>
        <Text style={[styles.rowMeta, { color: theme.textMuted }]}>Other mobile sessions are revoked after a successful change.</Text>
        <SettingsField label="Current password" secureTextEntry value={passwordForm.current_password} onChangeText={(value) => setPasswordForm((current) => ({ ...current, current_password: value }))} />
        <SettingsField label="New password" secureTextEntry value={passwordForm.password} onChangeText={(value) => setPasswordForm((current) => ({ ...current, password: value }))} />
        <SettingsField label="Confirm new password" secureTextEntry value={passwordForm.password_confirmation} onChangeText={(value) => setPasswordForm((current) => ({ ...current, password_confirmation: value }))} />
        <PrimaryButton disabled={passwordMutation.isPending || !passwordForm.current_password || !passwordForm.password || !passwordForm.password_confirmation} label={passwordMutation.isPending ? 'Updating...' : 'Update password'} loading={passwordMutation.isPending} onPress={submitPassword} />
      </View> : null}
    </ScrollView>
  </Screen>;
}

function SettingsField({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  const theme = useAppTheme();
  return <View>
    <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
    <TextInput accessibilityLabel={label} autoCapitalize="none" placeholderTextColor={theme.textMuted} {...props} style={[styles.field, { backgroundColor: theme.surfaceMuted, borderColor: theme.border, color: theme.text }, props.multiline && styles.multiline]} />
  </View>;
}

function KekaScreen() {
  const theme = useAppTheme();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const profile = useQuery({ queryKey: ['keka-profile'], queryFn: () => endpoints.rawResource<Record<string, unknown>>('/keka/profile') });
  const refresh = useMutation({
    mutationFn: endpoints.kekaRefresh,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['keka-profile'] }),
    onError: (error) => Alert.alert('Unable to refresh Keka', apiErrorMessage(error)),
  });
  const payload = profile.data?.keka as Record<string, unknown> | undefined;
  const data = payload?.data as Record<string, unknown> | undefined;
  const rows = data ? Object.entries(data).filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value)).slice(0, 24) : [];
  return <Screen header={<BackHeader title="Keka profile" subtitle="Employee information synced to Nexus Hub" action={!user?.demo_account ? <Pressable accessibilityLabel="Refresh Keka profile" disabled={refresh.isPending} onPress={() => refresh.mutate()} style={[styles.action, { backgroundColor: theme.primary }]}><RefreshCw color="#ffffff" size={20} /></Pressable> : undefined} />}>
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
  const links = [{ label: 'Portfolio', path: '/' }, { label: 'Contact', path: '/contact' }, { label: 'Legal and privacy', path: '/legal' }, { label: 'Metaverse', path: '/metaverse-landing' }];
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
  knowledgeCard: { borderRadius: 8, borderWidth: 1, marginBottom: 10, padding: 15 }, knowledgeHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }, knowledgeType: { fontSize: 10, fontWeight: '800' }, knowledgeBody: { fontSize: 13, lineHeight: 20, marginTop: 8 }, knowledgeActions: { flexDirection: 'row', gap: 2 }, knowledgeAction: { alignItems: 'center', height: 36, justifyContent: 'center', width: 36 },
  uploading: { alignItems: 'center', flexDirection: 'row', gap: 9, minHeight: 44, paddingHorizontal: 20 }, pdfRow: { alignItems: 'center', borderRadius: 8, borderWidth: 1, flexDirection: 'row', marginBottom: 9, minHeight: 70, padding: 11 }, fileIcon: { alignItems: 'center', borderRadius: 7, height: 42, justifyContent: 'center', marginRight: 12, width: 42 },
  settingsPanel: { borderRadius: 8, borderWidth: 1, marginBottom: 22, overflow: 'hidden' }, settingRow: { alignItems: 'center', flexDirection: 'row', minHeight: 70, paddingHorizontal: 14 }, settingsLink: { alignItems: 'center', borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 12, marginBottom: 9, minHeight: 66, padding: 13 }, preferenceBlock: { borderTopWidth: StyleSheet.hairlineWidth, gap: 12, padding: 14 }, colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 10 }, colorOption: { alignItems: 'center', borderRadius: 8, borderWidth: 1, minHeight: 62, minWidth: 76, padding: 8 }, swatch: { borderRadius: 13, height: 26, width: 26 }, selectedMark: { fontSize: 9, fontWeight: '900', marginTop: 5 }, chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }, chip: { borderRadius: 8, justifyContent: 'center', minHeight: 38, paddingHorizontal: 12 }, passwordPanel: { borderRadius: 8, borderWidth: 1, gap: 12, marginTop: 9, padding: 14 }, label: { fontSize: 13, fontWeight: '800', marginBottom: 7 }, field: { borderRadius: 8, borderWidth: 1, fontSize: 15, minHeight: 46, paddingHorizontal: 12, paddingVertical: 10 }, multiline: { minHeight: 96, textAlignVertical: 'top' }, adminRow: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 66 },
});
