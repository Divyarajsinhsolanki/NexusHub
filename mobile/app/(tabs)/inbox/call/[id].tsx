import { useQuery } from '@tanstack/react-query';
import { AudioSession, isTrackReference, LiveKitRoom, useLocalParticipant, useTracks, VideoTrack, type TrackReferenceOrPlaceholder } from '@livekit/react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Camera, CameraOff, Mic, MicOff, PhoneOff } from 'lucide-react-native';
import { Track } from 'livekit-client';
import { useEffect } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { apiErrorMessage } from '@/src/api/client';
import { endpoints } from '@/src/api/endpoints';
import { LoadingState } from '@/src/components/StateView';
import { useAppTheme } from '@/src/theme';

export default function CallScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const callId = Number(id);
  const router = useRouter();
  const credentials = useQuery({ queryKey: ['call', callId], queryFn: () => endpoints.joinCall(callId), enabled: Number.isFinite(callId), retry: false });

  useEffect(() => {
    void AudioSession.startAudioSession();
    return () => { void AudioSession.stopAudioSession(); };
  }, []);

  const leave = async () => {
    try { await endpoints.callAction(callId, 'leave'); } catch { /* Room disconnect still closes local media. */ }
    router.back();
  };

  if (credentials.isLoading) return <View style={styles.loading}><LoadingState label="Joining secure call" /></View>;
  if (credentials.isError || !credentials.data) {
    Alert.alert('Unable to join call', apiErrorMessage(credentials.error), [{ text: 'Close', onPress: () => router.back() }]);
    return <View style={styles.loading} />;
  }

  return <LiveKitRoom audio video={credentials.data.call_session.call_type === 'video'} connect onDisconnected={() => router.back()} serverUrl={credentials.data.server_url} token={credentials.data.participant_token}><RoomView callType={credentials.data.call_session.call_type} onLeave={leave} /></LiveKitRoom>;
}

function RoomView({ callType, onLeave }: { callType: 'audio' | 'video'; onLeave: () => void }) {
  const theme = useAppTheme();
  const tracks = useTracks([Track.Source.Camera]);
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  return <View style={[styles.room, { backgroundColor: '#101216' }]}>
    <View style={styles.stage}>
      {callType === 'video' && tracks.length ? <FlatList contentContainerStyle={styles.videoList} data={tracks} keyExtractor={(item, index) => `${item.participant.identity}-${index}`} numColumns={tracks.length > 1 ? 2 : 1} renderItem={({ item }: { item: TrackReferenceOrPlaceholder }) => isTrackReference(item) ? <VideoTrack objectFit="cover" style={styles.video} trackRef={item} /> : <View style={styles.video} />} /> : <View style={styles.audioState}><View style={[styles.audioAvatar, { backgroundColor: theme.primary }]}><Text style={styles.audioInitials}>NH</Text></View><Text style={styles.callTitle}>Nexus Hub call</Text><Text style={styles.callStatus}>Connected with encrypted media</Text></View>}
    </View>
    <View style={styles.controls}>
      <Control label={isMicrophoneEnabled ? 'Mute' : 'Unmute'} onPress={async () => { await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled); }}>{isMicrophoneEnabled ? <Mic color="#ffffff" size={22} /> : <MicOff color="#ffffff" size={22} />}</Control>
      {callType === 'video' ? <Control label={isCameraEnabled ? 'Turn camera off' : 'Turn camera on'} onPress={async () => { await localParticipant.setCameraEnabled(!isCameraEnabled); }}>{isCameraEnabled ? <Camera color="#ffffff" size={22} /> : <CameraOff color="#ffffff" size={22} />}</Control> : null}
      <Control danger label="Leave call" onPress={onLeave}><PhoneOff color="#ffffff" size={23} /></Control>
    </View>
  </View>;
}

function Control({ label, onPress, danger, children }: { label: string; onPress: () => void | Promise<void>; danger?: boolean; children: React.ReactNode }) {
  return <View style={styles.controlWrap}><Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={[styles.control, { backgroundColor: danger ? '#dc2626' : '#343942' }]}>{children}</Pressable><Text style={styles.controlLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  loading: { backgroundColor: '#101216', flex: 1, justifyContent: 'center' },
  room: { flex: 1, paddingBottom: 32, paddingTop: 54 },
  stage: { flex: 1 },
  videoList: { flexGrow: 1 },
  video: { borderRadius: 8, flex: 1, margin: 4, minHeight: 260, overflow: 'hidden' },
  audioState: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  audioAvatar: { alignItems: 'center', borderRadius: 52, height: 104, justifyContent: 'center', width: 104 },
  audioInitials: { color: '#ffffff', fontSize: 30, fontWeight: '800' },
  callTitle: { color: '#ffffff', fontSize: 21, fontWeight: '800', marginTop: 22 },
  callStatus: { color: '#aeb6c2', fontSize: 13, marginTop: 6 },
  controls: { flexDirection: 'row', justifyContent: 'center', gap: 22, paddingTop: 22 },
  controlWrap: { alignItems: 'center', width: 76 },
  control: { alignItems: 'center', borderRadius: 29, height: 58, justifyContent: 'center', width: 58 },
  controlLabel: { color: '#d4d8df', fontSize: 10, marginTop: 7, textAlign: 'center' },
});
