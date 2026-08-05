import { AudioSession, isTrackReference, LiveKitRoom, useConnectionState, useLocalParticipant, useParticipants, useTracks, VideoTrack, type TrackReferenceOrPlaceholder } from '@livekit/react-native';
import { Camera, CameraOff, Mic, MicOff, PhoneOff, Share2, ShieldCheck } from 'lucide-react-native';
import { ConnectionState, Track } from 'livekit-client';
import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import type { LiveKitCredentials } from '../../api/types';
import { useAppTheme } from '../../theme';

type Props = {
  credentials: LiveKitCredentials;
  initialAudio?: boolean;
  initialVideo?: boolean;
  onEnd: () => void | Promise<void>;
  onLeave: () => void | Promise<void>;
};

export function MobileCallRoom({ credentials, initialAudio = true, initialVideo = true, onEnd, onLeave }: Props) {
  useEffect(() => {
    void AudioSession.startAudioSession();
    return () => { void AudioSession.stopAudioSession(); };
  }, []);

  return <LiveKitRoom
    audio={initialAudio}
    connect
    onDisconnected={onLeave}
    serverUrl={credentials.server_url}
    token={credentials.participant_token}
    video={credentials.call_session.call_type === 'video' && initialVideo}
  >
    <RoomView credentials={credentials} onEnd={onEnd} onLeave={onLeave} />
  </LiveKitRoom>;
}

function RoomView({ credentials, onEnd, onLeave }: Omit<Props, 'initialAudio' | 'initialVideo'>) {
  const theme = useAppTheme();
  const { width } = useWindowDimensions();
  const tracks = useTracks([Track.Source.Camera]);
  const participants = useParticipants();
  const connectionState = useConnectionState();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const call = credentials.call_session;
  const [duration, setDuration] = useState('00:00');
  const videoColumns = tracks.length > 1 && width >= 520 ? 2 : 1;

  useEffect(() => {
    const startedAt = new Date(call.started_at || call.created_at || Date.now()).getTime();
    const update = () => setDuration(formatDuration(Math.max(0, Date.now() - startedAt)));
    update();
    const timer = setInterval(update, 1_000);
    return () => clearInterval(timer);
  }, [call.created_at, call.started_at]);

  const share = async () => {
    await Share.share({ message: `Join my Nexus Hub call: ${call.share_url}`, url: call.share_url, title: 'Join call' });
  };
  const end = () => Alert.alert('End for everyone?', 'This meeting link will stop working for every participant.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'End call', style: 'destructive', onPress: () => { void onEnd(); } },
  ]);
  const activeNames = useMemo(() => call.participants.filter((participant) => participant.status === 'joined').map((participant) => participant.name), [call.participants]);

  return <View style={styles.room}>
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <Text numberOfLines={1} style={styles.callTitle}>{call.call_type === 'video' ? 'Video meeting' : 'Voice meeting'}</Text>
        <Text style={styles.callStatus}>{connectionLabel(connectionState)} · {participants.length || activeNames.length || 1} participants · {duration}</Text>
      </View>
      <Pressable accessibilityLabel="Share or copy meeting link" accessibilityRole="button" onPress={share} style={styles.headerButton}><Share2 color="#ffffff" size={20} /></Pressable>
    </View>
    <View style={styles.secureRow}><ShieldCheck color="#86efac" size={14} /><Text style={styles.secureText}>Encrypted media · Link holders receive no chat access</Text></View>
    <View style={styles.stage}>
      {call.call_type === 'video' && tracks.some(isTrackReference)
        ? <FlatList contentContainerStyle={styles.videoList} data={tracks} key={videoColumns} keyExtractor={(item, index) => `${item.participant.identity}-${index}`} numColumns={videoColumns} renderItem={({ item }: { item: TrackReferenceOrPlaceholder }) => isTrackReference(item) ? <View style={styles.videoTile}><VideoTrack objectFit="cover" style={styles.video} trackRef={item} /><Text numberOfLines={1} style={styles.tileName}>{item.participant.name || item.participant.identity}</Text></View> : <View style={styles.videoTile} />} />
        : <View style={styles.audioState}><View style={styles.audioAvatars}>{participants.map((participant) => { const name = participant.name || participant.identity || 'Participant'; return <View key={participant.identity} style={styles.audioPerson}><View style={[styles.audioAvatar, { backgroundColor: theme.primary }]}><Text style={styles.audioInitials}>{initials(name)}</Text></View><Text numberOfLines={1} style={styles.audioPersonName}>{name}{participant.isLocal ? ' (You)' : ''}</Text></View>; })}</View><Text style={styles.audioTitle}>Voice call in progress</Text><Text style={styles.audioSubtitle}>{activeNames.length ? activeNames.join(', ') : 'Waiting for others to join'}</Text></View>}
    </View>
    <View style={styles.controls}>
      <Control label={isMicrophoneEnabled ? 'Mute' : 'Unmute'} onPress={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}>{isMicrophoneEnabled ? <Mic color="#ffffff" size={22} /> : <MicOff color="#ffffff" size={22} />}</Control>
      {call.call_type === 'video' ? <Control label={isCameraEnabled ? 'Camera off' : 'Camera on'} onPress={() => localParticipant.setCameraEnabled(!isCameraEnabled)}>{isCameraEnabled ? <Camera color="#ffffff" size={22} /> : <CameraOff color="#ffffff" size={22} />}</Control> : null}
      <Control danger label="Leave" onPress={onLeave}><PhoneOff color="#ffffff" size={23} /></Control>
    </View>
    {call.can_end ? <Pressable accessibilityRole="button" onPress={end} style={styles.endForAll}><Text style={styles.endForAllText}>End for everyone</Text></Pressable> : null}
  </View>;
}

function Control({ label, onPress, danger, children }: { label: string; onPress: () => void | Promise<unknown>; danger?: boolean; children: React.ReactNode }) {
  return <View style={styles.controlWrap}><Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={[styles.control, { backgroundColor: danger ? '#dc2626' : '#343942' }]}>{children}</Pressable><Text style={styles.controlLabel}>{label}</Text></View>;
}

function connectionLabel(state: ConnectionState) {
  if (state === ConnectionState.Connected) return 'Connected';
  if (state === ConnectionState.Reconnecting) return 'Reconnecting';
  return 'Connecting';
}

function formatDuration(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1_000);
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  return [hours, minutes, remainder].filter((_, index) => hours > 0 || index > 0).map((value) => String(value).padStart(2, '0')).join(':');
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'NH';
}

const styles = StyleSheet.create({
  room: { backgroundColor: '#101216', flex: 1, paddingBottom: 28, paddingTop: 48 },
  header: { alignItems: 'center', flexDirection: 'row', paddingHorizontal: 18 },
  headerCopy: { flex: 1, marginRight: 12 },
  callTitle: { color: '#ffffff', fontSize: 18, fontWeight: '800' },
  callStatus: { color: '#aeb6c2', fontSize: 11, marginTop: 4 },
  headerButton: { alignItems: 'center', backgroundColor: '#343942', borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
  secureRow: { alignItems: 'center', flexDirection: 'row', gap: 6, paddingHorizontal: 18, paddingVertical: 10 },
  secureText: { color: '#aeb6c2', fontSize: 10 },
  stage: { flex: 1 },
  videoList: { flexGrow: 1, padding: 4 },
  videoTile: { borderRadius: 12, flex: 1, margin: 4, minHeight: 220, overflow: 'hidden' },
  video: { flex: 1 },
  tileName: { backgroundColor: 'rgba(0,0,0,0.58)', bottom: 8, color: '#ffffff', fontSize: 11, left: 8, maxWidth: '80%', paddingHorizontal: 7, paddingVertical: 4, position: 'absolute' },
  audioState: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 32 },
  audioAvatars: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'center' },
  audioPerson: { alignItems: 'center', width: 92 },
  audioPersonName: { color: '#d4d8df', fontSize: 10, marginTop: 7, maxWidth: 92 },
  audioAvatar: { alignItems: 'center', borderRadius: 38, height: 76, justifyContent: 'center', width: 76 },
  audioInitials: { color: '#ffffff', fontSize: 22, fontWeight: '800' },
  audioTitle: { color: '#ffffff', fontSize: 21, fontWeight: '800', marginTop: 22 },
  audioSubtitle: { color: '#aeb6c2', fontSize: 12, lineHeight: 18, marginTop: 7, textAlign: 'center' },
  controls: { flexDirection: 'row', gap: 18, justifyContent: 'center', paddingTop: 18 },
  controlWrap: { alignItems: 'center', width: 72 },
  control: { alignItems: 'center', borderRadius: 29, height: 58, justifyContent: 'center', width: 58 },
  controlLabel: { color: '#d4d8df', fontSize: 10, marginTop: 7, textAlign: 'center' },
  endForAll: { alignSelf: 'center', marginTop: 16, minHeight: 40, paddingHorizontal: 18, paddingVertical: 10 },
  endForAllText: { color: '#fca5a5', fontSize: 12, fontWeight: '800' },
});
