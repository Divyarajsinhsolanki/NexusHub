import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../theme';

export function PageHeader({ title, subtitle, action, leading }: { title: string; subtitle?: string; action?: ReactNode; leading?: ReactNode }) {
  const theme = useAppTheme();
  return (
    <View style={[styles.header, { borderBottomColor: theme.border, backgroundColor: theme.background }]}>
      {leading}
      <View style={styles.copy}>
        <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
          {title}
        </Text>
        {subtitle ? <Text style={[styles.subtitle, { color: theme.textMuted }]}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 72,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  copy: { flex: 1, paddingHorizontal: 12 },
  title: { fontSize: 24, fontWeight: '700', letterSpacing: 0 },
  subtitle: { fontSize: 13, marginTop: 2 },
});
