import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Code2,
  Download,
  GitBranch,
  LogIn,
  MapPin,
  Sparkles,
  UserPlus,
  type LucideIcon,
} from 'lucide-react-native';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { absoluteAssetUrl, apiErrorMessage } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { PortfolioFeature, PortfolioProfile, PortfolioProject } from '../api/types';
import { OfflineBanner } from '../components/OfflineBanner';
import { PageHeader } from '../components/PageHeader';
import { Screen } from '../components/Screen';
import { EmptyState, ErrorState } from '../components/StateView';
import { useAppTheme } from '../theme';

type PortfolioScreenProps = { publicMode?: boolean };

export function PortfolioScreen({ publicMode = false }: PortfolioScreenProps) {
  const theme = useAppTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const portfolio = useQuery({
    queryKey: ['portfolio'],
    queryFn: endpoints.portfolio,
    staleTime: 5 * 60 * 1000,
  });
  const contentWidth = Math.min(width, 760);

  const content = (
    <>
      {portfolio.isLoading ? <PortfolioSkeleton /> : null}
      {portfolio.isError ? <ErrorState message={apiErrorMessage(portfolio.error)} onRetry={() => portfolio.refetch()} /> : null}
      {portfolio.data ? (
        <ScrollView
          contentContainerStyle={[styles.scroll, { maxWidth: contentWidth }]}
          refreshControl={<RefreshControl refreshing={portfolio.isRefetching} onRefresh={() => portfolio.refetch()} tintColor={theme.primary} />}
          showsVerticalScrollIndicator={false}>
          <ProfileHero profile={portfolio.data.profile} publicMode={publicMode} />
          <PortfolioOverview profile={portfolio.data.profile} projectCount={portfolio.data.projects.length} />
          <View style={styles.workHeading}>
            <View>
              <Text style={[styles.eyebrow, { color: theme.primary }]}>SELECTED WORK</Text>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Case studies</Text>
            </View>
            <Text style={[styles.sectionCount, { color: theme.textMuted }]}>{portfolio.data.projects.length} projects</Text>
          </View>
          {portfolio.data.projects.length ? portfolio.data.projects.map((project, index) => (
            <ProjectSection key={project.id} index={index} project={project} viewportWidth={width} />
          )) : <EmptyState title="No published projects" message="Published case studies will appear here." />}
          {publicMode ? <PublicFooter /> : null}
        </ScrollView>
      ) : null}
    </>
  );

  if (!publicMode) {
    return (
      <Screen header={<PageHeader leading={<IconButton label="Back" onPress={() => router.back()}><ArrowLeft color={theme.text} size={22} /></IconButton>} title="Portfolio" subtitle="Selected engineering work" />}>
        {content}
      </Screen>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.publicScreen, { backgroundColor: theme.background }]}>
      <OfflineBanner />
      <PublicHeader />
      <View style={styles.flex}>{content}</View>
    </SafeAreaView>
  );
}

function PublicHeader() {
  const theme = useAppTheme();
  const router = useRouter();
  return (
    <View style={[styles.publicHeader, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
      <View style={styles.brand}>
        <Image accessibilityLabel="Nexus Hub" contentFit="contain" source={require('../../assets/images/nexus-logo.webp')} style={styles.logo} />
        <View>
          <Text style={[styles.brandName, { color: theme.text }]}>Nexus Hub</Text>
          <Text style={[styles.brandDetail, { color: theme.textMuted }]}>ENGINEERING PORTFOLIO</Text>
        </View>
      </View>
      <Pressable accessibilityRole="button" onPress={() => router.push('/login')} style={[styles.signInButton, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <LogIn color={theme.text} size={17} />
        <Text style={[styles.signInLabel, { color: theme.text }]}>Sign in</Text>
      </Pressable>
    </View>
  );
}

function ProfileHero({ profile, publicMode }: { profile: PortfolioProfile | null; publicMode: boolean }) {
  const theme = useAppTheme();
  const router = useRouter();
  if (!profile) return <EmptyState title="Portfolio profile unavailable" message="Publish a portfolio profile to show it here." />;

  const contactUrl = `${(process.env.EXPO_PUBLIC_WEB_URL || '').replace(/\/$/, '')}/contact`;
  return (
    <View style={styles.hero}>
      <View style={styles.identity}>
        {profile.avatar_url ? (
          <Image accessibilityLabel={profile.full_name} contentFit="cover" source={{ uri: absoluteAssetUrl(profile.avatar_url) }} style={[styles.avatar, { backgroundColor: theme.surfaceMuted }]} transition={180} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: theme.surfaceMuted }]}><Code2 color={theme.primary} size={34} /></View>
        )}
        <View style={styles.identityCopy}>
          <Text style={[styles.heroKicker, { color: theme.primary }]}>DESIGNING AND SHIPPING SOFTWARE</Text>
          <Text adjustsFontSizeToFit minimumFontScale={0.78} numberOfLines={2} style={[styles.name, { color: theme.text }]}>{profile.full_name}</Text>
          <Text style={[styles.headline, { color: theme.textMuted }]}>{profile.headline}</Text>
          {profile.location ? <View style={styles.location}><MapPin color={theme.textMuted} size={14} /><Text style={[styles.locationText, { color: theme.textMuted }]}>{profile.location}</Text></View> : null}
        </View>
      </View>
      <Text style={[styles.summary, { color: theme.text }]}>{profile.summary}</Text>
      <View style={styles.skills}>{profile.skills.slice(0, 10).map((skill) => <View key={skill} style={[styles.skill, { backgroundColor: theme.surfaceMuted }]}><Text style={[styles.skillText, { color: theme.text }]}>{skill}</Text></View>)}</View>
      <View style={styles.heroActions}>
        {publicMode ? <ActionButton icon={UserPlus} label="Create account" onPress={() => router.push('/signup')} primary /> : null}
        {profile.resume_url ? <ActionButton icon={Download} label="Resume" onPress={() => openUrl(absoluteAssetUrl(profile.resume_url))} /> : null}
        {publicMode && process.env.EXPO_PUBLIC_WEB_URL ? <ActionButton icon={ArrowUpRight} label="Contact" onPress={() => openUrl(contactUrl)} /> : null}
      </View>
      {publicMode ? <Pressable accessibilityRole="button" onPress={() => router.push('/login')} style={styles.workspaceLink}><Text style={[styles.workspaceLabel, { color: theme.primary }]}>Already have a workspace? Sign in</Text><ArrowRight color={theme.primary} size={16} /></Pressable> : null}
    </View>
  );
}

function PortfolioOverview({ profile, projectCount }: { profile: PortfolioProfile | null; projectCount: number }) {
  const theme = useAppTheme();
  const metrics = normalizeMetrics(profile?.metrics, projectCount);
  const highlights = profile?.engineering_highlights?.filter(Boolean).slice(0, 4) || [];
  const architecture = profile?.architecture?.filter(Boolean).slice(0, 6) || [];
  if (!metrics.length && !highlights.length && !architecture.length) return null;

  return (
    <View style={[styles.overviewBand, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {metrics.length ? <View style={styles.metricGrid}>{metrics.map((metric) => <View key={`${metric.label}-${metric.value}`} style={styles.metric}><Text style={[styles.metricValue, { color: theme.text }]}>{metric.value}</Text><Text style={[styles.metricLabel, { color: theme.textMuted }]}>{metric.label}</Text></View>)}</View> : null}
      {highlights.length ? <View style={[styles.overviewSection, metrics.length > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}><Text style={[styles.overviewTitle, { color: theme.text }]}>Engineering highlights</Text>{highlights.map((item) => <View key={item} style={styles.highlight}><Sparkles color={theme.primary} size={15} /><Text style={[styles.highlightText, { color: theme.textMuted }]}>{item}</Text></View>)}</View> : null}
      {architecture.length ? <View style={[styles.architecture, { borderTopColor: theme.border }]}>{architecture.map((item) => <View key={item} style={[styles.architectureTag, { borderColor: theme.border }]}><Text style={[styles.architectureText, { color: theme.textMuted }]}>{item}</Text></View>)}</View> : null}
    </View>
  );
}

function ProjectSection({ project, index, viewportWidth }: { project: PortfolioProject; index: number; viewportWidth: number }) {
  const theme = useAppTheme();
  const featureWidth = Math.min(Math.max(viewportWidth - 72, 244), 324);
  const metrics = normalizeMetrics(project.metrics);
  return (
    <View style={[styles.project, { borderTopColor: theme.border }]}>
      <View style={styles.projectEyebrow}>
        <Text style={[styles.projectIndex, { color: theme.primary }]}>{String(index + 1).padStart(2, '0')}</Text>
        {project.featured ? <Text style={[styles.featured, { backgroundColor: theme.surfaceMuted, color: theme.text }]}>FEATURED</Text> : null}
      </View>
      <Text style={[styles.projectTitle, { color: theme.text }]}>{project.title}</Text>
      {project.tagline ? <Text style={[styles.tagline, { color: theme.textMuted }]}>{project.tagline}</Text> : null}
      {project.cover_image_url ? <Image accessibilityLabel={`${project.title} cover`} contentFit="cover" source={{ uri: absoluteAssetUrl(project.cover_image_url) }} style={[styles.cover, { backgroundColor: theme.surfaceMuted }]} transition={180} /> : null}
      {metrics.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.projectMetrics}>{metrics.map((metric) => <View key={`${metric.label}-${metric.value}`} style={[styles.projectMetric, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text style={[styles.projectMetricValue, { color: theme.text }]}>{metric.value}</Text><Text style={[styles.projectMetricLabel, { color: theme.textMuted }]}>{metric.label}</Text></View>)}</ScrollView> : null}
      <Text style={[styles.projectSummary, { color: theme.text }]}>{project.description || project.summary}</Text>
      {project.engineering_highlights?.length ? <View style={styles.projectHighlights}>{project.engineering_highlights.slice(0, 4).map((item) => <View key={item} style={styles.highlight}><View style={[styles.bullet, { backgroundColor: theme.primary }]} /><Text style={[styles.highlightText, { color: theme.textMuted }]}>{item}</Text></View>)}</View> : null}
      <View style={styles.skills}>{project.stack.map((item) => <View key={item} style={[styles.stack, { borderColor: theme.border }]}><Text style={[styles.stackText, { color: theme.textMuted }]}>{item}</Text></View>)}</View>
      {(project.repository_url || project.live_url) ? <View style={styles.projectActions}>{project.live_url ? <ActionButton icon={ArrowUpRight} label="Live project" onPress={() => openUrl(project.live_url)} primary /> : null}{project.repository_url ? <ActionButton icon={GitBranch} label="Repository" onPress={() => openUrl(project.repository_url)} /> : null}</View> : null}
      {project.features.length ? <View style={styles.features}><Text style={[styles.featuresTitle, { color: theme.text }]}>Inside the project</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.featureList} decelerationRate="fast">{project.features.map((feature) => <FeatureCard feature={feature} key={feature.id} width={featureWidth} />)}</ScrollView></View> : null}
    </View>
  );
}

function FeatureCard({ feature, width }: { feature: PortfolioFeature; width: number }) {
  const theme = useAppTheme();
  return (
    <View style={[styles.feature, { backgroundColor: theme.surface, borderColor: theme.border, width }]}>
      {feature.screenshot_url ? <Image accessibilityLabel={feature.alt_text || feature.title} contentFit="cover" source={{ uri: absoluteAssetUrl(feature.screenshot_url) }} style={[styles.featureImage, { backgroundColor: theme.surfaceMuted }]} transition={180} /> : <View style={[styles.featureImage, styles.featureFallback, { backgroundColor: theme.surfaceMuted }]}><Code2 color={theme.primary} size={25} /></View>}
      <View style={styles.featureBody}>
        <Text style={[styles.featureCategory, { color: theme.primary }]}>{feature.category.toUpperCase()}</Text>
        <Text numberOfLines={2} style={[styles.featureTitle, { color: theme.text }]}>{feature.title}</Text>
        <Text numberOfLines={4} style={[styles.featureSummary, { color: theme.textMuted }]}>{feature.summary}</Text>
      </View>
    </View>
  );
}

function PublicFooter() {
  const theme = useAppTheme();
  const router = useRouter();
  return (
    <View style={[styles.footer, { borderTopColor: theme.border }]}>
      <Image accessibilityLabel="Nexus Hub" contentFit="contain" source={require('../../assets/images/nexus-logo.webp')} style={styles.footerLogo} />
      <Text style={[styles.footerTitle, { color: theme.text }]}>Bring the work into one place.</Text>
      <Text style={[styles.footerText, { color: theme.textMuted }]}>Projects, delivery, knowledge and collaboration in a focused mobile workspace.</Text>
      <ActionButton icon={LogIn} label="Sign in to Nexus Hub" onPress={() => router.push('/login')} primary />
      <Text style={[styles.copyright, { color: theme.textMuted }]}>Nexus Hub</Text>
    </View>
  );
}

function PortfolioSkeleton() {
  const theme = useAppTheme();
  return <View accessibilityLabel="Loading portfolio" style={styles.skeleton}><View style={[styles.skeletonAvatar, { backgroundColor: theme.surfaceMuted }]} /><View style={styles.skeletonCopy}><View style={[styles.skeletonLine, { backgroundColor: theme.surfaceMuted, width: '74%' }]} /><View style={[styles.skeletonLine, { backgroundColor: theme.surfaceMuted, width: '92%' }]} /><View style={[styles.skeletonLine, { backgroundColor: theme.surfaceMuted, width: '58%' }]} /></View><View style={[styles.skeletonHero, { backgroundColor: theme.surfaceMuted }]} /><View style={[styles.skeletonLine, { backgroundColor: theme.surfaceMuted, marginTop: 28, width: '42%' }]} /><View style={[styles.skeletonCover, { backgroundColor: theme.surfaceMuted }]} /></View>;
}

function ActionButton({ icon: Icon, label, onPress, primary = false }: { icon: LucideIcon; label: string; onPress: () => void; primary?: boolean }) {
  const theme = useAppTheme();
  return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.action, { backgroundColor: primary ? theme.primary : theme.surface, borderColor: primary ? theme.primary : theme.border }]}><Icon color={primary ? '#ffffff' : theme.text} size={17} /><Text style={[styles.actionLabel, { color: primary ? '#ffffff' : theme.text }]}>{label}</Text></Pressable>;
}

function IconButton({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={styles.iconButton}>{children}</Pressable>;
}

function normalizeMetrics(metrics?: Array<string | Record<string, unknown>>, fallbackCount?: number) {
  const rows = (metrics || []).map((metric, index) => {
    if (typeof metric === 'string') {
      const [value, ...label] = metric.split(/\s+/);
      return { value: value || metric, label: label.join(' ') || `Result ${index + 1}` };
    }
    const value = String(metric.value ?? metric.metric ?? metric.number ?? '');
    const label = String(metric.label ?? metric.name ?? metric.title ?? `Result ${index + 1}`);
    return { value, label };
  }).filter((metric) => metric.value);
  if (!rows.length && fallbackCount) return [{ value: String(fallbackCount), label: fallbackCount === 1 ? 'Case study' : 'Case studies' }];
  return rows.slice(0, 4);
}

function openUrl(url?: string | null) {
  if (url) void WebBrowser.openBrowserAsync(url);
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  publicScreen: { flex: 1 },
  scroll: { alignSelf: 'center', paddingBottom: 64, width: '100%' },
  publicHeader: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 68, paddingHorizontal: 16 },
  brand: { alignItems: 'center', flex: 1, flexDirection: 'row', flexShrink: 1, minWidth: 0 },
  logo: { borderRadius: 7, height: 40, marginRight: 10, width: 40 },
  brandName: { fontSize: 17, fontWeight: '900' },
  brandDetail: { fontSize: 8, fontWeight: '800', marginTop: 2 },
  signInButton: { alignItems: 'center', borderRadius: 7, borderWidth: 1, flexDirection: 'row', flexShrink: 0, gap: 7, minHeight: 44, paddingHorizontal: 12 },
  signInLabel: { fontSize: 13, fontWeight: '800' },
  iconButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  hero: { paddingHorizontal: 20, paddingBottom: 32, paddingTop: 28 },
  identity: { alignItems: 'center', flexDirection: 'row' },
  avatar: { borderRadius: 8, height: 88, width: 88 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  identityCopy: { flex: 1, marginLeft: 16, minWidth: 0 },
  heroKicker: { fontSize: 9, fontWeight: '900' },
  name: { fontSize: 27, fontWeight: '900', lineHeight: 31, marginTop: 5 },
  headline: { fontSize: 14, fontWeight: '600', lineHeight: 20, marginTop: 5 },
  location: { alignItems: 'center', flexDirection: 'row', gap: 4, marginTop: 7 },
  locationText: { fontSize: 12 },
  summary: { fontSize: 15, lineHeight: 23, marginTop: 22 },
  skills: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 17 },
  skill: { borderRadius: 5, paddingHorizontal: 9, paddingVertical: 6 },
  skillText: { fontSize: 11, fontWeight: '700' },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 21 },
  workspaceLink: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 6, minHeight: 44, marginTop: 10 },
  workspaceLabel: { fontSize: 12, fontWeight: '800' },
  action: { alignItems: 'center', borderRadius: 7, borderWidth: 1, flexDirection: 'row', gap: 7, minHeight: 44, paddingHorizontal: 13 },
  actionLabel: { fontSize: 12, fontWeight: '800' },
  overviewBand: { borderBottomWidth: 1, borderTopWidth: 1, paddingHorizontal: 20, paddingVertical: 21 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  metric: { minWidth: 88 },
  metricValue: { fontSize: 22, fontWeight: '900' },
  metricLabel: { fontSize: 10, fontWeight: '700', marginTop: 3 },
  overviewSection: { marginTop: 20, paddingTop: 18 },
  overviewTitle: { fontSize: 14, fontWeight: '800', marginBottom: 9 },
  highlight: { alignItems: 'flex-start', flexDirection: 'row', gap: 9, marginTop: 8 },
  highlightText: { flex: 1, fontSize: 12, lineHeight: 18 },
  architecture: { borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 19, paddingTop: 17 },
  architectureTag: { borderRadius: 5, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 5 },
  architectureText: { fontSize: 10, fontWeight: '700' },
  workHeading: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 34 },
  eyebrow: { fontSize: 9, fontWeight: '900' },
  sectionTitle: { fontSize: 22, fontWeight: '900', marginTop: 5 },
  sectionCount: { fontSize: 11, marginBottom: 3 },
  project: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 23, paddingHorizontal: 20, paddingTop: 27 },
  projectEyebrow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  projectIndex: { fontSize: 11, fontWeight: '900' },
  featured: { borderRadius: 4, fontSize: 9, fontWeight: '900', overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 4 },
  projectTitle: { fontSize: 25, fontWeight: '900', lineHeight: 30, marginTop: 10 },
  tagline: { fontSize: 14, lineHeight: 20, marginTop: 5 },
  cover: { aspectRatio: 16 / 9, borderRadius: 8, marginTop: 18, width: '100%' },
  projectMetrics: { gap: 8, paddingTop: 12 },
  projectMetric: { borderRadius: 7, borderWidth: 1, minWidth: 108, paddingHorizontal: 11, paddingVertical: 9 },
  projectMetricValue: { fontSize: 15, fontWeight: '900' },
  projectMetricLabel: { fontSize: 9, marginTop: 2 },
  projectSummary: { fontSize: 14, lineHeight: 22, marginTop: 17 },
  projectHighlights: { marginTop: 11 },
  bullet: { borderRadius: 3, height: 6, marginTop: 6, width: 6 },
  stack: { borderRadius: 5, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 5 },
  stackText: { fontSize: 10, fontWeight: '700' },
  projectActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 17 },
  features: { marginTop: 25 },
  featuresTitle: { fontSize: 14, fontWeight: '800' },
  featureList: { gap: 10, paddingRight: 20, paddingTop: 11 },
  feature: { borderRadius: 8, borderWidth: 1, overflow: 'hidden' },
  featureImage: { aspectRatio: 16 / 9, width: '100%' },
  featureFallback: { alignItems: 'center', justifyContent: 'center' },
  featureBody: { padding: 13 },
  featureCategory: { fontSize: 9, fontWeight: '900' },
  featureTitle: { fontSize: 15, fontWeight: '800', lineHeight: 20, marginTop: 6 },
  featureSummary: { fontSize: 12, lineHeight: 18, marginTop: 5 },
  footer: { alignItems: 'flex-start', borderTopWidth: StyleSheet.hairlineWidth, marginHorizontal: 20, marginTop: 42, paddingTop: 30 },
  footerLogo: { borderRadius: 7, height: 42, width: 42 },
  footerTitle: { fontSize: 21, fontWeight: '900', marginTop: 15 },
  footerText: { fontSize: 13, lineHeight: 20, marginBottom: 17, marginTop: 7, maxWidth: 420 },
  copyright: { fontSize: 10, fontWeight: '700', marginTop: 28 },
  skeleton: { padding: 20 },
  skeletonAvatar: { borderRadius: 8, height: 88, width: 88 },
  skeletonCopy: { gap: 10, left: 124, position: 'absolute', right: 20, top: 30 },
  skeletonLine: { borderRadius: 5, height: 13 },
  skeletonHero: { borderRadius: 6, height: 76, marginTop: 22, width: '100%' },
  skeletonCover: { aspectRatio: 16 / 9, borderRadius: 8, marginTop: 17, width: '100%' },
});
