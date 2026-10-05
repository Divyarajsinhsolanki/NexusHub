import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { absoluteAssetUrl } from '../api/client';
import { useAppTheme } from '../theme';
export function PostAttachment({ uri }: { uri?: string | null }) {
  const theme = useAppTheme();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { setFailed(false); setAttempt(0); }, [uri]);
  const src = absoluteAssetUrl(uri);
  if (!src) return null;
  return failed ? <View accessibilityLiveRegion="polite" style={{ padding: 20, gap: 12, backgroundColor: theme.surfaceMuted, borderRadius: 12 }}><Text style={{ color: theme.textMuted }}>This post’s image could not be loaded.</Text><View style={{ flexDirection: 'row', gap: 20 }}><Pressable accessibilityRole="button" onPress={() => { setAttempt(Date.now()); setFailed(false); }} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: theme.primary, fontWeight: '700' }}>Retry image</Text></Pressable><Pressable accessibilityRole="link" onPress={() => Linking.openURL(src).catch(() => {})} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: theme.primary, fontWeight: '700' }}>Open original</Text></Pressable></View></View> : <Image key={attempt} accessibilityLabel="Post attachment" source={{ uri: attempt ? `${src}${src.includes('?') ? '&' : '?'}retry=${attempt}` : src }} contentFit="contain" onError={() => setFailed(true)} style={{ height: 240, width: '100%', borderRadius: 14, backgroundColor: theme.surfaceMuted }} />;
}
