import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { LogOut } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { apiErrorMessage } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { useAppTheme } from '../theme';

export function ImpersonationBanner() {
  const theme = useAppTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, stopImpersonation } = useAuth();
  const [stopping, setStopping] = useState(false);
  if (!user?.impersonation?.active) return null;

  const stop = async () => {
    setStopping(true);
    try {
      await stopImpersonation();
      queryClient.clear();
      router.replace('/(tabs)/today' as never);
    } catch (error) {
      Alert.alert('Unable to return to owner account', apiErrorMessage(error));
    } finally {
      setStopping(false);
    }
  };

  return <View style={[styles.banner, { backgroundColor: theme.warning }]}><View style={styles.copy}><Text style={styles.label}>Viewing as {user.full_name}</Text><Text numberOfLines={1} style={styles.detail}>Owner: {user.impersonation.owner?.name || 'workspace owner'}</Text></View><Pressable accessibilityRole="button" disabled={stopping} onPress={stop} style={styles.stop}><LogOut color="#ffffff" size={15} /><Text style={styles.stopLabel}>{stopping ? 'Returning...' : 'Return'}</Text></Pressable></View>;
}

const styles = StyleSheet.create({ banner: { alignItems: 'center', flexDirection: 'row', minHeight: 42, paddingHorizontal: 14 }, copy: { flex: 1 }, label: { color: '#ffffff', fontSize: 12, fontWeight: '800' }, detail: { color: '#ffffff', fontSize: 10, marginTop: 2, opacity: 0.86 }, stop: { alignItems: 'center', borderColor: 'rgba(255,255,255,0.42)', borderRadius: 5, borderWidth: 1, flexDirection: 'row', gap: 5, minHeight: 32, paddingHorizontal: 9 }, stopLabel: { color: '#ffffff', fontSize: 11, fontWeight: '800' } });
