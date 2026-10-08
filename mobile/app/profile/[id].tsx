import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, Text, Pressable } from 'react-native';
import { api, apiErrorMessage, absoluteAssetUrl } from '@/src/api/client';
import { unwrapData } from '@/src/api/endpoints';
import type { EntityRecord } from '@/src/api/types';
import { Avatar } from '@/src/components/Avatar';
import { Screen } from '@/src/components/Screen';
import { PageHeader } from '@/src/components/PageHeader';
import { LoadingState, ErrorState } from '@/src/components/StateView';
import { useAppTheme } from '@/src/theme';
export default function MemberProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useAppTheme();
  const profile = useQuery({ queryKey: ['member-profile', id], queryFn: async () => unwrapData<EntityRecord>((await api.get(`/users/${Number(id)}`)).data), enabled: Number.isSafeInteger(Number(id)) && Number(id) > 0 });
  const person = profile.data;
  const name = String(person?.name || person?.full_name || person?.email || 'Member');
  return <Screen header={<PageHeader title="Member profile" leading={<Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()}><Text style={{ color: theme.primary }}>Back</Text></Pressable>} />}>{profile.isPending ? <LoadingState label="Loading profile" /> : profile.isError ? <ErrorState message={apiErrorMessage(profile.error)} onRetry={() => profile.refetch()} /> : person ? <ScrollView contentContainerStyle={{ padding: 24, gap: 14 }}><Avatar name={name} size={80} uri={absoluteAssetUrl(person.profile_picture as string)} /><Text style={{ color: theme.text, fontSize: 24, fontWeight: '700' }}>{name}</Text>{['job_title', 'email', 'bio'].map(field => person[field] ? <Text key={field} style={{ color: theme.textMuted }}>{String(person[field])}</Text> : null)}</ScrollView> : null}</Screen>;
}
