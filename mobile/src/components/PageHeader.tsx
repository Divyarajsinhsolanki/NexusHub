import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../theme';

export function PageHeader({ title, subtitle, action, leading }: { title: string; subtitle?: string; action?: ReactNode; leading?: ReactNode }) {
  const theme = useAppTheme();
  return (
    <View style={[styles.header, { backgroundColor: theme.background, borderBottomColor: theme.border, shadowColor: theme.shadow }]}>
      {leading}
      <View style={styles.copy}>
        <Text accessibilityRole="header" adjustsFontSizeToFit minimumFontScale={0.82} numberOfLines={1} style={[styles.title, { color: theme.text }]}>
          {title}
        </Text>
        {subtitle ? <Text numberOfLines={1} style={[styles.subtitle, { color: theme.textMuted }]}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    elevation: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 70,
    paddingHorizontal: 20,
    paddingVertical: 12,
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  copy: { flex: 1, paddingHorizontal: 12 },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: 0 },
  subtitle: { fontSize: 13, lineHeight: 18, marginTop: 2 },
});
