import { useEvent } from 'expo';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useFocusEffect } from 'expo-router';
import { FileText, Play, RefreshCw, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { attachmentMedia } from '../../chat/attachmentMedia';
import { useAppTheme } from '../../theme';

export function ChatAttachment({ file, mine }: { file: Record<string, unknown>; mine: boolean }) {
  const theme = useAppTheme();
  const { filename, url, kind } = attachmentMedia(file);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [play, setPlay] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { setFailed(false); setPlay(false); setExpanded(false); setLoading(true); }, [url]);
  const open = () => { if (url) void Linking.openURL(url).catch(() => Alert.alert('Unable to open attachment', 'Please try again.')); };
  const retry = () => { setFailed(false); setLoading(true); setAttempt((value) => value + 1); };
  const color = mine ? '#ffffff' : theme.text;
  return <View style={styles.attachment}>
    {url && kind === 'image' && !failed ? <>
      <Pressable accessibilityLabel={`View ${filename}`} accessibilityRole="button" onPress={() => setExpanded(true)} style={styles.media}>
        <Image key={`${url}:${attempt}`} accessibilityLabel={filename} cachePolicy={attempt ? 'none' : 'disk'} contentFit="contain" onError={() => { setFailed(true); setLoading(false); }} onLoad={() => setLoading(false)} source={{ uri: url }} style={styles.media} />
        {loading ? <ActivityIndicator accessibilityLabel="Loading image" style={StyleSheet.absoluteFill} color={theme.primary} /> : null}
      </Pressable>
      <Modal animationType="fade" onRequestClose={() => setExpanded(false)} visible={expanded}>
        <SafeAreaView style={styles.viewer}><View style={styles.viewerHeader}><Text numberOfLines={1} style={styles.viewerTitle}>{filename}</Text><Pressable accessibilityLabel="Close image" accessibilityRole="button" onPress={() => setExpanded(false)} style={styles.icon}><X color="#ffffff" size={24} /></Pressable></View><Image accessibilityLabel={`Full image ${filename}`} contentFit="contain" onError={() => { setExpanded(false); setFailed(true); }} source={{ uri: url }} style={styles.fullImage} /></SafeAreaView>
      </Modal>
    </> : url && kind === 'video' && !failed ? play
      ? <InlineVideo key={`${url}:${attempt}`} url={url} onError={() => { setFailed(true); setPlay(false); }} />
      : <Pressable accessibilityLabel={`Play ${filename}`} accessibilityRole="button" onPress={() => setPlay(true)} style={[styles.media, styles.play]}><Play color="#ffffff" size={38} /><Text style={styles.viewerTitle}>Video</Text></Pressable>
      : <Pressable accessibilityLabel={url ? `Open ${filename}` : `${filename} is unavailable`} accessibilityRole="button" disabled={!url} onPress={open} style={[styles.file, { backgroundColor: mine ? 'rgba(255,255,255,0.12)' : theme.surfaceMuted }]}><FileText color={color} size={22} /><Text numberOfLines={2} style={{ color, flex: 1 }}>{filename}</Text></Pressable>}
    {failed ? <View style={styles.actions}><Text style={{ color, flex: 1 }}>Preview unavailable</Text><Pressable accessibilityLabel={`Retry ${filename}`} accessibilityRole="button" onPress={retry} style={styles.icon}><RefreshCw color={color} size={20} /></Pressable><Pressable accessibilityLabel={`Open original ${filename}`} accessibilityRole="button" onPress={open} style={styles.icon}><FileText color={color} size={20} /></Pressable></View> : kind !== 'file' ? <Text numberOfLines={1} style={{ color, fontSize: 11 }}>{filename}</Text> : null}
  </View>;
}

function InlineVideo({ url, onError }: { url: string; onError: () => void }) {
  const player = useVideoPlayer(url, (player) => { player.loop = false; player.play(); });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  useEffect(() => { if (status === 'error') onError(); }, [status, onError]);
  const pause = useCallback(() => { try { player.pause(); } catch { /* The native player may already have been released. */ } }, [player]);
  useFocusEffect(useCallback(() => () => pause(), [pause]));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => { if (state !== 'active') pause(); });
    return () => subscription.remove();
  }, [pause]);
  return <View style={styles.media}><VideoView accessibilityLabel="Chat video player" contentFit="contain" fullscreenOptions={{ enable: true }} nativeControls player={player} surfaceType="textureView" style={styles.media} />{status === 'loading' ? <ActivityIndicator accessibilityLabel="Loading video" color="#ffffff" style={StyleSheet.absoluteFill} /> : null}</View>;
}

const styles = StyleSheet.create({
  attachment: { gap: 6, marginTop: 6, maxWidth: '100%', width: 240 },
  media: { aspectRatio: 4 / 3, backgroundColor: '#101416', borderRadius: 6, maxWidth: '100%', overflow: 'hidden', width: '100%' },
  play: { alignItems: 'center', justifyContent: 'center', gap: 10 },
  file: { alignItems: 'center', borderRadius: 6, flexDirection: 'row', gap: 10, minHeight: 56, padding: 10 },
  actions: { alignItems: 'center', flexDirection: 'row' },
  icon: { alignItems: 'center', justifyContent: 'center', height: 44, width: 44 },
  viewer: { flex: 1, backgroundColor: '#101416' },
  viewerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  viewerTitle: { color: '#ffffff', fontSize: 14, flexShrink: 1 },
  fullImage: { flex: 1, width: '100%' },
});
