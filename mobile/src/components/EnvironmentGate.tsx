import * as SplashScreen from 'expo-splash-screen';
import { PropsWithChildren, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { validateApiEnvironment } from '../config/runtimeEnvironment';

export function EnvironmentGate({ children }: PropsWithChildren) {
  const issue = validateApiEnvironment();

  useEffect(() => {
    // AuthGate owns normal splash dismissal. If configuration blocks the
    // provider tree, dismiss here so the actionable setup screen is visible.
    if (issue) requestAnimationFrame(() => { void SplashScreen.hideAsync(); });
  }, [issue?.code]);

  if (!issue) return children;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.title}>{issue.title}</Text>
        <Text style={styles.detail}>{issue.detail}</Text>
        <View style={styles.code}>
          <Text selectable style={styles.codeText}>EXPO_PUBLIC_API_URL=http://&lt;computer-LAN-IP&gt;:3000/api/v1</Text>
          <Text selectable style={styles.codeText}>LIVEKIT_URL=ws://&lt;computer-LAN-IP&gt;:7880</Text>
        </View>
        <Text style={styles.hint}>The phone and development computer must be on the same reachable network. Expo Go is not supported.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { alignItems: 'center', backgroundColor: '#f6f8fb', flex: 1, justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#ffffff', borderColor: '#d9e0ea', borderRadius: 12, borderWidth: 1, maxWidth: 480, padding: 22, width: '100%' },
  title: { color: '#111827', fontSize: 22, fontWeight: '800' },
  detail: { color: '#475569', fontSize: 15, lineHeight: 22, marginTop: 10 },
  code: { backgroundColor: '#eef2f7', borderRadius: 8, gap: 6, marginTop: 18, padding: 12 },
  codeText: { color: '#1e293b', fontFamily: 'monospace', fontSize: 12 },
  hint: { color: '#64748b', fontSize: 12, lineHeight: 18, marginTop: 15 },
});
