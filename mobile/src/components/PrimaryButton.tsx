import { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../theme';
import { TouchableScale } from './TouchableScale';

export function PrimaryButton({ label, onPress, loading = false, disabled = false, icon, danger = false }: { label: string; onPress: () => void; loading?: boolean; disabled?: boolean; icon?: ReactNode; danger?: boolean }) {
  const theme = useAppTheme();
  const unavailable = disabled || loading;
  return (
    <TouchableScale
      accessibilityRole="button"
      disabled={unavailable}
      haptic="light"
      onPress={onPress}
      style={[
        styles.button,
        { backgroundColor: danger ? theme.danger : theme.primary, opacity: unavailable ? 0.55 : 1 },
      ]}>
      {loading ? <ActivityIndicator color="#ffffff" /> : <View style={styles.content}>{icon}<Text style={styles.label}>{label}</Text></View>}
    </TouchableScale>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', borderRadius: 9, justifyContent: 'center', minHeight: 50, paddingHorizontal: 18 },
  content: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  label: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
});
