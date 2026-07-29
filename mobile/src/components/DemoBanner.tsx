import { useRouter } from 'expo-router';
import { ChevronRight, Eye } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../auth/AuthProvider';
import { useAppTheme } from '../theme';

export function DemoBanner() {
  const { user } = useAuth();
  const router = useRouter();
  const theme = useAppTheme();

  if (!user?.demo_account) return null;

  return (
    <Pressable
      accessibilityLabel="Open guided demo tour"
      accessibilityRole="button"
      onPress={() => router.push('/more/demo' as never)}
      style={[styles.banner, { backgroundColor: theme.text }]}
    >
      <View style={styles.copy}>
        <Eye color={theme.background} size={15} />
        <Text style={[styles.label, { color: theme.background }]}>Read-only demo</Text>
        <Text numberOfLines={1} style={[styles.detail, { color: theme.background }]}>Synthetic workspace data</Text>
      </View>
      <ChevronRight color={theme.background} size={17} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 36, paddingHorizontal: 16 },
  copy: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 7 },
  label: { fontSize: 12, fontWeight: '800' },
  detail: { flex: 1, fontSize: 11, opacity: 0.72 },
});
