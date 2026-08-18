import {
  AudioSession,
  isTrackReference,
  LiveKitRoom,
  useConnectionState,
  useLocalParticipant,
  useParticipants,
  useTracks,
  VideoTrack,
  type TrackReferenceOrPlaceholder,
} from '@livekit/react-native';
import { Camera, CameraOff, Mic, MicOff, PhoneOff, RefreshCw, Share2, ShieldCheck, Users, Volume2, X } from 'lucide-react-native';
import { ConnectionState, Track } from 'livekit-client';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { LiveKitCredentials } from '../../api/types';
import { captureCallError, recordCallBreadcrumb } from '../../observability/callDiagnostics';
import { useAppTheme } from '../../theme';

type Props = {
  credentials: LiveKitCredentials;
  initialAudio?: boolean;
  initialVideo?: boolean;
  onEnd: () => void | Promise<void>;
  onLeave: () => void | Promise<void>;
};

export function MobileCallRoom({ credentials, initialAudio = true, initialVideo = true, onEnd, onLeave }: Props) {
  const [connectionIssue, setConnectionIssue] = useState<string | null>(null);
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDisconnectTimer = useCallback(() => {
    if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
    disconnectTimerRef.current = null;
  }, []);

  useEffect(() => clearDisconnectTimer, [clearDisconnectTimer]);

  useEffect(() => {
    void AudioSession.startAudioSession();
    return () => { void AudioSession.stopAudioSession(); };
  }, []);

  return (
    <LiveKitRoom
      audio={initialAudio}
      connect
      onConnected={() => {
        clearDisconnectTimer();
        setConnectionIssue(null);
        recordCallBreadcrumb('connect', { call_id: credentials.call_session.id, connected: true });
      }}
      onDisconnected={() => {
        setConnectionIssue('Connection interrupted. Reconnecting media…');
        recordCallBreadcrumb('reconnect', { call_id: credentials.call_session.id });
        clearDisconnectTimer();
        disconnectTimerRef.current = setTimeout(() => {
          recordCallBreadcrumb('leave', { call_id: credentials.call_session.id, connection_lost: true });
          void onLeave();
        }, 20_000);
      }}
      onError={(error) => {
        clearDisconnectTimer();
        setConnectionIssue('Unable to connect media. Check the network and LiveKit host.');
        captureCallError(error, 'connect', { call_id: credentials.call_session.id });
      }}
      options={{ adaptiveStream: true, dynacast: true }}
      serverUrl={credentials.server_url}
      token={credentials.participant_token}
      video={credentials.call_session.call_type === 'video' && initialVideo}
    >
      <RoomView connectionIssue={connectionIssue} credentials={credentials} onEnd={onEnd} onLeave={onLeave} />
    </LiveKitRoom>
  );
}

function RoomView({ connectionIssue, credentials, onEnd, onLeave }: Omit<Props, 'initialAudio' | 'initialVideo'> & { connectionIssue: string | null }) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tracks = useTracks([Track.Source.Camera]);
  const participants = useParticipants();
  const connectionState = useConnectionState();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const call = credentials.call_session;
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [audioOutput, setAudioOutput] = useState('default');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const videoColumns = tracks.length > 1 && width >= 520 ? 2 : 1;
  const activeNames = useMemo(() => call.participants.filter((participant) => participant.status === 'joined').map((participant) => participant.name), [call.participants]);

  const share = useCallback(async () => {
    await Share.share({ message: `Join my Nexus Hub call: ${call.share_url}`, url: call.share_url, title: 'Join call' });
  }, [call.share_url]);

  const end = useCallback(() => Alert.alert('End for everyone?', 'This meeting link will stop working for every participant.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'End call', style: 'destructive', onPress: () => { void onEnd(); } },
  ]), [onEnd]);

  const cycleAudioOutput = useCallback(async () => {
    try {
      const outputs = await AudioSession.getAudioOutputs();
      if (!outputs.length) return;
      const index = outputs.indexOf(audioOutput);
      const next = outputs[(index + 1) % outputs.length];
      await AudioSession.selectAudioOutput(next);
      setAudioOutput(next);
    } catch (error) {
      captureCallError(error, 'connect', { call_id: call.id, audio_route: true });
      Alert.alert('Audio output unavailable', 'Reconnect a Bluetooth or wired device, then try again.');
    }
  }, [audioOutput, call.id]);

  const switchCamera = useCallback(async () => {
    const next = facingMode === 'user' ? 'environment' : 'user';
    try {
      const track = localParticipant.getTrackPublication(Track.Source.Camera)?.track;
      if (!track) return;
      await track.restartTrack({ facingMode: next });
      setFacingMode(next);
    } catch (error) {
      captureCallError(error, 'connect', { call_id: call.id, camera_switch: true });
    }
  }, [call.id, facingMode, localParticipant]);

  return (
    <View style={[styles.room, { paddingBottom: Math.max(12, insets.bottom), paddingTop: Math.max(12, insets.top) }]}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text numberOfLines={1} style={styles.callTitle}>{call.call_type === 'video' ? 'Video meeting' : 'Voice meeting'}</Text>
          <Text style={styles.callStatus}>{connectionLabel(connectionState)} · {participants.length || activeNames.length || 1} participants · <CallDuration createdAt={call.created_at} startedAt={call.started_at} /></Text>
        </View>
        <Pressable accessibilityLabel="Open participant list" accessibilityRole="button" onPress={() => setParticipantsOpen(true)} style={styles.headerButton}><Users color="#ffffff" size={20} /></Pressable>
        <Pressable accessibilityLabel="Share meeting link" accessibilityRole="button" onPress={() => void share()} style={styles.headerButton}><Share2 color="#ffffff" size={20} /></Pressable>
      </View>

      <View style={styles.secureRow}><ShieldCheck color="#86efac" size={14} /><Text style={styles.secureText}>Encrypted media · Link holders receive no chat access</Text></View>
      {connectionIssue || connectionState === ConnectionState.Reconnecting ? <View accessibilityRole="alert" style={styles.reconnecting}><RefreshCw color="#fde68a" size={15} /><Text style={styles.reconnectingText}>{connectionIssue || 'Reconnecting media…'}</Text></View> : null}

      <View style={styles.stage}>
        {call.call_type === 'video' && tracks.some(isTrackReference)
          ? <FlatList contentContainerStyle={styles.videoList} data={tracks} key={videoColumns} keyExtractor={(item, index) => `${item.participant.identity}-${index}`} numColumns={videoColumns} removeClippedSubviews renderItem={({ item }: { item: TrackReferenceOrPlaceholder }) => isTrackReference(item) ? <View style={styles.videoTile}><VideoTrack objectFit="cover" style={styles.video} trackRef={item} /><Text numberOfLines={1} style={styles.tileName}>{item.participant.name || item.participant.identity}</Text></View> : <View style={styles.videoTile} />} />
          : <View style={styles.audioState}><View style={styles.audioAvatars}>{participants.map((participant) => { const name = participant.name || participant.identity || 'Participant'; return <View key={participant.identity} style={styles.audioPerson}><View style={[styles.audioAvatar, { backgroundColor: theme.primary }]}><Text style={styles.audioInitials}>{initials(name)}</Text></View><Text numberOfLines={1} style={styles.audioPersonName}>{name}{participant.isLocal ? ' (You)' : ''}</Text></View>; })}</View><Text style={styles.audioTitle}>Voice call in progress</Text><Text style={styles.audioSubtitle}>{activeNames.length ? activeNames.join(', ') : 'Waiting for others to join'}</Text></View>}
      </View>

      <View style={styles.controls}>
        <Control label={isMicrophoneEnabled ? 'Mute' : 'Unmute'} onPress={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}>{isMicrophoneEnabled ? <Mic color="#ffffff" size={22} /> : <MicOff color="#ffffff" size={22} />}</Control>
        {call.call_type === 'video' ? <Control label={isCameraEnabled ? 'Camera off' : 'Camera on'} onPress={() => localParticipant.setCameraEnabled(!isCameraEnabled)}>{isCameraEnabled ? <Camera color="#ffffff" size={22} /> : <CameraOff color="#ffffff" size={22} />}</Control> : null}
        {call.call_type === 'video' && isCameraEnabled ? <Control label="Flip camera" onPress={switchCamera}><RefreshCw color="#ffffff" size={22} /></Control> : null}
        <Control label={audioOutput === 'default' ? 'Audio' : audioOutput} onPress={cycleAudioOutput}><Volume2 color="#ffffff" size={22} /></Control>
        <Control danger label="Leave" onPress={onLeave}><PhoneOff color="#ffffff" size={23} /></Control>
      </View>
      {call.can_end ? <Pressable accessibilityRole="button" onPress={end} style={styles.endForAll}><Text style={styles.endForAllText}>End for everyone</Text></Pressable> : null}

      <Modal animationType="none" onRequestClose={() => setParticipantsOpen(false)} presentationStyle="pageSheet" visible={participantsOpen}>
        <View style={[styles.participantsSheet, { backgroundColor: theme.background, paddingBottom: Math.max(18, insets.bottom), paddingTop: Math.max(18, insets.top) }]}><View style={styles.participantsHeader}><Text style={[styles.participantsTitle, { color: theme.text }]}>Participants ({participants.length})</Text><Pressable accessibilityLabel="Close participant list" onPress={() => setParticipantsOpen(false)} style={styles.sheetClose}><X color={theme.text} size={22} /></Pressable></View>{participants.map((participant) => { const name = participant.name || participant.identity || 'Participant'; return <View key={participant.identity} style={[styles.participantRow, { borderBottomColor: theme.border }]}><View style={[styles.participantAvatar, { backgroundColor: theme.primary }]}><Text style={styles.participantInitial}>{initials(name)}</Text></View><Text style={[styles.participantName, { color: theme.text }]}>{name}{participant.isLocal ? ' (You)' : ''}</Text></View>; })}</View>
      </Modal>
    </View>
  );
}

const CallDuration = memo(function CallDuration({ createdAt, startedAt }: { createdAt?: string | null; startedAt?: string | null }) {
  const [duration, setDuration] = useState('00:00');
  useEffect(() => {
    const origin = new Date(startedAt || createdAt || Date.now()).getTime();
    const update = () => setDuration(formatDuration(Math.max(0, Date.now() - origin)));
    update();
    const timer = setInterval(update, 1_000);
    return () => clearInterval(timer);
  }, [createdAt, startedAt]);
  return <Text style={styles.callStatus}>{duration}</Text>;
});

const Control = memo(function Control({ label, onPress, danger, children }: { label: string; onPress: () => void | Promise<unknown>; danger?: boolean; children: React.ReactNode }) {
  return <View style={styles.controlWrap}><Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={[styles.control, { backgroundColor: danger ? '#dc2626' : '#343942' }]}>{children}</Pressable><Text numberOfLines={1} style={styles.controlLabel}>{label}</Text></View>;
});

function connectionLabel(state: ConnectionState) {
  if (state === ConnectionState.Connected) return 'Connected';
  if (state === ConnectionState.Reconnecting) return 'Reconnecting';
  if (state === ConnectionState.Disconnected) return 'Offline';
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
  room: { backgroundColor: '#101216', flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 14 },
  headerCopy: { flex: 1, marginRight: 4 },
  callTitle: { color: '#ffffff', fontSize: 18, fontWeight: '800' },
  callStatus: { color: '#aeb6c2', fontSize: 11, marginTop: 4 },
  headerButton: { alignItems: 'center', backgroundColor: '#343942', borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
  secureRow: { alignItems: 'center', flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingVertical: 9 },
  secureText: { color: '#aeb6c2', flex: 1, fontSize: 10 },
  reconnecting: { alignItems: 'center', backgroundColor: '#422006', flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 9 },
  reconnectingText: { color: '#fde68a', flex: 1, fontSize: 11, fontWeight: '700' },
  stage: { flex: 1, minHeight: 180 },
  videoList: { flexGrow: 1, padding: 4 },
  videoTile: { borderRadius: 10, flex: 1, margin: 4, minHeight: 190, overflow: 'hidden' },
  video: { flex: 1 },
  tileName: { backgroundColor: 'rgba(0,0,0,0.65)', bottom: 8, color: '#ffffff', fontSize: 11, left: 8, maxWidth: '80%', paddingHorizontal: 7, paddingVertical: 4, position: 'absolute' },
  audioState: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  audioAvatars: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, justifyContent: 'center' },
  audioPerson: { alignItems: 'center', width: 86 },
  audioPersonName: { color: '#d4d8df', fontSize: 10, marginTop: 7, maxWidth: 86 },
  audioAvatar: { alignItems: 'center', borderRadius: 34, height: 68, justifyContent: 'center', width: 68 },
  audioInitials: { color: '#ffffff', fontSize: 20, fontWeight: '800' },
  audioTitle: { color: '#ffffff', fontSize: 20, fontWeight: '800', marginTop: 20 },
  audioSubtitle: { color: '#aeb6c2', fontSize: 12, lineHeight: 18, marginTop: 7, textAlign: 'center' },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, justifyContent: 'center', paddingHorizontal: 8, paddingTop: 12 },
  controlWrap: { alignItems: 'center', width: 66 },
  control: { alignItems: 'center', borderRadius: 26, height: 52, justifyContent: 'center', width: 52 },
  controlLabel: { color: '#d4d8df', fontSize: 9, marginTop: 5, maxWidth: 66, textAlign: 'center' },
  endForAll: { alignSelf: 'center', minHeight: 40, paddingHorizontal: 18, paddingVertical: 10 },
  endForAllText: { color: '#fca5a5', fontSize: 12, fontWeight: '800' },
  participantsSheet: { flex: 1, paddingHorizontal: 18 },
  participantsHeader: { alignItems: 'center', flexDirection: 'row', marginBottom: 16 },
  participantsTitle: { flex: 1, fontSize: 20, fontWeight: '900' },
  sheetClose: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  participantRow: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 12, minHeight: 64 },
  participantAvatar: { alignItems: 'center', borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
  participantInitial: { color: '#ffffff', fontWeight: '800' },
  participantName: { flex: 1, fontSize: 14, fontWeight: '700' },
});
