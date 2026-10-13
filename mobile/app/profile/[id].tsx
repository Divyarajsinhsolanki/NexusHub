import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, ScrollView, Text, Pressable } from 'react-native';
import { api, apiErrorMessage, absoluteAssetUrl } from '@/src/api/client';
import { endpoints, unwrapData } from '@/src/api/endpoints';
import type { EntityRecord } from '@/src/api/types';
import { useAuth } from '@/src/auth/AuthProvider';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { Avatar } from '@/src/components/Avatar';
import { Screen } from '@/src/components/Screen';
import { PageHeader } from '@/src/components/PageHeader';
import { LoadingState, ErrorState, EmptyState } from '@/src/components/StateView';
import { useAppTheme } from '@/src/theme';
export default function MemberProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useAppTheme();
  const profile = useQuery({ queryKey: ['member-profile', id], queryFn: async () => unwrapData<EntityRecord>((await api.get(`/users/${Number(id)}`)).data), enabled: Number.isSafeInteger(Number(id)) && Number(id) > 0 });
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const message = useMutation({mutationFn: () => endpoints.startDirectConversation(Number(id)), onSuccess: chat => { void queryClient.invalidateQueries({queryKey:['conversations']}); router.push(`/chat/${chat.id}` as never); }, onError: error => Alert.alert('Unable to start chat', apiErrorMessage(error))});
  const person = profile.data;
  const name = String(person?.name || person?.full_name || person?.email || 'Member');
  return <Screen header={<PageHeader title="Member profile" leading={<Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()}><Text style={{ color: theme.primary }}>Back</Text></Pressable>} />}>{!Number.isSafeInteger(Number(id)) || Number(id) <= 0 ? <EmptyState title="Invalid profile" message="Choose a workspace member from People." /> : profile.isPending ? <LoadingState label="Loading profile" /> : profile.isError ? <ErrorState message={apiErrorMessage(profile.error)} onRetry={() => profile.refetch()} /> : person ? <ScrollView contentContainerStyle={{ padding: 24, gap: 14 }}><Avatar name={name} size={80} uri={absoluteAssetUrl(person.profile_picture as string)} /><Text style={{ color: theme.text, fontSize: 24, fontWeight: '700' }}>{name}</Text>{['job_title', 'email', 'bio'].map(field => person[field] ? <Text key={field} style={{ color: theme.textMuted }}>{String(person[field])}</Text> : null)}{user && !user.demo_account && user.id !== Number(id) ? <PrimaryButton label="Message" loading={message.isPending} onPress={() => {if (!message.isPending) message.mutate();}} /> : null}</ScrollView> : null}</Screen>;
}
