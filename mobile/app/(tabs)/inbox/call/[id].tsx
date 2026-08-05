import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { apiErrorMessage } from '@/src/api/client';
import { endpoints } from '@/src/api/endpoints';
import { MobileCallRoom } from '@/src/components/call/MobileCallRoom';
import { LoadingState } from '@/src/components/StateView';
import { useCallRealtime } from '@/src/realtime/useCallRealtime';

export default function CallScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const callId = Number(id);
  const router = useRouter();
  const credentials = useQuery({ queryKey: ['call', callId], queryFn: () => endpoints.joinCall(callId), enabled: Number.isFinite(callId), retry: false });
  const close = useCallback(() => router.back(), [router]);

  useCallRealtime(credentials.data?.call_session.public_id, (event) => {
    if (event.type === 'call_ended') close();
  });

  const leave = async () => {
    try { await endpoints.callAction(callId, 'leave'); } catch { /* Local media still closes. */ }
    close();
  };
  const end = async () => {
    try { await endpoints.callAction(callId, 'end'); close(); } catch (error) { Alert.alert('Unable to end call', apiErrorMessage(error)); }
  };

  if (credentials.isLoading) return <View style={styles.loading}><LoadingState label="Joining secure call" /></View>;
  if (credentials.isError || !credentials.data) return <JoinError error={credentials.error} onClose={close} />;
  return <MobileCallRoom credentials={credentials.data} onEnd={end} onLeave={leave} />;
}

function JoinError({ error, onClose }: { error: unknown; onClose: () => void }) {
  Alert.alert('Unable to join call', apiErrorMessage(error), [{ text: 'Close', onPress: onClose }]);
  return <View style={styles.loading} />;
}

const styles = StyleSheet.create({ loading: { backgroundColor: '#101216', flex: 1, justifyContent: 'center' } });
