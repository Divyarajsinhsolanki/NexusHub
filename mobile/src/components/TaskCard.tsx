import { format, parseISO } from 'date-fns';
import { CalendarDays, Eye, MoreHorizontal, Pencil } from 'lucide-react-native';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Task, TaskStatus } from '../api/types';
import { useAppTheme } from '../theme';
import { TouchableScale } from './TouchableScale';

const statuses: Array<{ value: TaskStatus; label: string }> = [
  { value: 'todo', label: 'To do' },
  { value: 'inprogress', label: 'Doing' },
  { value: 'completed', label: 'Done' },
];

export const TaskCard = memo(function TaskCard({ task, onStatusChange, onEdit, onInspect, onMore, readOnly = false, updating = false }: { task: Task; onStatusChange?: (status: TaskStatus) => void; onEdit?: () => void; onInspect?: () => void; onMore?: () => void; readOnly?: boolean; updating?: boolean }) {
  const theme = useAppTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.surfaceRaised, borderColor: theme.border, shadowColor: theme.shadow }]}>
      <View style={styles.topline}>
        <Text numberOfLines={1} style={[styles.key, { color: theme.primary }]}>{task.task_id || task.type}</Text>
        <View style={styles.topActions}>{task.priority ? <Text style={[styles.priority, { backgroundColor: theme.surfaceMuted, color: theme.warning }]}>{task.priority}</Text> : null}{onInspect ? <TouchableScale accessibilityLabel={`Inspect ${task.title}`} accessibilityRole="button" onPress={onInspect} style={styles.edit}><Eye color={theme.textMuted} size={17} /></TouchableScale> : null}{onMore && !readOnly ? <TouchableScale accessibilityLabel={`Move ${task.title}`} accessibilityRole="button" onPress={onMore} style={styles.edit}><MoreHorizontal color={theme.textMuted} size={18} /></TouchableScale> : null}{onEdit && !readOnly ? <TouchableScale accessibilityLabel={`Edit ${task.title}`} accessibilityRole="button" onPress={onEdit} style={styles.edit}><Pencil color={theme.textMuted} size={16} /></TouchableScale> : null}</View>
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
      {onStatusChange && !readOnly ? (
        <View accessibilityRole="tablist" style={[styles.statuses, { backgroundColor: theme.surfaceMuted }]}>
          {statuses.map((status) => {
            const selected = task.status === status.value;
            return (
              <TouchableScale
                accessibilityRole="tab"
                accessibilityState={{ selected, disabled: updating }}
                disabled={updating}
                haptic={selected ? 'none' : 'selection'}
                key={status.value}
                onPress={() => onStatusChange(status.value)}
                scaleTo={0.985}
                style={[styles.status, selected && { backgroundColor: theme.primary }]}>
                <Text style={[styles.statusText, { color: selected ? '#ffffff' : theme.textMuted }]}>{status.label}</Text>
              </TouchableScale>
            );
          })}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: 8, borderWidth: 1, elevation: 1, padding: 15, shadowOffset: { height: 3, width: 0 }, shadowOpacity: 0.08, shadowRadius: 8 },
  topline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  topActions: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  edit: { alignItems: 'center', height: 32, justifyContent: 'center', width: 32 },
  key: { fontSize: 12, fontWeight: '800' },
  priority: { borderRadius: 6, fontSize: 12, fontWeight: '700', overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 3, textTransform: 'capitalize' },
  title: { fontSize: 16, fontWeight: '700', lineHeight: 22, marginTop: 6 },
  description: { fontSize: 13, lineHeight: 19, marginTop: 5 },
  meta: { alignItems: 'center', flexDirection: 'row', gap: 16, marginTop: 12 },
  metaItem: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  metaText: { fontSize: 12 },
  statuses: { borderRadius: 6, flexDirection: 'row', height: 38, marginTop: 14, padding: 3 },
  status: { alignItems: 'center', borderRadius: 4, flex: 1, justifyContent: 'center' },
  statusText: { fontSize: 12, fontWeight: '700' },
});
