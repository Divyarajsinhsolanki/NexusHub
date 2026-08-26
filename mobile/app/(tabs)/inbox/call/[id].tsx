import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, CameraOff, Mic, MicOff, Settings, ShieldAlert } from 'lucide-react-native';
import { useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';

import { apiErrorMessage } from '@/src/api/client';
import { endpoints } from '@/src/api/endpoints';
import type { CallSession } from '@/src/api/types';
import { mobileQueryKeys, updateConversationCaches } from '@/src/cache/mobileCache';
import { openApplicationSettings, requestCallMediaPermissions } from '@/src/calls/mediaPermissions';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { ErrorState, LoadingState } from '@/src/components/StateView';
import { validateLiveKitEnvironment } from '@/src/config/runtimeEnvironment';
import { captureCallError, recordCallBreadcrumb } from '@/src/observability/callDiagnostics';
import { useCallRealtime } from '@/src/realtime/useCallRealtime';
import { useAppTheme } from '@/src/theme';

const LazyMobileCallRoom = lazy(() => import('@/src/components/call/MobileCallRoom').then((module) => ({ default: module.MobileCallRoom })));

export default function CallScreen() {
  const { id, ready, type } = useLocalSearchParams<{ id: string; ready?: string; type?: string }>();
  const callId = Number(id);
  const mediaType = type === 'video' ? 'video' : 'audio';
  const router = useRouter();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const theme = useAppTheme();
  const [permissionReady, setPermissionReady] = useState(ready === '1');
  const [microphone, setMicrophone] = useState(true);
  const [camera, setCamera] = useState(true);
  const [permissionIssue, setPermissionIssue] = useState<string | null>(null);
  const [callActionIssue, setCallActionIssue] = useState<string | null>(null);
  const [failedAction, setFailedAction] = useState<'leave' | 'end' | null>(null);
  const endingRef = useRef<'leave' | 'end' | null>(null);
  const credentials = useQuery({ queryKey: ['call', callId], queryFn: () => endpoints.joinCall(callId), enabled: permissionReady && Number.isFinite(callId), retry: false });
  const close = useCallback(() => router.replace('/(tabs)/inbox?mode=chat' as never), [router]);
  const finishLocally = useCallback((callSession?: CallSession) => {
    const conversationId = callSession?.conversation_id || credentials.data?.call_session.conversation_id;
    if (conversationId) {
      updateConversationCaches(queryClient, conversationId, (conversation) => ({ ...conversation, active_call: null }));
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: mobileQueryKeys.conversations }),
        queryClient.invalidateQueries({ queryKey: mobileQueryKeys.conversation(conversationId) }),
        queryClient.invalidateQueries({ queryKey: mobileQueryKeys.home }),
      ]);
    }
    close();
  }, [close, credentials.data?.call_session.conversation_id, queryClient]);

  useEffect(() => {
    if (pathname.startsWith('/inbox/call/')) router.replace(`/call/${callId}` as never);
  }, [callId, pathname, router]);

  useEffect(() => {
    if (credentials.error) captureCallError(credentials.error, 'credentials', { call_id: callId });
  }, [callId, credentials.error]);

  useCallRealtime(credentials.data?.call_session.public_id, (event) => {
    if (event.type === 'call_ended') {
      recordCallBreadcrumb('end', { call_id: callId, remote: true });
      void finishLocally(credentials.data?.call_session);
    }
  });

  const leave = useCallback(async () => {
    if (endingRef.current) return;
    endingRef.current = 'leave';
    setCallActionIssue(null);
    setFailedAction(null);
    recordCallBreadcrumb('leave', { call_id: callId });
    try {
      const result = await endpoints.callAction(callId, 'leave');
      finishLocally(result.call_session);
    } catch (error) {
      endingRef.current = null;
      captureCallError(error, 'leave', { call_id: callId });

      // The HTTP response can be lost after Rails already processed the leave.
      // Reconcile before asking the user to retry, but never close while the
      // server still reports this call as active.
      const conversationId = credentials.data?.call_session.conversation_id;
      if (conversationId) {
        try {
          const refreshed = await endpoints.conversationSummary(conversationId);
          updateConversationCaches(queryClient, conversationId, () => refreshed);
          if (Number(refreshed.active_call?.id) !== callId) {
            finishLocally(credentials.data?.call_session);
            return;
          }
        } catch { /* The original leave error remains actionable. */ }
      }
      setFailedAction('leave');
      setCallActionIssue('The server did not confirm that you left. Your media is still connected; try again when the network is stable.');
    }
  }, [callId, credentials.data?.call_session, finishLocally, queryClient]);
  const end = useCallback(async () => {
    if (endingRef.current) return;
    endingRef.current = 'end';
    setCallActionIssue(null);
    setFailedAction(null);
    recordCallBreadcrumb('end', { call_id: callId });
    try {
      const result = await endpoints.callAction(callId, 'end');
      finishLocally(result.call_session);
    } catch (error) {
      endingRef.current = null;
      captureCallError(error, 'end', { call_id: callId });
      setFailedAction('end');
      setCallActionIssue(apiErrorMessage(error));
    }
  }, [callId, finishLocally]);

  useEffect(() => {
    if (!permissionReady) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      void leave();
      return true;
    });
    return () => subscription.remove();
  }, [leave, permissionReady]);

  const join = async () => {
    setPermissionIssue(null);
    recordCallBreadcrumb('permission', { call_id: callId, video: mediaType === 'video' });
    try {
      const result = await requestCallMediaPermissions(mediaType === 'video' && camera);
      if (!result.microphone || !result.camera) {
        setPermissionIssue('Microphone access is required. Video calls also need camera access when the camera is enabled.');
        return;
      }
      setPermissionReady(true);
    } catch (error) {
      captureCallError(error, 'permission', { call_id: callId });
      setPermissionIssue(apiErrorMessage(error));
    }
  };

  if (!permissionReady) return <View style={[styles.prejoin, { backgroundColor: theme.background }]}><View style={styles.preview}>{mediaType === 'video' && camera ? <Camera color="#ffffff" size={52} /> : <Mic color="#ffffff" size={52} />}<Text style={styles.previewText}>Media starts only after you join</Text></View><Text style={[styles.title, { color: theme.text }]}>{mediaType === 'video' ? 'Ready for video call?' : 'Ready for voice call?'}</Text><Text style={[styles.copy, { color: theme.textMuted }]}>Check your media before joining</Text><View style={styles.choices}><MediaChoice active={microphone} label={microphone ? 'Mic on' : 'Mic off'} onPress={() => setMicrophone((value) => !value)}>{microphone ? <Mic color="#ffffff" size={22} /> : <MicOff color="#ffffff" size={22} />}</MediaChoice>{mediaType === 'video' ? <MediaChoice active={camera} label={camera ? 'Camera on' : 'Camera off'} onPress={() => setCamera((value) => !value)}>{camera ? <Camera color="#ffffff" size={22} /> : <CameraOff color="#ffffff" size={22} />}</MediaChoice> : null}</View>{permissionIssue ? <View style={[styles.permission, { borderColor: theme.danger }]}><Text accessibilityRole="alert" style={{ color: theme.danger, flex: 1 }}>{permissionIssue}</Text><Pressable accessibilityLabel="Open app settings" onPress={() => void openApplicationSettings()}><Settings color={theme.danger} size={20} /></Pressable></View> : null}<PrimaryButton label="Join now" onPress={() => void join()} /><Pressable onPress={close} style={styles.cancel}><Text style={{ color: theme.textMuted, fontWeight: '800' }}>Cancel</Text></Pressable></View>;

  if (credentials.isLoading) return <View style={styles.loading}><LoadingState label="Joining secure call" /></View>;
  if (credentials.isError || !credentials.data) return <View style={[styles.state, { backgroundColor: theme.background }]}><ErrorState message={apiErrorMessage(credentials.error)} onRetry={() => credentials.refetch()} /><Pressable onPress={close} style={styles.cancel}><Text style={{ color: theme.primary, fontWeight: '800' }}>Back to Inbox</Text></Pressable></View>;

  const environmentIssue = validateLiveKitEnvironment(credentials.data.server_url);
  if (environmentIssue) return <View style={[styles.state, { backgroundColor: theme.background }]}><ShieldAlert color={theme.danger} size={42} /><Text style={[styles.title, { color: theme.text }]}>{environmentIssue.title}</Text><Text style={[styles.copy, { color: theme.textMuted }]}>{environmentIssue.detail}</Text><PrimaryButton label="Retry configuration" onPress={() => credentials.refetch()} /><Pressable onPress={close} style={styles.cancel}><Text style={{ color: theme.primary, fontWeight: '800' }}>Back to Inbox</Text></Pressable></View>;

  return <Suspense fallback={<View style={styles.loading}><LoadingState label="Starting secure media" /></View>}><View style={styles.callRoot}><LazyMobileCallRoom credentials={credentials.data} initialAudio={microphone} initialVideo={mediaType === credentials.data.call_session.call_type ? camera : false} onEnd={end} onLeave={leave} />{callActionIssue ? <View accessibilityRole="alert" style={styles.actionIssue}><Text style={styles.actionIssueText}>{callActionIssue}</Text><Pressable accessibilityRole="button" onPress={() => void (failedAction === 'end' ? end() : leave())} style={styles.actionRetry}><Text style={styles.actionRetryText}>Try again</Text></Pressable></View> : null}</View></Suspense>;
}

function MediaChoice({ active, children, label, onPress }: { active: boolean; children: React.ReactNode; label: string; onPress: () => void }) {
  return <View style={styles.choiceWrap}><Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={[styles.choice, { backgroundColor: active ? '#2563eb' : '#4b5563' }]}>{children}</Pressable><Text style={styles.choiceLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  callRoot: { flex: 1 },
  loading: { backgroundColor: '#101216', flex: 1, justifyContent: 'center' },
  state: { alignItems: 'center', flex: 1, gap: 14, justifyContent: 'center', paddingHorizontal: 26 },
  prejoin: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  preview: { alignItems: 'center', backgroundColor: '#171a20', borderRadius: 16, height: 250, justifyContent: 'center', marginBottom: 26 },
  previewText: { color: '#aeb6c2', fontSize: 11, marginTop: 14 },
  title: { fontSize: 24, fontWeight: '900', marginTop: 8, textAlign: 'center' },
  copy: { fontSize: 13, lineHeight: 19, marginBottom: 10, textAlign: 'center' },
  choices: { flexDirection: 'row', gap: 20, justifyContent: 'center', marginBottom: 22, marginTop: 18 },
  choiceWrap: { alignItems: 'center', width: 78 },
  choice: { alignItems: 'center', borderRadius: 28, height: 56, justifyContent: 'center', width: 56 },
  choiceLabel: { color: '#87909f', fontSize: 10, marginTop: 6 },
  permission: { alignItems: 'center', borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 12, marginBottom: 16, padding: 12 },
  cancel: { alignItems: 'center', minHeight: 44, padding: 12 },
  actionIssue: { alignItems: 'center', backgroundColor: '#451a03', borderColor: '#f59e0b', borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 10, left: 12, padding: 11, position: 'absolute', right: 12, top: 76 },
  actionIssueText: { color: '#fef3c7', flex: 1, fontSize: 11, lineHeight: 16 },
  actionRetry: { alignItems: 'center', borderRadius: 7, justifyContent: 'center', minHeight: 38, paddingHorizontal: 10 },
  actionRetryText: { color: '#fbbf24', fontSize: 11, fontWeight: '900' },
});
