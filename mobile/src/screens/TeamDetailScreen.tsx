import { Picker } from '@react-native-picker/picker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Award, BriefcaseBusiness, Pencil, Plus, Sparkles, Trash2, UserRoundPlus, Users, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { absoluteAssetUrl, apiErrorMessage } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { EntityRecord, TeamMember } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from '../components/Avatar';
import { PageHeader } from '../components/PageHeader';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { SegmentedControl } from '../components/SegmentedControl';
import { EmptyState, ErrorState, LoadingState } from '../components/StateView';
import { useAppTheme } from '../theme';

type Mode = 'overview' | 'members' | 'skills';
type MemberDraft = { userId: number; role: string; status: string };

export function TeamDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const teamId = Number(id);
  const theme = useAppTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const writable = !user?.demo_account && Boolean(user?.roles.some((role) => role === 'admin' || role === 'owner'));
  const [mode, setMode] = useState<Mode>('overview');
  const [editing, setEditing] = useState<TeamMember | null | undefined>(undefined);
  const insights = useQuery({ queryKey: ['team-insights', teamId], queryFn: () => endpoints.teamInsights(teamId), enabled: Number.isFinite(teamId) });
  const users = useQuery({ queryKey: ['users', 'team-picker'], queryFn: () => endpoints.users(), enabled: editing !== undefined && writable });
  const members = insights.data?.members || [];
  const refresh = async () => {
    setEditing(undefined);
    await queryClient.invalidateQueries({ queryKey: ['team-insights', teamId] });
    await queryClient.invalidateQueries({ queryKey: ['teams'] });
  };

  return <Screen header={<PageHeader leading={<Pressable accessibilityLabel="Back" onPress={() => router.back()} style={styles.iconButton}><ArrowLeft color={theme.text} size={22} /></Pressable>} title={insights.data?.team.name || 'Team'} subtitle="People, skills, and development" action={writable ? <Pressable accessibilityLabel="Add team member" onPress={() => setEditing(null)} style={[styles.add, { backgroundColor: theme.primary }]}><UserRoundPlus color="#ffffff" size={20} /></Pressable> : undefined} />}>
    {insights.isLoading ? <LoadingState label="Loading team insights" /> : null}
    {insights.isError ? <ErrorState message={apiErrorMessage(insights.error)} onRetry={() => insights.refetch()} /> : null}
    {insights.data ? <View style={styles.flex}><View style={styles.segment}><SegmentedControl value={mode} onChange={setMode} options={[{ value: 'overview', label: 'Overview' }, { value: 'members', label: 'Members' }, { value: 'skills', label: 'Skills' }]} /></View>{mode === 'overview' ? <Overview data={insights.data} /> : null}{mode === 'members' ? <MemberList members={members} editable={writable} onEdit={setEditing} /> : null}{mode === 'skills' ? <SkillsView members={members} teamId={teamId} writable={!user?.demo_account} /> : null}</View> : null}
    <MemberEditor editing={editing} members={members} onClose={() => setEditing(undefined)} onSaved={refresh} teamId={teamId} users={users.data?.data || []} />
  </Screen>;
}

function Overview({ data }: { data: Awaited<ReturnType<typeof endpoints.teamInsights>> }) {
  const theme = useAppTheme();
  const strengths = data.skill_gap?.strengths || [];
  const opportunities = data.skill_gap?.opportunities || [];
  return <ScrollView contentContainerStyle={styles.scroll}><View style={styles.metrics}><Metric icon={Users} label="Members" value={data.members.length} /><Metric icon={Sparkles} label="Skills" value={data.skills.length} /><Metric icon={BriefcaseBusiness} label="Roles" value={data.roles.length} /></View><InsightSection title="Team strengths" rows={strengths} empty="Skill strengths appear after members add capabilities." /><InsightSection title="Growth opportunities" rows={opportunities} empty="No skill gaps identified yet." />{data.team_experts?.length ? <View style={styles.section}><Text style={[styles.sectionTitle, { color: theme.text }]}>Top experts</Text>{data.team_experts.map((expert, index) => <View key={`${expert.user_id}-${expert.skill_name}-${index}`} style={[styles.expert, { borderBottomColor: theme.border }]}><Award color={theme.warning} size={19} /><View style={styles.flex}><Text style={[styles.itemTitle, { color: theme.text }]}>{String(expert.name)}</Text><Text style={[styles.itemMeta, { color: theme.textMuted }]}>{String(expert.skill_name)} · {String(expert.endorsements_count)} endorsements</Text></View></View>)}</View> : null}</ScrollView>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  const theme = useAppTheme();
  return <View style={[styles.metric, { backgroundColor: theme.surface, borderColor: theme.border }]}><Icon color={theme.primary} size={19} /><Text style={[styles.metricValue, { color: theme.text }]}>{value}</Text><Text style={[styles.metricLabel, { color: theme.textMuted }]}>{label}</Text></View>;
}

function InsightSection({ title, rows, empty }: { title: string; rows: Array<Record<string, string | number>>; empty: string }) {
  const theme = useAppTheme();
  return <View style={styles.section}><Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text><View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>{rows.length ? rows.map((row, index) => <View key={`${row.name}-${index}`} style={[styles.insightRow, index > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}><Text style={[styles.itemTitle, { color: theme.text }]}>{String(row.name)}</Text><Text style={[styles.itemMeta, { color: theme.textMuted }]}>{skillSummary(row)}</Text></View>) : <Text style={[styles.emptyText, { color: theme.textMuted }]}>{empty}</Text>}</View></View>;
}

function MemberList({ members, editable, onEdit }: { members: TeamMember[]; editable: boolean; onEdit: (member: TeamMember) => void }) {
  const theme = useAppTheme();
  return <FlatList contentContainerStyle={styles.list} data={members} keyExtractor={(item) => String(item.id)} ListEmptyComponent={<EmptyState title="No team members" message="Workspace admins can add people to this team." />} renderItem={({ item }) => <Pressable accessibilityRole={editable ? 'button' : undefined} onPress={editable ? () => onEdit(item) : undefined} style={[styles.member, { backgroundColor: theme.surface, borderColor: theme.border }]}><Avatar color={item.avatar_color} name={item.name} size={44} uri={absoluteAssetUrl(item.profile_picture)} /><View style={styles.memberCopy}><View style={styles.titleLine}><Text numberOfLines={1} style={[styles.itemTitle, { color: theme.text }]}>{item.name}</Text><Text style={[styles.role, { color: theme.primary }]}>{item.role}</Text></View><Text numberOfLines={1} style={[styles.itemMeta, { color: theme.textMuted }]}>{item.job_title || item.email}</Text><Text style={[styles.availability, { color: availabilityColor(item.availability_status, theme) }]}>{item.availability_label || item.status}</Text></View>{editable ? <Pencil color={theme.textMuted} size={17} /> : null}</Pressable>} />;
}

function SkillsView({ members, teamId, writable }: { members: TeamMember[]; teamId: number; writable: boolean }) {
  const theme = useAppTheme();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  type SkillPerson = { memberId: number; name: string; skill: NonNullable<TeamMember['skills']>[number] };
  const rows = useMemo(() => {
    const skills = new Map<string, SkillPerson[]>();
    members.forEach((member) => member.skills?.forEach((skill) => {
      const people = skills.get(skill.name) || [];
      people.push({ memberId: member.id, name: member.name, skill });
      skills.set(skill.name, people);
    }));
    return [...skills.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [members]);
  const endorse = useMutation({ mutationFn: async (person: SkillPerson) => { if (person.skill.endorsed_by_current_user && person.skill.current_user_endorsement_id) await endpoints.deleteSkillEndorsement(person.skill.current_user_endorsement_id); else await endpoints.createSkillEndorsement(person.skill.id, teamId); }, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team-insights', teamId] }), onError: (error) => Alert.alert('Unable to update endorsement', apiErrorMessage(error)) });
  return <FlatList contentContainerStyle={styles.list} data={rows} keyExtractor={([name]) => name} ListEmptyComponent={<EmptyState title="No team skills" message="Member capabilities and endorsement levels appear here." />} renderItem={({ item: [name, people] }) => <View style={[styles.skill, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text style={[styles.itemTitle, { color: theme.text }]}>{name}</Text><Text style={[styles.itemMeta, { color: theme.textMuted }]}>{people.length} {people.length === 1 ? 'member' : 'members'}</Text><View style={styles.skillPeople}>{people.map((person) => <View key={`${person.memberId}-${person.skill.id}`} style={[styles.skillPerson, { backgroundColor: theme.surfaceMuted }]}><View style={styles.flex}><Text style={[styles.skillName, { color: theme.text }]}>{person.name}</Text><Text style={[styles.skillLevel, { color: theme.primary }]}>{person.skill.proficiency_label || person.skill.proficiency || 'Listed'} · {person.skill.endorsements_count || 0} endorsements</Text></View>{writable && person.memberId !== user?.id ? <Pressable accessibilityLabel={`${person.skill.endorsed_by_current_user ? 'Remove endorsement for' : 'Endorse'} ${person.name} in ${name}`} disabled={endorse.isPending} onPress={() => endorse.mutate(person)} style={[styles.endorse, { borderColor: person.skill.endorsed_by_current_user ? theme.success : theme.primary }]}><Text style={{ color: person.skill.endorsed_by_current_user ? theme.success : theme.primary, fontSize: 10, fontWeight: '800' }}>{person.skill.endorsed_by_current_user ? 'Endorsed' : 'Endorse'}</Text></Pressable> : null}</View>)}</View></View>} />;
}

function MemberEditor({ editing, members, onClose, onSaved, teamId, users }: { editing: TeamMember | null | undefined; members: TeamMember[]; onClose: () => void; onSaved: () => Promise<unknown>; teamId: number; users: EntityRecord[] }) {
  const theme = useAppTheme();
  const [draft, setDraft] = useState<MemberDraft>({ userId: 0, role: 'member', status: 'accepted' });
  const available = users.filter((candidate) => editing || !members.some((member) => member.id === candidate.id));
  const initialize = () => setDraft({ userId: editing?.id || Number(available[0]?.id || 0), role: editing?.role || 'member', status: editing?.status || 'accepted' });
  const save = useMutation({ mutationFn: () => editing ? endpoints.updateTeamUser(editing.team_user_id, { role: draft.role, status: draft.status }) : endpoints.createTeamUser({ team_id: teamId, user_id: draft.userId, role: draft.role, status: draft.status }), onSuccess: onSaved, onError: (error) => Alert.alert('Unable to save member', apiErrorMessage(error)) });
  const remove = useMutation({ mutationFn: () => endpoints.deleteTeamUser(editing!.team_user_id), onSuccess: onSaved, onError: (error) => Alert.alert('Unable to remove member', apiErrorMessage(error)) });
  return <Modal animationType="slide" onShow={initialize} onRequestClose={onClose} presentationStyle="pageSheet" visible={editing !== undefined}><View style={[styles.modal, { backgroundColor: theme.background }]}><View style={[styles.modalHeader, { borderBottomColor: theme.border }]}><Pressable accessibilityLabel="Close member editor" onPress={onClose} style={styles.iconButton}><X color={theme.text} size={22} /></Pressable><Text style={[styles.modalTitle, { color: theme.text }]}>{editing ? 'Edit member' : 'Add member'}</Text><View style={styles.iconButton} /></View><View style={styles.form}>{editing ? <View style={[styles.selectedPerson, { backgroundColor: theme.surface, borderColor: theme.border }]}><Avatar color={editing.avatar_color} name={editing.name} size={42} uri={absoluteAssetUrl(editing.profile_picture)} /><View style={styles.flex}><Text style={[styles.itemTitle, { color: theme.text }]}>{editing.name}</Text><Text style={[styles.itemMeta, { color: theme.textMuted }]}>{editing.email}</Text></View></View> : <PickerField label="Person" value={draft.userId} onChange={(value) => setDraft({ ...draft, userId: Number(value) })} options={available.map((person) => ({ label: String(person.name || person.full_name || person.email), value: Number(person.id) }))} />}<PickerField label="Team role" value={draft.role} onChange={(role) => setDraft({ ...draft, role: String(role) })} options={['admin', 'member', 'viewer'].map((value) => ({ label: titleize(value), value }))} /><PickerField label="Membership status" value={draft.status} onChange={(status) => setDraft({ ...draft, status: String(status) })} options={['accepted', 'pending', 'invited', 'requested', 'rejected'].map((value) => ({ label: titleize(value), value }))} /><PrimaryButton disabled={!editing && !draft.userId} label="Save member" loading={save.isPending} onPress={() => save.mutate()} />{editing ? <Pressable onPress={() => Alert.alert(`Remove ${editing.name}?`, 'They will lose this team membership.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => remove.mutate() }])} style={styles.delete}><Trash2 color={theme.danger} size={18} /><Text style={{ color: theme.danger, fontWeight: '800' }}>Remove from team</Text></Pressable> : null}</View></View></Modal>;
}

function PickerField({ label, value, onChange, options }: { label: string; value: string | number; onChange: (value: string | number) => void; options: Array<{ label: string; value: string | number }> }) {
  const theme = useAppTheme();
  return <View><Text style={[styles.label, { color: theme.text }]}>{label}</Text><View style={[styles.picker, { backgroundColor: theme.surface, borderColor: theme.border }]}><Picker selectedValue={value} onValueChange={onChange} style={{ color: theme.text }}>{options.map((option) => <Picker.Item key={String(option.value)} label={option.label} value={option.value} />)}</Picker></View></View>;
}

function skillSummary(row: Record<string, string | number>) {
  const parts = [['expert_count', 'expert'], ['advanced_count', 'advanced'], ['intermediate_count', 'intermediate'], ['beginner_count', 'beginner']].filter(([key]) => Number(row[key]) > 0).map(([key, label]) => `${row[key]} ${label}`);
  return parts.join(' · ') || 'Capability recorded';
}

function availabilityColor(status: string | null | undefined, theme: ReturnType<typeof useAppTheme>) {
  if (status === 'available' || status === 'free') return theme.success;
  if (status === 'busy' || status === 'limited') return theme.warning;
  return theme.textMuted;
}

function titleize(value: string) { return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }

const styles = StyleSheet.create({
  flex: { flex: 1 }, iconButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 }, add: { alignItems: 'center', borderRadius: 8, height: 42, justifyContent: 'center', width: 42 }, segment: { paddingHorizontal: 20, paddingTop: 14 }, scroll: { padding: 20, paddingBottom: 44 }, list: { padding: 20, paddingBottom: 44 },
  metrics: { flexDirection: 'row', gap: 8 }, metric: { alignItems: 'center', borderRadius: 8, borderWidth: 1, flex: 1, minHeight: 104, padding: 10 }, metricValue: { fontSize: 23, fontWeight: '900', marginTop: 6 }, metricLabel: { fontSize: 11, marginTop: 2 }, section: { marginTop: 25 }, sectionTitle: { fontSize: 17, fontWeight: '800', marginBottom: 10 }, panel: { borderRadius: 8, borderWidth: 1, overflow: 'hidden' }, insightRow: { minHeight: 60, paddingHorizontal: 13, paddingVertical: 11 }, emptyText: { fontSize: 13, lineHeight: 19, padding: 14 }, expert: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 11, minHeight: 64 },
  member: { alignItems: 'center', borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 12, marginBottom: 9, minHeight: 78, padding: 11 }, memberCopy: { flex: 1 }, titleLine: { alignItems: 'center', flexDirection: 'row', gap: 8 }, itemTitle: { flex: 1, fontSize: 14, fontWeight: '800' }, itemMeta: { fontSize: 12, marginTop: 4 }, role: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase' }, availability: { fontSize: 11, fontWeight: '700', marginTop: 5, textTransform: 'capitalize' },
  skill: { borderRadius: 8, borderWidth: 1, marginBottom: 9, padding: 13 }, skillPeople: { gap: 6, marginTop: 11 }, skillPerson: { alignItems: 'center', borderRadius: 6, flexDirection: 'row', minHeight: 50, paddingHorizontal: 10 }, skillName: { fontSize: 12, fontWeight: '700' }, skillLevel: { fontSize: 10, fontWeight: '800', marginTop: 3 }, endorse: { alignItems: 'center', borderRadius: 6, borderWidth: 1, justifyContent: 'center', marginLeft: 8, minHeight: 34, minWidth: 68, paddingHorizontal: 8 },
  modal: { flex: 1 }, modalHeader: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', minHeight: 62, paddingHorizontal: 10 }, modalTitle: { fontSize: 17, fontWeight: '800' }, form: { gap: 18, padding: 20 }, selectedPerson: { alignItems: 'center', borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 11, minHeight: 68, padding: 11 }, label: { fontSize: 13, fontWeight: '800', marginBottom: 7 }, picker: { borderRadius: 8, borderWidth: 1, minHeight: 52, overflow: 'hidden' }, delete: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 48 },
});
