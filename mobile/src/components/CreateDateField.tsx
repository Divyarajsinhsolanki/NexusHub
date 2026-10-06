import DateTimePicker from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { Calendar, Clock } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useAppTheme } from '../theme';

export function CreateDateField({ date, includeTime, onChange }: { date: Date; includeTime: boolean; onChange: (date: Date) => void }) {
  const theme = useAppTheme();
  const [mode, setMode] = useState<'date' | 'time' | null>(null);
  if (Platform.OS === 'ios') return <DateTimePicker mode={includeTime ? 'datetime' : 'date'} onChange={(_, value) => { if (value) onChange(value); }} value={date} />;
  return <View style={{ gap: 8 }}>
    <View style={{ flexDirection: 'row', gap: 16 }}>
      <Pressable accessibilityLabel="Choose date" accessibilityRole="button" onPress={() => setMode('date')} style={{ alignItems: 'center', flexDirection: 'row', gap: 8, minHeight: 44 }}><Calendar color={theme.primary} size={20} /><Text style={{ color: theme.text }}>{format(date, 'MMM d, yyyy')}</Text></Pressable>
      {includeTime ? <Pressable accessibilityLabel="Choose time" accessibilityRole="button" onPress={() => setMode('time')} style={{ alignItems: 'center', flexDirection: 'row', gap: 8, minHeight: 44 }}><Clock color={theme.primary} size={20} /><Text style={{ color: theme.text }}>{format(date, 'HH:mm')}</Text></Pressable> : null}
    </View>
    {mode ? <DateTimePicker mode={mode} onChange={(_, value) => { setMode(null); if (value) onChange(value); }} value={date} /> : null}
  </View>;
}
