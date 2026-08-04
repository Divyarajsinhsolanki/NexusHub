import { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../theme';
import { TouchableScale } from './TouchableScale';

export function PrimaryButton({ label, onPress, loading = false, disabled = false, icon }: { label: string; onPress: () => void; loading?: boolean; disabled?: boolean; icon?: ReactNode }) {
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
        { backgroundColor: theme.primary, shadowColor: theme.shadow },
      ]}>
      {loading ? <ActivityIndicator color="#ffffff" /> : <View style={styles.content}>{icon}<Text style={styles.label}>{label}</Text></View>}
    </TouchableScale>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', borderRadius: 8, elevation: 2, justifyContent: 'center', minHeight: 50, paddingHorizontal: 18, shadowOffset: { height: 5, width: 0 }, shadowOpacity: 0.14, shadowRadius: 10 },
  content: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  label: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
});
