import { Award, Sparkles } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { EntityCollectionScreen, type EntityField } from '../components/EntityCollectionScreen';
import { useAppTheme } from '../theme';

const fields: EntityField[] = [
  { key: 'name', label: 'Skill name', placeholder: 'e.g. React, design, leadership', required: true },
  { key: 'proficiency', label: 'Proficiency', options: ['beginner', 'intermediate', 'advanced', 'expert'], required: true },
];

export function SkillsScreen() {
  const theme = useAppTheme();
  return <EntityCollectionScreen title="My skills" subtitle="Capabilities, proficiency, and recognition" path="/user_skills" wrapper="user_skill" primary="name" fields={fields}
    toolbar={<View style={[styles.intro, { backgroundColor: theme.surface, borderColor: theme.border }]}><Sparkles color={theme.primary} size={22} /><View style={styles.copy}><Text style={[styles.title, { color: theme.text }]}>Show what you bring to the team</Text><Text style={[styles.hint, { color: theme.textMuted }]}>Add a capability and choose your current level. Teammates can recognize your experience with endorsements.</Text></View></View>}
    renderRecord={record => {
      const level = String(record.proficiency_label || record.proficiency || 'Listed');
      const count = Number(record.endorsements_count || 0);
      return <View style={styles.badges}><View style={[styles.badge, { backgroundColor: theme.surfaceMuted }]}><Text style={[styles.level, { color: theme.primary }]}>{level}</Text></View><View style={styles.recognition}><Award color={theme.textMuted} size={14} /><Text style={[styles.hint, { color: theme.textMuted }]}>{count} {count === 1 ? 'endorsement' : 'endorsements'}</Text></View></View>;
    }} />;
}
const styles = StyleSheet.create({
  intro: { flexDirection: 'row', gap: 12, borderWidth: 1, borderRadius: 16, padding: 16, marginHorizontal: 20, marginTop: 14 },
  copy: { flex: 1 }, title: { fontSize: 14, fontWeight: '800' }, hint: { fontSize: 12, lineHeight: 18, marginTop: 3 },
  badges: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 9, marginTop: 8 },
  badge: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5 }, level: { fontSize: 12, fontWeight: '800', textTransform: 'capitalize' },
  recognition: { flexDirection: 'row', gap: 4, alignItems: 'center' },
});
