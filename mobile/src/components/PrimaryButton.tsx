import { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../theme';

export function PrimaryButton({ label, onPress, loading = false, disabled = false, icon }: { label: string; onPress: () => void; loading?: boolean; disabled?: boolean; icon?: ReactNode }) {
  const theme = useAppTheme();
  const unavailable = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={unavailable}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: pressed ? theme.primaryPressed : theme.primary, opacity: unavailable ? 0.55 : 1 },
      ]}>
      {loading ? <ActivityIndicator color="#ffffff" /> : <View style={styles.content}>{icon}<Text style={styles.label}>{label}</Text></View>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', borderRadius: 6, justifyContent: 'center', minHeight: 50, paddingHorizontal: 18 },
  content: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  label: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
});
