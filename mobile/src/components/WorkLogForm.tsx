import { zodResolver } from '@hookform/resolvers/zod';
import { Picker } from '@react-native-picker/picker';
import { format } from 'date-fns';
import { Trash2, X } from 'lucide-react-native';
import { useEffect } from 'react';
import { Control, Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { z } from 'zod';

import type { WorkLog, WorkLogInput, WorkOptions } from '../api/types';
import { useAppTheme } from '../theme';
import { PrimaryButton } from './PrimaryButton';

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const schema = z
  .object({
    title: z.string().trim().min(1, 'Title is required.'),
    description: z.string(),
    log_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.'),
    start_time: z.string().regex(timePattern, 'Use 24-hour HH:MM.'),
    end_time: z.string().regex(timePattern, 'Use 24-hour HH:MM.'),
    actual_minutes: z.string().regex(/^\d+$/, 'Enter whole minutes.'),
    category_id: z.string(),
    priority_id: z.string(),
    tags: z.string(),
  })
  .refine((values) => values.end_time > values.start_time, { message: 'End time must be after start time.', path: ['end_time'] });

type Fields = z.infer<typeof schema>;

const defaults = (workLog?: WorkLog | null): Fields => ({
  title: workLog?.title || '',
  description: workLog?.description || '',
  log_date: workLog?.log_date || format(new Date(), 'yyyy-MM-dd'),
  start_time: workLog?.start_time || '09:00',
  end_time: workLog?.end_time || '10:00',
  actual_minutes: String(workLog?.actual_minutes || 60),
  category_id: String(workLog?.category?.id || ''),
  priority_id: String(workLog?.priority?.id || ''),
  tags: workLog?.tags.map((tag) => tag.name).join(', ') || '',
});

type Props = {
  visible: boolean;
  workLog?: WorkLog | null;
  options?: WorkOptions;
  saving: boolean;
  onClose: () => void;
  onSave: (input: WorkLogInput) => Promise<void>;
  onDelete?: () => void;
};

export function WorkLogForm({ visible, workLog, options, saving, onClose, onSave, onDelete }: Props) {
  const theme = useAppTheme();
  const { control, handleSubmit, reset, formState: { errors } } = useForm<Fields>({ resolver: zodResolver(schema), defaultValues: defaults(workLog) });

  useEffect(() => reset(defaults(workLog)), [reset, visible, workLog]);

  const submit = handleSubmit(async (values) => {
    await onSave({
      title: values.title.trim(),
      description: values.description.trim(),
      log_date: values.log_date,
      start_time: values.start_time,
      end_time: values.end_time,
      actual_minutes: Number(values.actual_minutes),
      category_id: values.category_id ? Number(values.category_id) : null,
      priority_id: values.priority_id ? Number(values.priority_id) : null,
      tags: values.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
    });
  });

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={visible}>
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable accessibilityLabel="Close work log" accessibilityRole="button" hitSlop={10} onPress={onClose} style={styles.iconButton}>
            <X color={theme.text} size={24} />
          </Pressable>
          <Text accessibilityRole="header" style={[styles.heading, { color: theme.text }]}>{workLog ? 'Edit work log' : 'New work log'}</Text>
          {onDelete ? (
            <Pressable accessibilityLabel="Delete work log" accessibilityRole="button" hitSlop={10} onPress={onDelete} style={styles.iconButton}>
              <Trash2 color={theme.danger} size={22} />
            </Pressable>
          ) : <View style={styles.iconButton} />}
        </View>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            <FormInput control={control} error={errors.title?.message} label="Title" name="title" />
            <FormInput control={control} error={errors.description?.message} label="Description" multiline name="description" />
            <FormInput control={control} error={errors.log_date?.message} label="Date" name="log_date" placeholder="YYYY-MM-DD" />
            <View style={styles.columns}>
              <View style={styles.column}><FormInput control={control} error={errors.start_time?.message} label="Start" name="start_time" placeholder="09:00" /></View>
              <View style={styles.column}><FormInput control={control} error={errors.end_time?.message} label="End" name="end_time" placeholder="10:00" /></View>
            </View>
            <FormInput control={control} error={errors.actual_minutes?.message} keyboardType="number-pad" label="Minutes" name="actual_minutes" />

            <Text style={[styles.label, { color: theme.text }]}>Category</Text>
            <Controller control={control} name="category_id" render={({ field: { onChange, value } }) => (
              <View style={[styles.picker, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Picker dropdownIconColor={theme.text} onValueChange={onChange} selectedValue={value} style={{ color: theme.text }}>
                  <Picker.Item label="No category" value="" />
                  {options?.categories.map((option) => <Picker.Item key={option.id} label={option.name} value={String(option.id)} />)}
                </Picker>
              </View>
            )} />

            <Text style={[styles.label, { color: theme.text }]}>Priority</Text>
            <Controller control={control} name="priority_id" render={({ field: { onChange, value } }) => (
              <View style={[styles.picker, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Picker dropdownIconColor={theme.text} onValueChange={onChange} selectedValue={value} style={{ color: theme.text }}>
                  <Picker.Item label="No priority" value="" />
                  {options?.priorities.map((option) => <Picker.Item key={option.id} label={option.name} value={String(option.id)} />)}
                </Picker>
              </View>
            )} />

            <FormInput control={control} error={errors.tags?.message} label="Tags" name="tags" placeholder="mobile, api" />
            <PrimaryButton label={workLog ? 'Save changes' : 'Create work log'} loading={saving} onPress={submit} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function FormInput({ control, name, label, error, multiline, placeholder, keyboardType }: { control: Control<Fields>; name: keyof Fields; label: string; error?: string; multiline?: boolean; placeholder?: string; keyboardType?: 'default' | 'number-pad' }) {
  const theme = useAppTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
      <Controller control={control} name={name} render={({ field: { onBlur, onChange, value } }) => (
        <TextInput
          accessibilityLabel={label}
          keyboardType={keyboardType}
          multiline={multiline}
          onBlur={onBlur}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={theme.textMuted}
          style={[styles.input, multiline && styles.multiline, { backgroundColor: theme.surface, borderColor: error ? theme.danger : theme.border, color: theme.text }]}
          value={value}
        />
      )} />
      {error ? <Text style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  header: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', height: 58, justifyContent: 'space-between', paddingHorizontal: 12 },
  heading: { fontSize: 17, fontWeight: '700' },
  iconButton: { alignItems: 'center', height: 42, justifyContent: 'center', width: 42 },
  form: { padding: 20, paddingBottom: 40 },
  field: { marginBottom: 15 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 7 },
  input: { borderRadius: 6, borderWidth: 1, fontSize: 15, minHeight: 48, paddingHorizontal: 13, paddingVertical: 10 },
  multiline: { minHeight: 92, textAlignVertical: 'top' },
  error: { fontSize: 12, marginTop: 4 },
  columns: { flexDirection: 'row', gap: 12 },
  column: { flex: 1 },
  picker: { borderRadius: 6, borderWidth: 1, marginBottom: 15, minHeight: 50, overflow: 'hidden' },
});
