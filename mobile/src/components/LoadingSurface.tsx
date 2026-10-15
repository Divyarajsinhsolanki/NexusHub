import { AccessibilityInfo, ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useEffect, useState } from 'react';
import { useAppTheme } from '../theme';

export const loadingPalette = {
  light: { background: '#f6f3ed', surface: '#fffdf9', border: '#e5dfd5', text: '#292d36', muted: '#6c6b70', accent: '#3159d5', soft: '#e8edf9' },
  dark: { background: '#191c23', surface: '#242833', border: '#3c414c', text: '#f6f3ed', muted: '#b9bbc4', accent: '#91aaff', soft: '#333e60' },
};

export function LoadingSurface({ label = 'Loading', title = 'Please wait' }: { label?: string; title?: string }) {
  const theme = useAppTheme();
  const colors = loadingPalette[theme.isDark ? 'dark' : 'light'];
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduceMotion(value); }).catch(() => {});
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { active = false; listener.remove(); };
  }, []);
  return <View style={[styles.surface, { backgroundColor: colors.background }]}>
    <View accessible accessibilityLabel={`${title}. ${label}`} accessibilityState={{ busy: true }} accessibilityLiveRegion="polite" style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.heading}>
        <View style={[styles.mark, { backgroundColor: colors.soft, borderColor: colors.border }]}>
          {reduceMotion ? <View style={styles.bars}>{[12, 20, 16].map((height, index) => <View key={index} style={{ height, width: 5, borderRadius: 3, backgroundColor: colors.accent }} />)}</View> : <ActivityIndicator testID="loading-activity" color={colors.accent} size="small" />}
        </View>
        <View style={styles.copy}><Text style={[styles.title, { color: colors.muted }]}>{title}</Text><Text style={[styles.label, { color: colors.text }]}>{label}</Text></View>
      </View>
      <View style={[styles.track, { backgroundColor: colors.soft }]}><View style={{ width: '38%', height: 4, borderRadius: 4, backgroundColor: colors.accent }} /></View>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  surface: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 400, padding: 24, borderWidth: 1, borderRadius: 22, shadowColor: '#453826', shadowOpacity: 0.06, shadowOffset: { width: 0, height: 8 }, shadowRadius: 20, elevation: 1 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  mark: { width: 46, height: 46, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  bars: { flexDirection: 'row', gap: 3, alignItems: 'flex-end' },
  copy: { flex: 1 },
  title: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '600', marginBottom: 5 },
  label: { fontSize: 14, lineHeight: 22, fontWeight: '500' },
  track: { height: 4, borderRadius: 4, marginTop: 24, overflow: 'hidden' },
});
