import { AlertCircle, Inbox } from 'lucide-react-native';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../theme';
import { TouchableScale } from './TouchableScale';

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  const theme = useAppTheme();
  return (
    <View accessibilityLabel={label} style={styles.state}>
      <ActivityIndicator color={theme.primary} size="large" />
      <Text style={[styles.message, { color: theme.textMuted }]}>{label}</Text>
    </View>
  );
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  const theme = useAppTheme();
  return (
    <View style={styles.state}>
      <Inbox color={theme.textMuted} size={32} />
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.message, { color: theme.textMuted }]}>{message}</Text>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const theme = useAppTheme();
  return (
    <View accessibilityRole="alert" style={styles.state}>
      <AlertCircle color={theme.danger} size={32} />
      <Text style={[styles.title, { color: theme.text }]}>Unable to load</Text>
      <Text style={[styles.message, { color: theme.textMuted }]}>{message}</Text>
      {onRetry ? (
        <TouchableScale accessibilityRole="button" haptic="light" onPress={onRetry} style={[styles.retry, { backgroundColor: theme.primary }]}>
          <Text style={styles.retryText}>Try again</Text>
        </TouchableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  state: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 32 },
  title: { fontSize: 17, fontWeight: '700', marginTop: 12 },
  message: { fontSize: 14, lineHeight: 20, marginTop: 6, textAlign: 'center' },
  retry: { borderRadius: 8, marginTop: 18, paddingHorizontal: 18, paddingVertical: 10 },
  retryText: { color: '#ffffff', fontWeight: '700' },
});
