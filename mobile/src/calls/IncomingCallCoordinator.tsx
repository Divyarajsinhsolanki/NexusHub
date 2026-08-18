import { useRouter } from 'expo-router';
import { useAudioPlayer } from 'expo-audio';
import { Phone, PhoneOff, Video } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { endpoints } from '../api/endpoints';
import type { CallSession } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { captureCallError, recordCallBreadcrumb } from '../observability/callDiagnostics';
import { useChatRealtime, type ChatEvent } from '../realtime/useChatRealtime';
import { useAppTheme } from '../theme';

export function IncomingCallCoordinator() {
  const { user } = useAuth();
  const router = useRouter();
  const theme = useAppTheme();
  const [incoming, setIncoming] = useState<CallSession | null>(null);
  const actionRef = useRef<number | null>(null);
  const ringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onEvent = useCallback((event: ChatEvent) => {
    const call = callSessionFromEvent(event);
    if (!call || call.initiator_id === user?.id) return;
    if (event.type === 'call_ringing' && AppState.currentState === 'active') {
      setIncoming(call);
      if (ringTimerRef.current) clearTimeout(ringTimerRef.current);
      ringTimerRef.current = setTimeout(() => {
        setIncoming((current) => current?.id === call.id ? null : current);
        void endpoints.callAction(call.id, 'decline').catch((error) => captureCallError(error, 'incoming', { call_id: call.id, timeout: true }));
      }, 30_000);
      recordCallBreadcrumb('incoming', { call_id: call.id, call_type: call.call_type });
      void endpoints.callAction(call.id, 'ack_ring').catch((error) => captureCallError(error, 'incoming', { call_id: call.id, acknowledge: true }));
      return;
    }
    if ((event.type === 'call_ended' || event.type === 'call_missed') && incoming?.id === call.id) setIncoming(null);
  }, [incoming?.id, user?.id]);

  useChatRealtime(undefined, onEvent);

  useEffect(() => () => {
    if (ringTimerRef.current) clearTimeout(ringTimerRef.current);
  }, []);

  useEffect(() => {
    if (incoming || !ringTimerRef.current) return;
    clearTimeout(ringTimerRef.current);
    ringTimerRef.current = null;
  }, [incoming]);
  if (!incoming || !user) return null;

  const answer = () => {
    if (actionRef.current === incoming.id) return;
    actionRef.current = incoming.id;
    const call = incoming;
    setIncoming(null);
    if (ringTimerRef.current) clearTimeout(ringTimerRef.current);
    ringTimerRef.current = null;
    actionRef.current = null;
    router.push(`/call/${call.id}?type=${call.call_type}` as never);
  };
  const decline = async () => {
    if (actionRef.current === incoming.id) return;
    actionRef.current = incoming.id;
    const call = incoming;
    try {
      await endpoints.callAction(call.id, 'decline');
      recordCallBreadcrumb('incoming', { call_id: call.id, declined: true });
      setIncoming(null);
      if (ringTimerRef.current) clearTimeout(ringTimerRef.current);
      ringTimerRef.current = null;
    } catch (error) {
      captureCallError(error, 'incoming', { call_id: call.id, decline: true });
    } finally {
      actionRef.current = null;
    }
  };

  return (
    <Modal animationType="none" onRequestClose={() => void decline()} transparent visible>
      <View style={styles.backdrop}>
        <IncomingRingtone callType={incoming.call_type} />
        <View accessibilityRole="alert" style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={[styles.avatar, { backgroundColor: theme.primary }]}>{incoming.call_type === 'video' ? <Video color="#ffffff" size={30} /> : <Phone color="#ffffff" size={30} />}</View>
          <Text style={[styles.eyebrow, { color: theme.primary }]}>INCOMING {incoming.call_type.toUpperCase()} CALL</Text>
          <Text style={[styles.name, { color: theme.text }]}>{incoming.initiator_name}</Text>
          <Text style={[styles.detail, { color: theme.textMuted }]}>NexusHub collaboration call</Text>
          <View style={styles.actions}>
            <CallAction color="#dc2626" icon={<PhoneOff color="#ffffff" size={25} />} label="Decline" onPress={() => void decline()} />
            <CallAction color="#16a34a" icon={incoming.call_type === 'video' ? <Video color="#ffffff" size={25} /> : <Phone color="#ffffff" size={25} />} label="Answer" onPress={answer} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function IncomingRingtone({ callType }: { callType: 'audio' | 'video' }) {
  const player = useAudioPlayer(callType === 'video' ? require('../../assets/sounds/nexus_video_call.wav') : require('../../assets/sounds/nexus_audio_call.wav'));
  useEffect(() => {
    player.loop = true;
    player.volume = 0.65;
    player.play();
    return () => player.pause();
  }, [player]);
  return null;
}

function CallAction({ color, icon, label, onPress }: { color: string; icon: React.ReactNode; label: string; onPress: () => void }) {
  return <View style={styles.actionWrap}><Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={[styles.action, { backgroundColor: color }]}>{icon}</Pressable><Text style={styles.actionLabel}>{label}</Text></View>;
}

function callSessionFromEvent(event: ChatEvent) {
  const value = event.call_session;
  if (!value || typeof value !== 'object' || !Number(value.id) || !value.public_id) return null;
  return value as CallSession;
}

const styles = StyleSheet.create({
  backdrop: { alignItems: 'center', backgroundColor: 'rgba(4, 7, 13, 0.78)', flex: 1, justifyContent: 'center', padding: 22 },
  card: { alignItems: 'center', borderRadius: 18, borderWidth: 1, maxWidth: 420, paddingHorizontal: 24, paddingVertical: 30, width: '100%' },
  avatar: { alignItems: 'center', borderRadius: 40, height: 80, justifyContent: 'center', marginBottom: 18, width: 80 },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  name: { fontSize: 24, fontWeight: '900', marginTop: 9, textAlign: 'center' },
  detail: { fontSize: 12, marginTop: 6 },
  actions: { flexDirection: 'row', gap: 48, marginTop: 30 },
  actionWrap: { alignItems: 'center', width: 72 },
  action: { alignItems: 'center', borderRadius: 31, height: 62, justifyContent: 'center', width: 62 },
  actionLabel: { color: '#ffffff', fontSize: 11, fontWeight: '800', marginTop: 8 },
});
