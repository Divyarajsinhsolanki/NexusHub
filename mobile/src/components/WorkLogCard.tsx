import { Clock3, Pencil } from 'lucide-react-native';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { WorkLog } from '../api/types';
import { useAppTheme } from '../theme';
import { TouchableScale } from './TouchableScale';

export const WorkLogCard = memo(function WorkLogCard({ workLog, onEdit }: { workLog: WorkLog; onEdit?: () => void }) {
  const theme = useAppTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.surfaceRaised, borderColor: theme.border, shadowColor: theme.shadow }]}>
      <View style={styles.row}>
        <View style={styles.copy}>
          <Text style={[styles.title, { color: theme.text }]}>{workLog.title}</Text>
          <View style={styles.time}>
            <Clock3 color={theme.textMuted} size={14} />
            <Text style={[styles.meta, { color: theme.textMuted }]}>
              {workLog.log_date} · {workLog.start_time}-{workLog.end_time} · {workLog.actual_minutes} min
            </Text>
          </View>
        </View>
        {onEdit ? <TouchableScale accessibilityLabel={`Edit ${workLog.title}`} accessibilityRole="button" hitSlop={10} onPress={onEdit} style={styles.edit}>
          <Pencil color={theme.textMuted} size={19} />
        </TouchableScale> : null}
      </View>
      {workLog.description ? <Text style={[styles.description, { color: theme.textMuted }]}>{workLog.description}</Text> : null}
      <View style={styles.tags}>
        {workLog.category ? <Tag label={workLog.category.name} color={workLog.category.color || theme.primary} /> : null}
        {workLog.priority ? <Tag label={workLog.priority.name} color={workLog.priority.color || theme.warning} /> : null}
        {workLog.tags.map((tag) => <Tag key={tag.id} label={tag.name} color={theme.textMuted} />)}
      </View>
    </View>
  );
});

function Tag({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.tag, { borderColor: color }]}>
      <Text style={[styles.tagText, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 8, borderWidth: 1, elevation: 1, padding: 15, shadowOffset: { height: 3, width: 0 }, shadowOpacity: 0.08, shadowRadius: 8 },
  row: { alignItems: 'flex-start', flexDirection: 'row' },
  copy: { flex: 1 },
  title: { fontSize: 16, fontWeight: '700' },
  time: { alignItems: 'center', flexDirection: 'row', gap: 6, marginTop: 7 },
  meta: { fontSize: 12 },
  edit: { alignItems: 'center', height: 36, justifyContent: 'center', width: 36 },
  description: { fontSize: 13, lineHeight: 19, marginTop: 10 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  tag: { borderRadius: 4, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3 },
  tagText: { fontSize: 11, fontWeight: '600' },
});
