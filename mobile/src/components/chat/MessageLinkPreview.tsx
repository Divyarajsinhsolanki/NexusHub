import { useQuery } from '@tanstack/react-query';
import { Image, Linking, Pressable, Text, View } from 'react-native';
import { useState } from 'react';
import { api } from '../../api/client';
import { unwrapData } from '../../api/endpoints';
import type { Message } from '../../api/types';
import { splitMessageLinks } from '../../chat/messageLinks';
import { useAppTheme } from '../../theme';

type Preview = { title?: string; description?: string; image?: string; hostname?: string };
export function MessageLinkPreview({ message, conversationId }: { message: Message; conversationId: number }) {
  const theme = useAppTheme();
  const url = splitMessageLinks(message.body).find(part => part.url)?.url;
  const [failedImage, setFailedImage] = useState<string>();
  const { data } = useQuery({
    queryKey: ['chat-link-preview', conversationId, message.id, url],
    queryFn: async () => unwrapData<Preview>((await api.get(`/conversations/${conversationId}/messages/${message.id}/link_preview`, { params: { url } })).data),
    enabled: Boolean(url && message.id > 0 && !message.deleted_at), staleTime: 6 * 60 * 60 * 1000, retry: false,
  });
  if (!data?.title || !url) return null;
  return <Pressable accessibilityRole="link" accessibilityLabel={`Open ${data.title}`} onPress={() => { void Linking.openURL(url).catch(() => undefined); }} style={{ marginTop: 8, borderRadius: 8, overflow: 'hidden', backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, maxWidth: 300 }}>
    {data.image && failedImage !== data.image ? <Image source={{ uri: data.image }} onError={() => setFailedImage(data.image)} style={{ height: 130, width: '100%' }} resizeMode="cover" /> : null}
    <View style={{ padding: 10 }}><Text style={{ color: theme.textMuted, fontSize: 11 }}>{data.hostname}</Text><Text numberOfLines={2} style={{ color: theme.text, fontWeight: '700' }}>{data.title}</Text>{data.description ? <Text numberOfLines={3} style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }}>{data.description}</Text> : null}</View>
  </Pressable>;
}
