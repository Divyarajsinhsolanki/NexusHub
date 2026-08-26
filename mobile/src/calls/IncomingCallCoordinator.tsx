import { useRouter } from 'expo-router';
import { useAudioPlayer } from 'expo-audio';
import { useQueryClient } from '@tanstack/react-query';
import { Phone, PhoneOff, Video } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { apiErrorMessage } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { CallSession } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { mobileQueryKeys, updateConversationCaches } from '../cache/mobileCache';
import { requestCallMediaPermissions } from './mediaPermissions';
import { captureCallError, recordCallBreadcrumb } from '../observability/callDiagnostics';
import { setVisibleIncomingCall } from '../notifications/presentation';
import { useChatRealtime, type ChatEvent } from '../realtime/useChatRealtime';
import { useAppTheme } from '../theme';

export function IncomingCallCoordinator() {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const theme = useAppTheme();
  const [incoming, setIncoming] = useState<CallSession | null>(null);
  const [incomingError, setIncomingError] = useState('');
  const [pendingAction, setPendingAction] = useState<'answer' | 'decline' | null>(null);
  const actionRef = useRef<number | null>(null);
  const ringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settledCallIds = useRef(new Set<number>());

  const clearRingTimer = useCallback(() => {
    if (ringTimerRef.current) clearTimeout(ringTimerRef.current);
    ringTimerRef.current = null;
  }, []);

  const onEvent = useCallback((event: ChatEvent) => {
    const call = callSessionFromEvent(event);
    if (!call || call.initiator_id === user?.id) return;
    if (event.type === 'call_ringing' && AppState.currentState === 'active') {
      if (settledCallIds.current.has(call.id) || !shouldRingForUser(call, user?.id)) return;
      setIncomingError('');
      setIncoming(call);
      clearRingTimer();
      ringTimerRef.current = setTimeout(() => {
        settledCallIds.current.add(call.id);
        setIncoming((current) => current?.id === call.id ? null : current);
        void endpoints.callAction(call.id, 'decline').catch((error) => captureCallError(error, 'incoming', { call_id: call.id, timeout: true }));
      }, 30_000);
      recordCallBreadcrumb('incoming', { call_id: call.id, call_type: call.call_type });
      void endpoints.callAction(call.id, 'ack_ring').catch((error) => captureCallError(error, 'incoming', { call_id: call.id, acknowledge: true }));
      return;
    }
    if (!CALL_STATE_EVENTS.has(String(event.type)) || incoming?.id !== call.id) return;

    const stillRingingForThisUser = shouldRingForUser(call, user?.id);
    if (!stillRingingForThisUser) {
      settledCallIds.current.add(call.id);
      clearRingTimer();
      setIncoming(null);
      setIncomingError('');
      setPendingAction(null);
      actionRef.current = null;
    }
  }, [clearRingTimer, incoming?.id, user?.id]);

  useChatRealtime(undefined, onEvent);

  useEffect(() => {
    return clearRingTimer;
  }, [clearRingTimer]);

  useEffect(() => {
    if (!incoming) clearRingTimer();
  }, [clearRingTimer, incoming]);

  useEffect(() => {
    setVisibleIncomingCall(incoming?.id || null);
    return () => setVisibleIncomingCall(null);
  }, [incoming?.id]);

  if (!incoming || !user) return null;

  const answer = async () => {
    if (actionRef.current === incoming.id) return;
    actionRef.current = incoming.id;
    const call = incoming;
    setPendingAction('answer');
    setIncomingError('');
    try {
      const permission = await requestCallMediaPermissions(call.call_type === 'video');
      if (!permission.microphone || (call.call_type === 'video' && !permission.camera)) {
        setIncomingError(call.call_type === 'video' ? 'Allow microphone and camera access to answer this video call.' : 'Allow microphone access to answer this voice call.');
        return;
      }

      const credentials = await endpoints.joinCall(call.id);
      queryClient.setQueryData(['call', call.id], credentials);
      updateConversationCaches(queryClient, call.conversation_id, (conversation) => ({ ...conversation, active_call: credentials.call_session }));
      settledCallIds.current.add(call.id);
      clearRingTimer();
      setIncoming(null);
      recordCallBreadcrumb('incoming', { call_id: call.id, answered: true });
      router.push(`/call/${call.id}?type=${call.call_type}&ready=1` as never);
    } catch (error) {
      captureCallError(error, 'incoming', { call_id: call.id, answer: true });
      setIncomingError(apiErrorMessage(error));
      void queryClient.invalidateQueries({ queryKey: mobileQueryKeys.conversation(call.conversation_id) });
    } finally {
      setPendingAction(null);
      actionRef.current = null;
    }
  };
  const decline = async () => {
    if (actionRef.current === incoming.id) return;
    actionRef.current = incoming.id;
    const call = incoming;
    setPendingAction('decline');
    setIncomingError('');
    try {
      await endpoints.callAction(call.id, 'decline');
      recordCallBreadcrumb('incoming', { call_id: call.id, declined: true });
      settledCallIds.current.add(call.id);
      setIncoming(null);
      clearRingTimer();
    } catch (error) {
      captureCallError(error, 'incoming', { call_id: call.id, decline: true });
      setIncomingError(apiErrorMessage(error));
    } finally {
      setPendingAction(null);
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
          {incomingError ? <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>{incomingError}</Text> : null}
          <View style={styles.actions}>
            <CallAction color="#dc2626" disabled={Boolean(pendingAction)} icon={<PhoneOff color="#ffffff" size={25} />} label={pendingAction === 'decline' ? 'Declining…' : 'Decline'} onPress={() => void decline()} />
            <CallAction color="#16a34a" disabled={Boolean(pendingAction)} icon={incoming.call_type === 'video' ? <Video color="#ffffff" size={25} /> : <Phone color="#ffffff" size={25} />} label={pendingAction === 'answer' ? 'Joining…' : 'Answer'} onPress={() => void answer()} />
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

function CallAction({ color, disabled, icon, label, onPress }: { color: string; disabled?: boolean; icon: React.ReactNode; label: string; onPress: () => void }) {
  return <View style={styles.actionWrap}><Pressable accessibilityLabel={label} accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.action, { backgroundColor: color, opacity: disabled ? 0.65 : 1 }]}>{icon}</Pressable><Text style={styles.actionLabel}>{label}</Text></View>;
}

function callSessionFromEvent(event: ChatEvent) {
  const value = event.call_session;
  if (!value || typeof value !== 'object' || !Number(value.id) || !value.public_id) return null;
  return value as CallSession;
}

const CALL_STATE_EVENTS = new Set(['call_started', 'call_participants_invited', 'call_participant_joined', 'call_participant_left', 'call_missed', 'call_ended']);

function currentParticipantStatus(call: CallSession, userId?: number) {
  return call.current_participant?.status || call.participants?.find((participant) => Number(participant.user_id) === Number(userId))?.status || null;
}

function isLiveCall(call: CallSession) {
  return call.status === 'ringing' || call.status === 'active';
}

export function shouldRingForUser(call: CallSession, userId?: number) {
  return isLiveCall(call) && Number(call.initiator_id) !== Number(userId) && currentParticipantStatus(call, userId) === 'ringing';
}

const styles = StyleSheet.create({
  backdrop: { alignItems: 'center', backgroundColor: 'rgba(4, 7, 13, 0.78)', flex: 1, justifyContent: 'center', padding: 22 },
  card: { alignItems: 'center', borderRadius: 18, borderWidth: 1, maxWidth: 420, paddingHorizontal: 24, paddingVertical: 30, width: '100%' },
  avatar: { alignItems: 'center', borderRadius: 40, height: 80, justifyContent: 'center', marginBottom: 18, width: 80 },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  name: { fontSize: 24, fontWeight: '900', marginTop: 9, textAlign: 'center' },
  detail: { fontSize: 12, marginTop: 6 },
  error: { fontSize: 12, lineHeight: 17, marginTop: 14, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 48, marginTop: 30 },
  actionWrap: { alignItems: 'center', width: 72 },
  action: { alignItems: 'center', borderRadius: 31, height: 62, justifyContent: 'center', width: 62 },
  actionLabel: { color: '#ffffff', fontSize: 11, fontWeight: '800', marginTop: 8 },
});
