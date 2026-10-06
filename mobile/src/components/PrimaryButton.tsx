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
      accessibilityLabel={label}
      accessibilityState={{ disabled: unavailable, busy: loading }}
      disabled={unavailable}
      haptic="light"
      onPress={onPress}
      style={[
        styles.button,
        { backgroundColor: danger ? theme.danger : theme.primary },
      ]}>
      <View style={styles.content}>{loading ? <ActivityIndicator color="#ffffff" /> : icon}<Text style={styles.label}>{label}</Text></View>
    </TouchableScale>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', borderRadius: 8, justifyContent: 'center', minHeight: 52, paddingHorizontal: 18, paddingVertical: 12 },
  content: { alignItems: 'center', flexDirection: 'row', gap: 8, maxWidth: '100%' },
  label: { color: '#ffffff', flexShrink: 1, fontSize: 16, fontWeight: '700', textAlign: 'center' },
});
