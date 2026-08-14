import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { BookOpen, BriefcaseBusiness, Building2, CalendarDays, ChevronRight, ExternalLink, FileText, FolderLock, GraduationCap, Images, PlayCircle, ScanEye, Search, Settings, Shield, Sparkles, Users, UserRound } from 'lucide-react-native';
import { ComponentType, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { absoluteAssetUrl } from '@/src/api/client';
import { useAuth } from '@/src/auth/AuthProvider';
import { Avatar } from '@/src/components/Avatar';
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
  const [search, setSearch] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const menuGroups: typeof groups = user?.demo_account ? [{ title: 'Guided experience', items: [{ slug: 'demo', label: 'Demo tour', detail: 'Explore six product areas with synthetic data', icon: PlayCircle }] }, ...groups] : groups;
  const allowed = useMemo(() => menuGroups.flatMap((group) => group.items).filter((item) => (!item.feature || user?.features?.[item.feature]) && (!item.permission || user?.permissions?.includes(item.permission))), [menuGroups, user?.features, user?.permissions]);
  const recentItems = recent.map((slug) => allowed.find((item) => item.slug === slug)).filter(Boolean) as MenuItem[];

  useEffect(() => {
    void AsyncStorage.getItem('nexushub.recent-tools').then((value) => {
      const parsed = value ? JSON.parse(value) : [];
      if (Array.isArray(parsed)) setRecent(parsed.filter((item): item is string => typeof item === 'string').slice(0, 4));
    }).catch(() => undefined);
  }, []);
  const openTool = (item: MenuItem) => {
    const next = [item.slug, ...recent.filter((slug) => slug !== item.slug)].slice(0, 4);
    setRecent(next);
    void AsyncStorage.setItem('nexushub.recent-tools', JSON.stringify(next));
    router.push(item.slug === 'profile' ? '/more/profile' : `/more/${item.slug}` as never);
  };

  return <Screen header={<PageHeader title="More" subtitle={user?.workspace.name || 'Workspace tools'} />}><ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled"><View style={[styles.identity, { backgroundColor: theme.surface, borderColor: theme.border }]}><Avatar color={user?.avatar_color} name={user?.full_name || 'NexusHub user'} size={48} uri={absoluteAssetUrl(user?.profile_picture)} /><View style={styles.identityCopy}><Text numberOfLines={1} style={[styles.identityName, { color: theme.text }]}>{user?.full_name}</Text><Text numberOfLines={1} style={[styles.identityMeta, { color: theme.textMuted }]}>{user?.job_title || user?.email}</Text></View></View><View style={[styles.search, { backgroundColor: theme.surface, borderColor: theme.border }]}><Search color={theme.textMuted} size={18} /><TextInput accessibilityLabel="Search tools" onChangeText={setSearch} placeholder="Search tools and settings" placeholderTextColor={theme.textMuted} style={[styles.searchInput, { color: theme.text }]} value={search} /></View>{!search && recentItems.length ? <ToolGroup items={recentItems} onOpen={openTool} title="Recent tools" /> : null}{menuGroups.map((group) => {
    const query = search.trim().toLowerCase();
    const visible = group.items.filter((item) => (!item.feature || user?.features?.[item.feature]) && (!item.permission || user?.permissions?.includes(item.permission)) && (!query || item.label.toLowerCase().includes(query) || item.detail.toLowerCase().includes(query)));
    if (!visible.length) return null;
    return <ToolGroup items={visible} key={group.title} onOpen={openTool} title={group.title} />})}</ScrollView></Screen>;
}

function ToolGroup({ items, onOpen, title }: { items: MenuItem[]; onOpen: (item: MenuItem) => void; title: string }) {
  const theme = useAppTheme();
  return <View style={styles.group}><Text style={[styles.groupTitle, { color: theme.textMuted }]}>{title.toUpperCase()}</Text><View style={[styles.panel, { backgroundColor: theme.surfaceRaised, borderColor: theme.border }]}>{items.map((item, index) => { const Icon = item.icon; return <TouchableScale accessibilityRole="button" key={item.slug} onPress={() => onOpen(item)} scaleTo={0.985} style={[styles.row, index > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}><View style={[styles.icon, { backgroundColor: theme.primarySoft }]}><Icon color={theme.primary} size={20} /></View><View style={styles.copy}><Text style={[styles.label, { color: theme.text }]}>{item.label}</Text><Text numberOfLines={1} style={[styles.detail, { color: theme.textMuted }]}>{item.detail}</Text></View><ChevronRight color={theme.textMuted} size={19} /></TouchableScale>; })}</View></View>;
}

const styles = StyleSheet.create({ scroll: { padding: 16, paddingBottom: 38 }, identity: { alignItems: 'center', borderRadius: 10, borderWidth: 1, flexDirection: 'row', marginBottom: 12, padding: 12 }, identityCopy: { flex: 1, marginLeft: 12 }, identityName: { fontSize: 16, fontWeight: '900' }, identityMeta: { fontSize: 12, marginTop: 3 }, search: { alignItems: 'center', borderRadius: 9, borderWidth: 1, flexDirection: 'row', marginBottom: 20, minHeight: 44, paddingHorizontal: 12 }, searchInput: { flex: 1, fontSize: 14, minHeight: 42, paddingHorizontal: 9, paddingVertical: 8 }, group: { marginBottom: 22 }, groupTitle: { fontSize: 11, fontWeight: '900', letterSpacing: 0, marginBottom: 8 }, panel: { borderRadius: 8, borderWidth: 1, overflow: 'hidden' }, row: { alignItems: 'center', flexDirection: 'row', minHeight: 66, paddingHorizontal: 12 }, icon: { alignItems: 'center', borderRadius: 7, height: 38, justifyContent: 'center', marginRight: 12, width: 38 }, copy: { flex: 1 }, label: { fontSize: 14, fontWeight: '800' }, detail: { fontSize: 12, lineHeight: 17, marginTop: 2 } });
