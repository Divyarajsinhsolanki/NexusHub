import { format, parseISO } from 'date-fns';
import { CalendarDays } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Task, TaskStatus } from '../api/types';
import { useAppTheme } from '../theme';

const statuses: Array<{ value: TaskStatus; label: string }> = [
  { value: 'todo', label: 'To do' },
  { value: 'inprogress', label: 'Doing' },
  { value: 'completed', label: 'Done' },
];

export function TaskCard({ task, onStatusChange, updating = false }: { task: Task; onStatusChange?: (status: TaskStatus) => void; updating?: boolean }) {
  const theme = useAppTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.topline}>
        <Text numberOfLines={1} style={[styles.key, { color: theme.primary }]}>{task.task_id || task.type}</Text>
        {task.priority ? <Text style={[styles.priority, { color: theme.warning }]}>{task.priority}</Text> : null}
      </View>
      <Text style={[styles.title, { color: theme.text }]}>{task.title}</Text>
      {task.description ? <Text numberOfLines={2} style={[styles.description, { color: theme.textMuted }]}>{task.description}</Text> : null}
      <View style={styles.meta}>
        {task.end_date ? (
          <View style={styles.metaItem}>
            <CalendarDays color={theme.textMuted} size={15} />
            <Text style={[styles.metaText, { color: theme.textMuted }]}>{format(parseISO(task.end_date), 'MMM d')}</Text>
          </View>
        ) : null}
        {task.assignee ? <Text style={[styles.metaText, { color: theme.textMuted }]}>{task.assignee.name}</Text> : null}
      </View>
      {onStatusChange ? (
        <View accessibilityRole="tablist" style={[styles.statuses, { backgroundColor: theme.surfaceMuted }]}>
          {statuses.map((status) => {
            const selected = task.status === status.value;
            return (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected, disabled: updating }}
                disabled={updating}
                key={status.value}
                onPress={() => onStatusChange(status.value)}
                style={[styles.status, selected && { backgroundColor: theme.primary }]}>
                <Text style={[styles.statusText, { color: selected ? '#ffffff' : theme.textMuted }]}>{status.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 8, borderWidth: 1, padding: 15 },
  topline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  key: { fontSize: 12, fontWeight: '800' },
  priority: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  title: { fontSize: 16, fontWeight: '700', lineHeight: 22, marginTop: 6 },
  description: { fontSize: 13, lineHeight: 19, marginTop: 5 },
  meta: { alignItems: 'center', flexDirection: 'row', gap: 16, marginTop: 12 },
  metaItem: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  metaText: { fontSize: 12 },
  statuses: { borderRadius: 6, flexDirection: 'row', height: 38, marginTop: 14, padding: 3 },
  status: { alignItems: 'center', borderRadius: 4, flex: 1, justifyContent: 'center' },
  statusText: { fontSize: 12, fontWeight: '700' },
});
