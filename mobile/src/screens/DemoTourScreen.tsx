import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ArrowLeft, ArrowUpRight, BookOpen, Clock3, FileText, FolderKanban, Layers3, MessagesSquare } from 'lucide-react-native';
import { ComponentType } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { absoluteAssetUrl, apiErrorMessage } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { DemoTourGroup } from '../api/types';
import { PageHeader } from '../components/PageHeader';
import { Screen } from '../components/Screen';
import { EmptyState, ErrorState, LoadingState } from '../components/StateView';
import { useAppTheme } from '../theme';

const icons: Record<string, ComponentType<{ color: string; size: number }>> = {
  delivery: FolderKanban,
  focus: Clock3,
  collaboration: MessagesSquare,
  knowledge: BookOpen,
  documents: FileText,
  platform: Layers3,
};

export function DemoTourScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const manifest = useQuery({ queryKey: ['demo-manifest'], queryFn: endpoints.demoManifest });

  return (
    <Screen header={<PageHeader leading={<Pressable accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}><ArrowLeft color={theme.text} size={22} /></Pressable>} title="Guided demo" subtitle="Six real product areas in about five minutes" />}>
      {manifest.isLoading ? <LoadingState label="Preparing demo tour" /> : null}
      {manifest.isError ? <ErrorState message={apiErrorMessage(manifest.error)} onRetry={() => manifest.refetch()} /> : null}
      {manifest.data ? (
        <FlatList
          contentContainerStyle={styles.list}
          data={manifest.data.groups}
          keyExtractor={(item) => item.key}
          ListHeaderComponent={(
            <View style={[styles.summary, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={[styles.summaryIcon, { backgroundColor: theme.surfaceMuted }]}><Layers3 color={theme.primary} size={24} /></View>
              <View style={styles.flex}>
                <Text style={[styles.summaryTitle, { color: theme.text }]}>{manifest.data.workspace.name}</Text>
                <Text style={[styles.summaryText, { color: theme.textMuted }]}>{manifest.data.total_steps} areas · {manifest.data.duration} · synthetic read-only data</Text>
              </View>
            </View>
          )}
          ListEmptyComponent={<EmptyState title="Tour unavailable" message="The demo workspace does not have tour steps yet." />}
          renderItem={({ item }) => <TourCard group={item} total={manifest.data.total_steps} onPress={() => router.push(item.route as never)} />}
        />
      ) : null}
    </Screen>
  );
}

function TourCard({ group, total, onPress }: { group: DemoTourGroup; total: number; onPress: () => void }) {
  const theme = useAppTheme();
  const Icon = icons[group.key] || ArrowUpRight;
  const image = absoluteAssetUrl(group.screenshot_url);

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {image ? <Image accessibilityLabel={group.title} contentFit="cover" source={{ uri: image }} style={styles.image} transition={180} /> : null}
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <View style={[styles.icon, { backgroundColor: theme.surfaceMuted }]}><Icon color={theme.primary} size={20} /></View>
          <Text style={[styles.step, { color: theme.textMuted }]}>STEP {group.step} OF {total}</Text>
        </View>
        <Text style={[styles.title, { color: theme.text }]}>{group.title}</Text>
        <Text style={[styles.body, { color: theme.textMuted }]}>{group.summary}</Text>
        {group.review_notes ? <Text style={[styles.note, { backgroundColor: theme.surfaceMuted, color: theme.text }]}><Text style={{ fontWeight: '800' }}>Notice: </Text>{group.review_notes}</Text> : null}
        <View style={styles.open}><Text style={[styles.openText, { color: theme.primary }]}>Explore screen</Text><ArrowUpRight color={theme.primary} size={17} /></View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  back: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  list: { gap: 12, padding: 20, paddingBottom: 44 },
  summary: { alignItems: 'center', borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 12, marginBottom: 6, padding: 14 },
  summaryIcon: { alignItems: 'center', borderRadius: 8, height: 46, justifyContent: 'center', width: 46 },
  summaryTitle: { fontSize: 16, fontWeight: '800' },
  summaryText: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  flex: { flex: 1 },
  card: { borderRadius: 8, borderWidth: 1, overflow: 'hidden' },
  image: { aspectRatio: 16 / 8, width: '100%' },
  cardBody: { padding: 16 },
  cardTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  icon: { alignItems: 'center', borderRadius: 7, height: 40, justifyContent: 'center', width: 40 },
  step: { fontSize: 10, fontWeight: '800' },
  title: { fontSize: 18, fontWeight: '800', marginTop: 15 },
  body: { fontSize: 13, lineHeight: 20, marginTop: 7 },
  note: { borderRadius: 6, fontSize: 12, lineHeight: 18, marginTop: 12, overflow: 'hidden', padding: 11 },
  open: { alignItems: 'center', flexDirection: 'row', gap: 5, marginTop: 15 },
  openText: { fontSize: 13, fontWeight: '800' },
});
