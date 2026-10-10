import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Bell, ChevronRight, Home, Moon, Palette, Settings2, Shield, Smartphone } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, AppState, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { apiErrorMessage } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { PushNotificationSettings } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { PageHeader } from '../components/PageHeader';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { registerCurrentPushDevice } from '../notifications/PushRegistrar';
import { themePresets, useAppTheme } from '../theme';

const settingsSections = [
  { key: 'appearance', group: 'Personalize', title: 'Appearance', detail: 'Theme and accent color', icon: Palette },
  { key: 'start', group: 'Personalize', title: 'Start page', detail: 'Choose where your workspace opens', icon: Home },
  { key: 'alerts', group: 'Notifications', title: 'Activity alerts', detail: 'Comments, assignments, and mentions', icon: Bell },
  { key: 'push', group: 'Notifications', title: 'Push notifications', detail: 'Phone alerts, previews, and categories', icon: Smartphone },
  { key: 'quiet', group: 'Notifications', title: 'Quiet hours', detail: 'Schedule breaks from notifications', icon: Moon },
  { key: 'security', group: 'Account', title: 'Security', detail: 'Password and signed-in devices', icon: Shield },
];

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

const pushCategoryOptions: Array<{ key: keyof PushNotificationSettings['categories']; label: string; detail: string }> = [
  { key: 'chat', label: 'Chat', detail: 'Messages, mentions, and reactions' },
  { key: 'audio_calls', label: 'Audio calls', detail: 'Incoming, missed, and ended calls' },
  { key: 'video_calls', label: 'Video calls', detail: 'Incoming, missed, and ended video calls' },
  { key: 'work', label: 'Work', detail: 'Projects, tasks, issues, and team changes' },
  { key: 'social', label: 'Social activity', detail: 'Post likes, comments, and endorsements' },
  { key: 'knowledge', label: 'Daily tech knowledge', detail: 'One daily technical post and learning tips' },
  { key: 'reminders', label: 'Reminders', detail: 'Calendar and event reminders' },
];

const defaultPushSettings: PushNotificationSettings = {
  enabled: true,
  previews: true,
  categories: { chat: true, audio_calls: true, video_calls: true, work: true, social: true, reminders: true, knowledge: true },
  quiet_hours: { enabled: false, start: '22:00', end: '07:00', timezone: 'UTC', allow_calls: true },
};

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

export function SettingsScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const { section: sectionParam } = useLocalSearchParams<{ section?: string }>();
  const activeSection = settingsSections.find((section) => section.key === sectionParam);
  const section = activeSection?.key;
  const back = () => section ? router.replace('/more/settings' as never) : router.back();
  const { user, refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const [passwordForm, setPasswordForm] = useState({ current_password: '', password: '', password_confirmation: '' });
  useEffect(() => { setPasswordForm({ current_password: '', password: '', password_confirmation: '' }); }, [section]);
  const preferences = user?.preferences || {};
  const prefs = preferences.notification_preferences || {};
  const pushSettings = user?.push_notification_settings || defaultPushSettings;
  const [permissionStatus, setPermissionStatus] = useState<string>('checking');
  const [quietStart, setQuietStart] = useState(pushSettings.quiet_hours.start);
  const [quietEnd, setQuietEnd] = useState(pushSettings.quiet_hours.end);
  const selectedColor = preferences.color_theme || user?.color_theme || 'blue';
  const selectedLandingPage = preferences.landing_page || 'posts';
  const darkMode = Boolean(preferences.dark_mode ?? user?.dark_mode);
  const readOnly = Boolean(user?.demo_account);

  useEffect(() => {
    const refreshPermission = () => void Notifications.getPermissionsAsync().then((permission) => setPermissionStatus(permission.status)).catch(() => setPermissionStatus('unavailable'));
    refreshPermission();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') refreshPermission(); });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    setQuietStart(pushSettings.quiet_hours.start);
    setQuietEnd(pushSettings.quiet_hours.end);
  }, [pushSettings.quiet_hours.end, pushSettings.quiet_hours.start]);

  const preferenceMutation = useMutation({
    mutationFn: (input: Record<string, unknown>) => endpoints.updateMe(input),
    onSuccess: async () => {
      await refreshUser();
      await queryClient.invalidateQueries();
    },
    onError: (error) => Alert.alert('Unable to save setting', apiErrorMessage(error)),
  });

  const passwordMutation = useMutation({
    mutationFn: (input: Parameters<typeof endpoints.changePassword>[0]) => endpoints.changePassword(input),
    onSuccess: () => {
      setPasswordForm({ current_password: '', password: '', password_confirmation: '' });
      Alert.alert('Password updated', 'Your password was changed and other mobile sessions were revoked.');
    },
    onError: (error) => Alert.alert('Unable to change password', apiErrorMessage(error)),
  });

  const updatePreference = (input: Record<string, unknown>) => preferenceMutation.mutate(input);
  const updateNotification = (key: string, value: boolean) => updatePreference({ notification_preferences: { ...prefs, [key]: value } });
  const updatePush = (next: PushNotificationSettings) => updatePreference({ push_notification_settings: next });
  const updatePushCategory = (key: keyof PushNotificationSettings['categories'], value: boolean) => updatePush({ ...pushSettings, categories: { ...pushSettings.categories, [key]: value } });
  const requestPushPermission = async () => {
    try {
      const permission = await Notifications.requestPermissionsAsync({ android: {}, ios: { allowAlert: true, allowBadge: true, allowSound: true } });
      setPermissionStatus(permission.status);
      if (permission.status === 'granted' && user) await registerCurrentPushDevice(user);
      else if (!permission.canAskAgain) await Linking.openSettings();
    } catch (error) {
      Alert.alert('Notifications unavailable', apiErrorMessage(error));
    }
  };
  const saveQuietTime = (key: 'start' | 'end', value: string) => {
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
      Alert.alert('Use a valid time', 'Enter quiet hours in 24-hour HH:MM format, for example 22:00.');
      key === 'start' ? setQuietStart(pushSettings.quiet_hours.start) : setQuietEnd(pushSettings.quiet_hours.end);
      return;
    }
    updatePush({ ...pushSettings, quiet_hours: { ...pushSettings.quiet_hours, [key]: value } });
  };
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

  return <Screen header={<PageHeader title={activeSection?.title || "Settings"} subtitle={activeSection?.detail || "Make the workspace yours"} leading={<Pressable accessibilityRole="button" accessibilityLabel={section ? "Back to settings" : "Back"} onPress={back} style={styles.iconButton}><ArrowLeft color={theme.text} size={22} /></Pressable>} />}>
    <ScrollView key={section || 'overview'} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      {readOnly ? <View style={[styles.overviewNote, { backgroundColor: theme.surfaceMuted }]}><Text style={[styles.rowMeta, { color: theme.textMuted }]}>You can explore settings in this demo. Changes are disabled.</Text></View> : null}
      {!section ? <>
        {['Personalize', 'Notifications', 'Account'].map((group) => <View key={group} style={styles.overviewGroup}>
          <Text style={[styles.groupLabel, { color: theme.textMuted }]}>{group}</Text>
          <View style={[styles.settingsPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {settingsSections.filter((item) => item.group === group).map((item, index) => {
              const Icon = item.icon;
              const summary = item.key === 'appearance' ? `${darkMode ? 'Dark' : 'Light'} mode` : item.key === 'start' ? landingPageOptions.find((option) => option.value === selectedLandingPage)?.label || 'Updates' : item.key === 'push' ? pushSettings.enabled ? 'On' : 'Off' : item.key === 'quiet' ? pushSettings.quiet_hours.enabled ? `${pushSettings.quiet_hours.start}–${pushSettings.quiet_hours.end}` : 'Off' : undefined;
              return <Pressable key={item.key} accessibilityRole="button" accessibilityLabel={`Open ${item.title}`} onPress={() => router.push({ pathname: '/more/settings', params: { section: item.key } } as never)} style={[styles.overviewRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
                <View style={[styles.overviewIcon, { backgroundColor: theme.primarySoft }]}><Icon color={theme.primary} size={21} /></View>
                <View style={styles.flex}><Text style={[styles.rowTitle, { color: theme.text }]}>{item.title}</Text><Text style={[styles.rowMeta, { color: theme.textMuted }]}>{item.detail}</Text>{summary ? <Text style={[styles.summary, { color: theme.primary }]}>{summary}</Text> : null}</View>
                <ChevronRight color={theme.textMuted} size={19} />
              </Pressable>;
            })}
          </View>
        </View>)}
      </> : null}
      {section === 'appearance' || section === 'start' ? <>

      <View style={[styles.settingsPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {section === 'appearance' ? <>
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
              const accentColor = preset.value;
              const selected = selectedColor === preset.key || selectedColor === accentColor;
              return <Pressable accessibilityLabel={`${preset.name} theme`} accessibilityRole="button" accessibilityState={{ selected, disabled: preferenceMutation.isPending || readOnly }} key={preset.key} disabled={preferenceMutation.isPending || readOnly} onPress={() => updatePreference({ color_theme: preset.key })} style={[styles.colorOption, { borderColor: selected ? theme.text : theme.border }]}>
                <View style={[styles.swatch, { backgroundColor: accentColor }]} />
                {selected ? <Text style={[styles.selectedMark, { color: theme.text }]}>Selected</Text> : <Text style={[styles.selectedMark, { color: theme.textMuted }]}>{preset.name}</Text>}
              </Pressable>;
            })}
          </View>
        </View>
        </> : null}
        {section === 'start' ? <View style={[styles.preferenceBlock, { borderTopWidth: 0 }]}>
          <Text style={[styles.rowTitle, { color: theme.text }]}>Open this page after signing in</Text>
          <View style={styles.chipGrid}>
            {landingPageOptions.map((option) => {
              const selected = selectedLandingPage === option.value;
              return <Pressable accessibilityRole="button" accessibilityState={{ selected, disabled: preferenceMutation.isPending || readOnly }} key={option.value} disabled={preferenceMutation.isPending || readOnly} onPress={() => updatePreference({ landing_page: option.value })} style={[styles.chip, { backgroundColor: selected ? theme.primary : theme.surfaceMuted }]}>
                <Text style={{ color: selected ? '#ffffff' : theme.text, fontSize: 12, fontWeight: '800' }}>{option.label}</Text>
              </Pressable>;
            })}
          </View>
        </View> : null}
      </View>
      </> : null}

      {section === 'alerts' ? <>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>Activity alerts</Text>
      <View style={[styles.settingsPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {notificationOptions.map((option, index) => <View key={option.key} style={[styles.settingRow, index > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
          <View style={styles.flex}>
            <Text style={[styles.rowTitle, { color: theme.text }]}>{option.label}</Text>
            <Text style={[styles.rowMeta, { color: theme.textMuted }]}>{option.detail}</Text>
          </View>
          <Switch accessibilityLabel={option.label} disabled={preferenceMutation.isPending || readOnly} onValueChange={(value) => updateNotification(option.key, value)} trackColor={{ false: theme.surfaceMuted, true: theme.primary }} value={prefs[option.key] ?? option.key !== 'digest'} />
        </View>)}
      </View>

      </> : null}
      {section === 'push' || section === 'quiet' ? <>
      <View style={[styles.settingsPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {section === 'push' ? <>
        <View style={styles.settingRow}>
          <View style={styles.flex}>
            <Text style={[styles.rowTitle, { color: theme.text }]}>Phone permission</Text>
            <Text style={[styles.rowMeta, { color: theme.textMuted }]}>{humanize(permissionStatus)} · controls whether this phone can show alerts</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => ['denied', 'granted'].includes(permissionStatus) ? void Linking.openSettings() : void requestPushPermission()} style={[styles.smallButton, { borderColor: theme.border }]}><Text style={[styles.smallButtonText, { color: theme.primary }]}>{permissionStatus === 'granted' ? 'Settings' : 'Enable'}</Text></Pressable>
        </View>
        <View style={[styles.settingRow, { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
          <View style={styles.flex}><Text style={[styles.rowTitle, { color: theme.text }]}>Push notifications</Text><Text style={[styles.rowMeta, { color: theme.textMuted }]}>Master switch for alerts sent to your devices</Text></View>
          <Switch accessibilityLabel="Push notifications" disabled={preferenceMutation.isPending || readOnly} onValueChange={(enabled) => updatePush({ ...pushSettings, enabled })} trackColor={{ false: theme.surfaceMuted, true: theme.primary }} value={pushSettings.enabled} />
        </View>
        <View style={[styles.settingRow, { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
          <View style={styles.flex}><Text style={[styles.rowTitle, { color: theme.text }]}>Message previews</Text><Text style={[styles.rowMeta, { color: theme.textMuted }]}>Show a short, sanitized preview on the lock screen</Text></View>
          <Switch accessibilityLabel="Message previews" disabled={preferenceMutation.isPending || readOnly || !pushSettings.enabled} onValueChange={(previews) => updatePush({ ...pushSettings, previews })} trackColor={{ false: theme.surfaceMuted, true: theme.primary }} value={pushSettings.previews} />
        </View>
        {pushCategoryOptions.map((option) => <View key={option.key} style={[styles.settingRow, { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}><View style={styles.flex}><Text style={[styles.rowTitle, { color: theme.text }]}>{option.label}</Text><Text style={[styles.rowMeta, { color: theme.textMuted }]}>{option.detail}</Text></View><Switch accessibilityLabel={`${option.label} push notifications`} disabled={preferenceMutation.isPending || readOnly || !pushSettings.enabled} onValueChange={(value) => updatePushCategory(option.key, value)} trackColor={{ false: theme.surfaceMuted, true: theme.primary }} value={pushSettings.categories[option.key] !== false} /></View>)}
        </> : null}
        {section === 'quiet' ? <>
        {!pushSettings.enabled ? <Text style={[styles.rowMeta, { color: theme.textMuted, padding: 16 }]}>Turn on push notifications to manage quiet hours.</Text> : null}
        <View style={styles.settingRow}>
          <View style={styles.flex}><Text style={[styles.rowTitle, { color: theme.text }]}>Quiet hours</Text><Text style={[styles.rowMeta, { color: theme.textMuted }]}>Hold routine alerts and send a summary later</Text></View>
          <Switch accessibilityLabel="Quiet hours" disabled={preferenceMutation.isPending || readOnly || !pushSettings.enabled} onValueChange={(enabled) => updatePush({ ...pushSettings, quiet_hours: { ...pushSettings.quiet_hours, enabled } })} trackColor={{ false: theme.surfaceMuted, true: theme.primary }} value={pushSettings.quiet_hours.enabled} />
        </View>
        {pushSettings.quiet_hours.enabled ? <View style={[styles.preferenceBlock, { borderTopColor: theme.border }]}>
          <View style={styles.timeFields}><View style={styles.timeField}><SettingsField label="Starts" placeholder="22:00" value={quietStart} onChangeText={setQuietStart} onEndEditing={() => saveQuietTime('start', quietStart)} /></View><View style={styles.timeField}><SettingsField label="Ends" placeholder="07:00" value={quietEnd} onChangeText={setQuietEnd} onEndEditing={() => saveQuietTime('end', quietEnd)} /></View></View>
          <Text style={[styles.rowMeta, { color: theme.textMuted }]}>Timezone: {pushSettings.quiet_hours.timezone}</Text>
          <View style={styles.settingRowCompact}><View style={styles.flex}><Text style={[styles.rowTitle, { color: theme.text }]}>Allow calls</Text><Text style={[styles.rowMeta, { color: theme.textMuted }]}>Incoming calls can interrupt quiet hours</Text></View><Switch accessibilityLabel="Allow calls during quiet hours" disabled={preferenceMutation.isPending || readOnly} onValueChange={(allow_calls) => updatePush({ ...pushSettings, quiet_hours: { ...pushSettings.quiet_hours, allow_calls } })} trackColor={{ false: theme.surfaceMuted, true: theme.primary }} value={pushSettings.quiet_hours.allow_calls} /></View>
        </View> : null}
        </> : null}
      </View>
      </> : null}

      {section === 'security' ? <>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>Account security</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Device sessions" onPress={() => router.push('/more/profile')} style={[styles.settingsLink, { backgroundColor: theme.surface, borderColor: theme.border }]}>
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
      </> : null}
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


function humanize(value: string) { return value.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase()); }

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 36 }, flex: { flex: 1, minWidth: 0 }, iconButton: { alignItems: 'center', justifyContent: 'center', width: 44, height: 44 },
  overviewGroup: { marginBottom: 8 }, groupLabel: { fontSize: 12, fontWeight: '700', marginBottom: 10, marginLeft: 4 },
  overviewRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, minHeight: 82 }, overviewIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  overviewNote: { padding: 14, borderRadius: 12, marginBottom: 20 }, summary: { fontSize: 12, fontWeight: '600', marginTop: 5 },
  sectionTitle: { fontSize: 17, fontWeight: '800', marginBottom: 12 }, rowTitle: { fontSize: 15, fontWeight: '700' }, rowMeta: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  settingsPanel: { borderRadius: 14, borderWidth: 1, marginBottom: 22, overflow: 'hidden' }, settingRow: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 76, padding: 16 },
  preferenceBlock: { borderTopWidth: StyleSheet.hairlineWidth, gap: 12, padding: 16 }, colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 10 }, colorOption: { alignItems: 'center', borderRadius: 10, borderWidth: 1, minHeight: 70, minWidth: 76, padding: 10 }, swatch: { borderRadius: 14, height: 28, width: 28 }, selectedMark: { fontSize: 11, fontWeight: '700', marginTop: 6 },
  chipGrid: { gap: 8 }, chip: { borderRadius: 10, justifyContent: 'center', minHeight: 48, paddingHorizontal: 14 },
  settingsLink: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 12, marginBottom: 16, minHeight: 76, padding: 16 },
  passwordPanel: { borderRadius: 14, borderWidth: 1, gap: 14, padding: 16 }, label: { fontSize: 13, fontWeight: '700', marginBottom: 7 }, field: { borderRadius: 10, borderWidth: 1, fontSize: 15, minHeight: 48, padding: 12 }, multiline: { minHeight: 96, textAlignVertical: 'top' },
  smallButton: { alignItems: 'center', borderRadius: 10, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 12 }, smallButtonText: { fontSize: 12, fontWeight: '700' }, timeFields: { flexDirection: 'row', gap: 12 }, timeField: { flex: 1 }, settingRowCompact: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 64 },
});
