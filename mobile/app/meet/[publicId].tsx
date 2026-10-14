import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, CameraOff, Mic, MicOff, Share2, Video, Phone } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { lazy, Suspense, useCallback, useRef, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { apiErrorMessage } from '@/src/api/client';
import { endpoints } from '@/src/api/endpoints';
import type { CallSession, LiveKitCredentials } from '@/src/api/types';
import { requestCallMediaPermissions } from '@/src/calls/mediaPermissions';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { ErrorState, LoadingState } from '@/src/components/StateView';
import { useCallRealtime } from '@/src/realtime/useCallRealtime';
import { useAppTheme } from '@/src/theme';
import { validateLiveKitEnvironment } from '@/src/config/runtimeEnvironment';

const LazyMobileCallRoom = lazy(() => import('@/src/components/call/MobileCallRoom').then((module) => ({ default: module.MobileCallRoom })));

export default function MeetingScreen() {
  const { publicId } = useLocalSearchParams<{ publicId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const theme = useAppTheme();
  const [microphone, setMicrophone] = useState(true);
  const [camera, setCamera] = useState(true);
  const [waiting,setWaiting] = useState(false);
  const [credentials, setCredentials] = useState<LiveKitCredentials | null>(null);
  const endingRef = useRef(false);
  const meeting = useQuery({ queryKey: ['meeting', publicId], queryFn: () => endpoints.meeting(publicId), enabled: Boolean(publicId), refetchInterval: waiting ? 3000 : false, retry: false });
  const join = useMutation({ mutationFn: async () => {
    const result = await endpoints.joinMeeting(publicId);
    if ('admission_pending' in result) return result;
    const permission = await requestCallMediaPermissions(Boolean(meeting.data?.call_session.call_type === 'video' && camera));
    if (!permission.microphone || !permission.camera) throw new Error('Allow the required microphone and camera permissions before joining.');
    const issue = validateLiveKitEnvironment(result.server_url);
    if (issue) throw new Error(`${issue.title}. ${issue.detail}`);
    return result;
  }, onSuccess: result => {if ('admission_pending' in result) {setWaiting(true);queryClient.setQueryData(['meeting',publicId],{call_session:result.call_session});} else {setWaiting(false);setCredentials(result);}}, onError: (error) => Alert.alert('Unable to join', apiErrorMessage(error)) });
  const call = credentials?.call_session || meeting.data?.call_session;
  const close = useCallback(() => router.replace('/(tabs)/inbox' as never), [router]);

  useCallRealtime(credentials?.call_session.public_id, (event) => {
    const update = event.call_session as CallSession | undefined;
    if (update) {
      const ownId = credentials?.call_session.current_participant?.user_id;
      if (update.participants?.some(p => p.user_id === ownId && p.removed)) { setCredentials(null); close(); return; }
      setCredentials(previous => previous ? {...previous, call_session:{...previous.call_session,...update, current_participant:previous.call_session.current_participant, can_end:Number(update.host_id || update.initiator_id) === Number(ownId)}} : previous);
    }
    if (event.type === 'call_ended') {
      setCredentials(null);
      void queryClient.invalidateQueries({ queryKey: ['meeting', publicId] });
      Alert.alert('Call ended', 'The host ended this call.', [{ text: 'Close', onPress: close }]);
    }
  });

  const leave = async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    if (credentials) {
      try { await endpoints.callAction(credentials.call_session.id, 'leave'); } catch { /* Closing the room still releases media. */ }
    }
    close();
  };
  const end = async () => {
    if (!credentials || endingRef.current) return;
    endingRef.current = true;
    try { await endpoints.callAction(credentials.call_session.id, 'end'); close(); } catch (error) { endingRef.current = false; Alert.alert('Unable to end call', apiErrorMessage(error)); }
  };

  if (credentials) return <Suspense fallback={<View style={styles.state}><LoadingState label="Starting secure media" /></View>}><LazyMobileCallRoom credentials={credentials} initialAudio={microphone} initialVideo={camera} onEnd={end} onLeave={leave} /></Suspense>;
  if (meeting.isLoading) return <View style={[styles.state, { backgroundColor: theme.background }]}><LoadingState label="Checking meeting link" /></View>;
  if (meeting.isError || !call) return <View style={[styles.state, { backgroundColor: theme.background }]}><ErrorState message={apiErrorMessage(meeting.error)} onRetry={() => meeting.refetch()} /></View>;

  if (waiting && !call.current_participant?.approved && !call.current_participant?.removed && ['active','ringing'].includes(call.status)) return <View style={styles.state}><Text style={{color:theme.text}}>Waiting for host approval…</Text><PrimaryButton label="Cancel join request" onPress={()=>{void endpoints.callAction(call.id,'leave').then(()=>{setWaiting(false);}).catch(error=>Alert.alert('Unable to cancel',apiErrorMessage(error)));}}/></View>;
  return <PreJoin call={call} camera={camera} joining={join.isPending || (waiting && !call.current_participant?.approved && !call.current_participant?.removed)} microphone={microphone} onCamera={() => setCamera((value) => !value)} onJoin={() => join.mutate()} onMicrophone={() => setMicrophone((value) => !value)} />;
}

export function PreJoin({ call, camera, joining, microphone, onCamera, onJoin, onMicrophone }: { call: CallSession; camera: boolean; joining: boolean; microphone: boolean; onCamera: () => void; onJoin: () => void; onMicrophone: () => void }) {
  const theme = useAppTheme();
  const live = ['ringing', 'active'].includes(call.status) && !call.current_participant?.removed;
  const share = () => Share.share({ message: `Join my Nexus Hub call: ${call.share_url}`, url: call.share_url, title: 'Join call' });
  return <View style={[styles.prejoin, { backgroundColor: theme.background }]}>
    <View style={[styles.preview, { backgroundColor: '#171a20' }]}>{call.call_type === 'video' && camera ? <Video color="#ffffff" size={54} /> : call.call_type === 'audio' ? <Phone color="#ffffff" size={54} /> : <CameraOff color="#ffffff" size={54} />}<Text style={styles.previewLabel}>{camera && call.call_type === 'video' ? 'Camera preview starts after joining' : 'Camera is off'}</Text></View>
    <Text style={[styles.title, { color: theme.text }]}>{call.call_type === 'video' ? 'Video meeting' : 'Voice meeting'}</Text>
    <Text style={[styles.host, { color: theme.textMuted }]}>Hosted by {call.host_name || call.initiator_name} · {call.participants.length} participants</Text>
    <View style={styles.prejoinControls}><Choice active={microphone} label={microphone ? 'Mic on' : 'Mic off'} onPress={onMicrophone}>{microphone ? <Mic color="#ffffff" size={22} /> : <MicOff color="#ffffff" size={22} />}</Choice>{call.call_type === 'video' ? <Choice active={camera} label={camera ? 'Camera on' : 'Camera off'} onPress={onCamera}>{camera ? <Camera color="#ffffff" size={22} /> : <CameraOff color="#ffffff" size={22} />}</Choice> : null}<Choice active label="Share link" onPress={share}><Share2 color="#ffffff" size={22} /></Choice></View>
    {live ? <PrimaryButton label="Join now" loading={joining} onPress={onJoin} /> : <Text accessibilityRole="alert" style={[styles.ended, { color: theme.danger }]}>{call.current_participant?.removed ? "The host denied or removed you from this meeting." : "This meeting has ended. The link is no longer joinable."}</Text>}
    <Text style={[styles.privacy, { color: theme.textMuted }]}>Joining this call does not grant access to its conversation, files, or workspace.</Text>
  </View>;
}

function Choice({ active, children, label, onPress }: { active: boolean; children: React.ReactNode; label: string; onPress: () => void }) {
  return <View style={styles.choiceWrap}><Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={[styles.choice, { backgroundColor: active ? '#2563eb' : '#4b5563' }]}>{children}</Pressable><Text style={styles.choiceLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  state: { flex: 1, justifyContent: 'center' },
  prejoin: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  preview: { alignItems: 'center', borderRadius: 16, height: 260, justifyContent: 'center', marginBottom: 26 },
  previewLabel: { color: '#aeb6c2', fontSize: 11, marginTop: 14 },
  title: { fontSize: 25, fontWeight: '900', textAlign: 'center' },
  host: { fontSize: 13, marginTop: 8, textAlign: 'center' },
  prejoinControls: { flexDirection: 'row', gap: 18, justifyContent: 'center', marginBottom: 28, marginTop: 25 },
  choiceWrap: { alignItems: 'center', width: 76 },
  choice: { alignItems: 'center', borderRadius: 28, height: 56, justifyContent: 'center', width: 56 },
  choiceLabel: { color: '#6b7280', fontSize: 10, marginTop: 6, textAlign: 'center' },
  ended: { fontSize: 14, fontWeight: '800', textAlign: 'center' },
  privacy: { fontSize: 11, lineHeight: 17, marginTop: 17, textAlign: 'center' },
});
