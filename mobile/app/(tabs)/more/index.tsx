import { useRouter } from 'expo-router';
import { BookOpen, BriefcaseBusiness, Building2, CalendarDays, ChevronRight, ExternalLink, FileText, FolderLock, GraduationCap, Images, PlayCircle, ScanEye, Settings, Shield, Sparkles, Users, UserRound } from 'lucide-react-native';
import { ComponentType } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/src/auth/AuthProvider';
import { PageHeader } from '@/src/components/PageHeader';
import { Screen } from '@/src/components/Screen';
import { TouchableScale } from '@/src/components/TouchableScale';
import { useAppTheme } from '@/src/theme';

type MenuItem = { slug: string; label: string; detail: string; icon: ComponentType<{ color: string; size: number }>; feature?: string; permission?: string };
const groups: Array<{ title: string; items: MenuItem[] }> = [
  { title: 'Plan and learn', items: [
    { slug: 'calendar', label: 'Calendar', detail: 'Events, reminders, and schedules', icon: CalendarDays },
    { slug: 'momentum', label: 'Momentum Hub', detail: 'Daily focus and reflection', icon: Sparkles },
    { slug: 'knowledge', label: 'Knowledge', detail: 'Briefings, bookmarks, and prompts', icon: BookOpen },
  ] },
  { title: 'People and assets', items: [
    { slug: 'teams', label: 'Teams', detail: 'Members, skills, and learning goals', icon: Users },
    { slug: 'skills', label: 'Skills', detail: 'Capabilities and endorsements', icon: Sparkles },
    { slug: 'goals', label: 'Learning goals', detail: 'Progress and checkpoints', icon: GraduationCap },
    { slug: 'people', label: 'People', detail: 'Workspace directory and presence', icon: UserRound },
    { slug: 'departments', label: 'Departments', detail: 'Structure and membership', icon: Building2 },
    { slug: 'vault', label: 'Vault', detail: 'Personal references and notes', icon: FolderLock },
    { slug: 'pdf', label: 'PDF Master', detail: 'Documents, editing, and exports', icon: FileText },
    { slug: 'keka', label: 'Keka profile', detail: 'Synced employee information', icon: UserRound },
    { slug: 'portfolio', label: 'Portfolio', detail: 'Published profile and case studies', icon: BriefcaseBusiness },
  ] },
  { title: 'Account and control', items: [
    { slug: 'profile', label: 'Profile', detail: 'Identity, sessions, and workspace', icon: UserRound },
    { slug: 'settings', label: 'Settings', detail: 'Appearance and notifications', icon: Settings },
    { slug: 'admin', label: 'Administration', detail: 'Users, records, and portfolio', icon: Shield, feature: 'admin' },
    { slug: 'portfolio-admin', label: 'Portfolio admin', detail: 'Profile, projects, media, and tour steps', icon: Images, feature: 'portfolio_admin' },
    { slug: 'impersonation', label: 'View as user', detail: 'Audited owner support access', icon: ScanEye, permission: 'impersonation.manage' },
    { slug: 'website', label: 'Nexus Hub web', detail: 'Portfolio, legal, demo, and metaverse', icon: ExternalLink },
  ] },
];

export default function MoreScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const { user } = useAuth();
  const menuGroups: typeof groups = user?.demo_account ? [{ title: 'Guided experience', items: [{ slug: 'demo', label: 'Demo tour', detail: 'Explore six product areas with synthetic data', icon: PlayCircle }] }, ...groups] : groups;
  return <Screen header={<PageHeader title="More" subtitle={user?.workspace.name || 'Workspace tools'} />}><ScrollView contentContainerStyle={styles.scroll}>{menuGroups.map((group) => {
    const visible = group.items.filter((item) => (!item.feature || user?.features?.[item.feature]) && (!item.permission || user?.permissions?.includes(item.permission)));
    if (!visible.length) return null;
    return <View key={group.title} style={styles.group}><Text style={[styles.groupTitle, { color: theme.textMuted }]}>{group.title.toUpperCase()}</Text><View style={[styles.panel, { backgroundColor: theme.surfaceRaised, borderColor: theme.border, shadowColor: theme.shadow }]}>{visible.map((item, index) => { const Icon = item.icon; return <TouchableScale accessibilityRole="button" key={item.slug} onPress={() => router.push(item.slug === 'profile' ? '/more/profile' : `/more/${item.slug}` as never)} scaleTo={0.985} style={[styles.row, index > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}><View style={[styles.icon, { backgroundColor: theme.primarySoft }]}><Icon color={theme.primary} size={20} /></View><View style={styles.copy}><Text style={[styles.label, { color: theme.text }]}>{item.label}</Text><Text numberOfLines={1} style={[styles.detail, { color: theme.textMuted }]}>{item.detail}</Text></View><ChevronRight color={theme.textMuted} size={19} /></TouchableScale>; })}</View></View>})}</ScrollView></Screen>;
}

const styles = StyleSheet.create({ scroll: { padding: 20, paddingBottom: 44 }, group: { marginBottom: 25 }, groupTitle: { fontSize: 11, fontWeight: '900', letterSpacing: 0, marginBottom: 9 }, panel: { borderRadius: 8, borderWidth: 1, elevation: 1, overflow: 'hidden', shadowOffset: { height: 4, width: 0 }, shadowOpacity: 0.07, shadowRadius: 9 }, row: { alignItems: 'center', flexDirection: 'row', minHeight: 70, paddingHorizontal: 13 }, icon: { alignItems: 'center', borderRadius: 7, height: 40, justifyContent: 'center', marginRight: 12, width: 40 }, copy: { flex: 1 }, label: { fontSize: 15, fontWeight: '800' }, detail: { fontSize: 12, lineHeight: 17, marginTop: 3 } });
