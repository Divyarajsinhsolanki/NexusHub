import { useRouter } from 'expo-router';
import { ChevronRight, Eye, LogOut } from 'lucide-react-native';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../auth/AuthProvider';
import { useAppTheme } from '../theme';

export function DemoBanner() {
  const { signOut, user } = useAuth();
  const router = useRouter();
  const theme = useAppTheme();

  if (!user?.demo_account) return null;

  const confirmSignOut = () => {
    Alert.alert('Exit demo?', 'You will return to the public portfolio.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);
  };

  return (
    <View style={[styles.banner, { backgroundColor: theme.text }]}>
      <Pressable
        accessibilityLabel="Open guided demo tour"
        accessibilityRole="button"
        onPress={() => router.push('/more/demo' as never)}
        style={styles.tourButton}
      >
        <Eye color={theme.background} size={15} />
        <View style={styles.copy}>
          <Text style={[styles.label, { color: theme.background }]}>Read-only demo</Text>
          <Text numberOfLines={1} style={[styles.detail, { color: theme.background }]}>Synthetic workspace data</Text>
        </View>
        <ChevronRight color={theme.background} size={17} />
      </Pressable>
      <Pressable
        accessibilityLabel="Sign out of demo"
        accessibilityRole="button"
        onPress={confirmSignOut}
        style={[styles.exitButton, { borderColor: theme.background }]}
      >
        <LogOut color={theme.background} size={15} />
        <Text style={[styles.exitLabel, { color: theme.background }]}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { alignItems: 'center', flexDirection: 'row', gap: 8, minHeight: 42, paddingHorizontal: 12 },
  tourButton: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 7, minHeight: 42 },
  copy: { flex: 1 },
  label: { fontSize: 12, fontWeight: '800' },
  detail: { fontSize: 11, marginTop: 1, opacity: 0.72 },
  exitButton: { alignItems: 'center', borderRadius: 7, borderWidth: 1, flexDirection: 'row', gap: 5, minHeight: 32, paddingHorizontal: 9 },
  exitLabel: { fontSize: 11, fontWeight: '900' },
});
