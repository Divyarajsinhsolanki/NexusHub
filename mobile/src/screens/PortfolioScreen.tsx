import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  CheckCircle2,
  Code2,
  Download,
  ExternalLink,
  GitBranch,
  Layers3,
  LogIn,
  MapPin,
  MessageCircle,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  UserPlus,
  type LucideIcon,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { absoluteAssetUrl, apiErrorMessage } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { PortfolioCaseStudy, PortfolioFeature, PortfolioProfile, PortfolioProject } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { OfflineBanner } from '../components/OfflineBanner';
import { PageHeader } from '../components/PageHeader';
import { Screen } from '../components/Screen';
import { EmptyState, ErrorState } from '../components/StateView';
import { type AppTheme, useAppTheme } from '../theme';

type PortfolioScreenProps = { publicMode?: boolean };
type PortfolioColors = AppTheme;
type DemoAction = (route?: string) => Promise<void>;

const publicTheme: AppTheme = {
  primary: '#1d4ed8',
  primaryPressed: '#1e40af',
  success: '#047857',
  warning: '#b45309',
  danger: '#b91c1c',
  white: '#ffffff',
  background: '#f7fbff',
  surface: '#ffffff',
  surfaceMuted: '#eaf5ff',
  text: '#102033',
  textMuted: '#607086',
  border: '#d7e7f6',
  tabBar: '#ffffff',
};

const fallbackCaseStudy: Required<Pick<PortfolioCaseStudy, 'problem' | 'role' | 'constraints' | 'decisions' | 'trade_offs' | 'outcomes'>> = {
  problem: 'Important work often gets split across planning boards, chat, files, learning notes, and reporting tools.',
  role: 'Designed and shipped the product surfaces, Rails APIs, realtime flows, and mobile experience that connect those workflows.',
  constraints: ['Keep a broad workspace understandable on small screens', 'Protect demo data from write actions', 'Keep project review paths fast'],
  decisions: ['Use native mobile routes for frequent work', 'Keep public portfolio actions connected to the read-only demo', 'Prefer compact cards over desktop-style dense tables'],
  trade_offs: ['Some immersive web experiences stay as web links until they justify native rebuilds'],
  outcomes: ['A reviewer can inspect the product from the first screen', 'Demo users can enter and exit without hunting through account settings'],
};

const fallbackArchitecture = [
  'React Native and Expo client',
  'Rails JSON API with token auth',
  'PostgreSQL workspace data model',
  'Realtime chat, calls, and notifications',
];

export function PortfolioScreen({ publicMode = false }: PortfolioScreenProps) {
  const appTheme = useAppTheme();
  const colors = publicMode ? publicTheme : appTheme;
  const router = useRouter();
  const { signInDemo } = useAuth();
  const { width } = useWindowDimensions();
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState('');
  const portfolio = useQuery({
    queryKey: ['portfolio'],
    queryFn: endpoints.portfolio,
    staleTime: 5 * 60 * 1000,
  });
  const contentWidth = Math.min(width, publicMode ? 820 : 760);

  const startDemo: DemoAction = async (route = '/more/demo') => {
    if (!publicMode) {
      router.push(route as never);
      return;
    }

    setDemoError('');
    setDemoLoading(true);
    try {
      await signInDemo();
      router.replace(route as never);
    } catch (error) {
      setDemoError(apiErrorMessage(error));
    } finally {
      setDemoLoading(false);
    }
  };

  const content = (
    <>
      {portfolio.isLoading ? <PortfolioSkeleton colors={colors} /> : null}
      {portfolio.isError ? <ErrorState message={apiErrorMessage(portfolio.error)} onRetry={() => portfolio.refetch()} /> : null}
      {portfolio.data ? (
        <ScrollView
          contentContainerStyle={[styles.scroll, publicMode && styles.publicScroll, { maxWidth: contentWidth }]}
          refreshControl={<RefreshControl refreshing={portfolio.isRefetching} onRefresh={() => portfolio.refetch()} tintColor={colors.primary} />}
          showsVerticalScrollIndicator={false}>
          <ProfileHero colors={colors} demoError={demoError} demoLoading={demoLoading} onDemo={startDemo} profile={portfolio.data.profile} publicMode={publicMode} />
          <PortfolioOverview colors={colors} profile={portfolio.data.profile} projectCount={portfolio.data.projects.length} />
          <CaseStudySection colors={colors} onDemo={startDemo} profile={portfolio.data.profile} projects={portfolio.data.projects} publicMode={publicMode} />
          <DecisionSection colors={colors} project={featuredProject(portfolio.data.projects)} />
          <ArchitectureSection colors={colors} profile={portfolio.data.profile} project={featuredProject(portfolio.data.projects)} />
          <FeatureMap colors={colors} onDemo={startDemo} projects={portfolio.data.projects} publicMode={publicMode} />
          <SocialContactSection colors={colors} profile={portfolio.data.profile} publicMode={publicMode} />
          {publicMode ? <PublicFooter colors={colors} onDemo={startDemo} /> : null}
        </ScrollView>
      ) : null}
    </>
  );

  if (!publicMode) {
    return (
      <Screen header={<PageHeader leading={<IconButton label="Back" onPress={() => router.back()}><ArrowLeft color={colors.text} size={22} /></IconButton>} title="Portfolio" subtitle="Selected engineering work" />}>
        {content}
      </Screen>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.publicScreen, { backgroundColor: colors.background }]}>
      <OfflineBanner />
      <PublicHeader colors={colors} onDemo={startDemo} />
      <View style={styles.flex}>{content}</View>
    </SafeAreaView>
  );
}

function PublicHeader({ colors, onDemo }: { colors: PortfolioColors; onDemo: DemoAction }) {
  const router = useRouter();
  return (
    <View style={[styles.publicHeader, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
      <View style={styles.brand}>
        <Image accessibilityLabel="Nexus Hub" contentFit="contain" source={require('../../assets/images/nexus-logo.webp')} style={styles.logo} />
        <View>
          <Text style={[styles.brandName, { color: colors.text }]}>Nexus Hub</Text>
          <Text style={[styles.brandDetail, { color: colors.textMuted }]}>ENGINEERING PORTFOLIO</Text>
        </View>
      </View>
      <View style={styles.publicHeaderActions}>
        <Pressable accessibilityRole="button" onPress={() => onDemo('/more/demo')} style={[styles.headerDemoButton, { backgroundColor: colors.primary }]}>
          <PlayCircle color="#ffffff" size={16} />
          <Text style={styles.headerDemoLabel}>Demo</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push('/login')} style={[styles.signInButton, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <LogIn color={colors.text} size={17} />
          <Text style={[styles.signInLabel, { color: colors.text }]}>Sign in</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ProfileHero({ colors, demoError, demoLoading, onDemo, profile, publicMode }: { colors: PortfolioColors; demoError: string; demoLoading: boolean; onDemo: DemoAction; profile: PortfolioProfile | null; publicMode: boolean }) {
  const router = useRouter();
  if (!profile) return <EmptyState title="Portfolio profile unavailable" message="Publish a portfolio profile to show it here." />;

  const contactUrl = `${(process.env.EXPO_PUBLIC_WEB_URL || '').replace(/\/$/, '')}/contact`;
  const initials = profileInitials(profile.full_name);
  return (
    <View style={[styles.hero, publicMode && styles.publicHero]}>
      <View style={[styles.heroHalo, { backgroundColor: colors.surfaceMuted }]} />
      <View style={styles.identity}>
        {profile.avatar_url ? (
          <Image accessibilityLabel={profile.full_name} contentFit="cover" source={{ uri: absoluteAssetUrl(profile.avatar_url) }} style={[styles.avatar, { backgroundColor: colors.surfaceMuted }]} transition={180} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.primary }]}><Text style={styles.avatarInitials}>{initials}</Text></View>
        )}
        <View style={styles.identityCopy}>
          <Text style={[styles.heroKicker, { color: colors.primary }]}>FULL-STACK PRODUCT ENGINEERING</Text>
          <Text adjustsFontSizeToFit minimumFontScale={0.78} numberOfLines={2} style={[styles.name, { color: colors.text }]}>{profile.full_name}</Text>
          <Text style={[styles.headline, { color: colors.textMuted }]}>{profile.headline}</Text>
          {profile.location ? <View style={styles.location}><MapPin color={colors.textMuted} size={14} /><Text style={[styles.locationText, { color: colors.textMuted }]}>{profile.location}</Text></View> : null}
        </View>
      </View>
      <Text style={[styles.summary, { color: colors.text }]}>{profile.summary}</Text>
      <View style={styles.skills}>{profile.skills.slice(0, 10).map((skill) => <View key={skill} style={[styles.skill, { backgroundColor: colors.surfaceMuted }]}><Text style={[styles.skillText, { color: colors.text }]}>{skill}</Text></View>)}</View>
      <View style={styles.heroActions}>
        {publicMode ? <ActionButton colors={colors} icon={PlayCircle} label={demoLoading ? 'Opening demo...' : 'View demo'} onPress={() => onDemo('/more/demo')} primary /> : null}
        {publicMode ? <ActionButton colors={colors} icon={UserPlus} label="Create account" onPress={() => router.push('/signup')} /> : null}
        {profile.resume_url ? <ActionButton colors={colors} icon={Download} label="Resume" onPress={() => openUrl(absoluteAssetUrl(profile.resume_url))} /> : null}
        {publicMode && process.env.EXPO_PUBLIC_WEB_URL ? <ActionButton colors={colors} icon={MessageCircle} label="Contact" onPress={() => openUrl(contactUrl)} /> : null}
      </View>
      {demoError ? <Text accessibilityRole="alert" style={[styles.demoError, { color: colors.danger }]}>{demoError}</Text> : null}
      {publicMode ? <Pressable accessibilityRole="button" onPress={() => router.push('/login')} style={styles.workspaceLink}><Text style={[styles.workspaceLabel, { color: colors.primary }]}>Already have a workspace? Sign in</Text><ArrowRight color={colors.primary} size={16} /></Pressable> : null}
    </View>
  );
}

function PortfolioOverview({ colors, profile, projectCount }: { colors: PortfolioColors; profile: PortfolioProfile | null; projectCount: number }) {
  const metrics = normalizeMetrics(profile?.metrics, projectCount);
  const highlights = profile?.engineering_highlights?.filter(Boolean).slice(0, 4) || [];
  if (!metrics.length && !highlights.length) return null;

  return (
    <View style={[styles.overviewBand, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {metrics.length ? <View style={styles.metricGrid}>{metrics.map((metric) => <View key={`${metric.label}-${metric.value}`} style={styles.metric}><Text style={[styles.metricValue, { color: colors.text }]}>{metric.value}</Text><Text style={[styles.metricLabel, { color: colors.textMuted }]}>{metric.label}</Text></View>)}</View> : null}
      {highlights.length ? <View style={[styles.overviewSection, metrics.length > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}><Text style={[styles.overviewTitle, { color: colors.text }]}>Engineering highlights</Text>{highlights.map((item) => <View key={item} style={styles.highlight}><Sparkles color={colors.primary} size={15} /><Text style={[styles.highlightText, { color: colors.textMuted }]}>{item}</Text></View>)}</View> : null}
    </View>
  );
}

function CaseStudySection({ colors, onDemo, profile, projects, publicMode }: { colors: PortfolioColors; onDemo: DemoAction; profile: PortfolioProfile | null; projects: PortfolioProject[]; publicMode: boolean }) {
  const project = featuredProject(projects);
  const metrics = normalizeMetrics(project?.metrics);
  if (!project) return <EmptyState title="No published projects" message="Published case studies will appear here." />;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>FLAGSHIP CASE STUDY</Text>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{project.title}</Text>
        </View>
        {project.featured ? <Text style={[styles.featured, { backgroundColor: colors.surfaceMuted, color: colors.text }]}>FEATURED</Text> : null}
      </View>
      {project.tagline ? <Text style={[styles.tagline, { color: colors.textMuted }]}>{project.tagline}</Text> : null}
      {project.cover_image_url ? <Image accessibilityLabel={`${project.title} cover`} contentFit="cover" source={{ uri: absoluteAssetUrl(project.cover_image_url) }} style={[styles.cover, { backgroundColor: colors.surfaceMuted }]} transition={180} /> : null}
      {metrics.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.projectMetrics}>{metrics.map((metric) => <View key={`${metric.label}-${metric.value}`} style={[styles.projectMetric, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.projectMetricValue, { color: colors.text }]}>{metric.value}</Text><Text style={[styles.projectMetricLabel, { color: colors.textMuted }]}>{metric.label}</Text></View>)}</ScrollView> : null}
      <Text style={[styles.projectSummary, { color: colors.text }]}>{project.description || project.summary}</Text>
      <View style={styles.projectHighlights}>{(project.engineering_highlights || profile?.engineering_highlights || []).slice(0, 4).map((item) => <View key={item} style={styles.highlight}><View style={[styles.bullet, { backgroundColor: colors.primary }]} /><Text style={[styles.highlightText, { color: colors.textMuted }]}>{item}</Text></View>)}</View>
      <View style={styles.skills}>{project.stack.map((item) => <View key={item} style={[styles.stack, { borderColor: colors.border, backgroundColor: colors.surface }]}><Text style={[styles.stackText, { color: colors.textMuted }]}>{item}</Text></View>)}</View>
      <View style={styles.projectActions}>
        {publicMode ? <ActionButton colors={colors} icon={PlayCircle} label="Start guided demo" onPress={() => onDemo('/more/demo')} primary /> : null}
        {project.live_url ? <ActionButton colors={colors} icon={ArrowUpRight} label="Live project" onPress={() => openUrl(project.live_url)} /> : null}
        {project.repository_url ? <ActionButton colors={colors} icon={GitBranch} label="Repository" onPress={() => openUrl(project.repository_url)} /> : null}
      </View>
    </View>
  );
}

function DecisionSection({ colors, project }: { colors: PortfolioColors; project?: PortfolioProject }) {
  const caseStudy = normalizeCaseStudy(project?.case_study);
  const rows = [
    { title: 'Problem', body: caseStudy.problem, icon: BriefcaseBusiness },
    { title: 'My role', body: caseStudy.role, icon: ShieldCheck },
  ].filter((row) => row.body);
  const lists = [
    { title: 'Constraints', items: caseStudy.constraints },
    { title: 'Technical decisions', items: caseStudy.decisions },
    { title: 'Trade-offs', items: caseStudy.trade_offs },
    { title: 'Outcomes', items: caseStudy.outcomes },
  ].filter((row) => row.items.length);

  return (
    <View style={styles.section}>
      <Text style={[styles.eyebrow, { color: colors.primary }]}>ENGINEERING DECISIONS</Text>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>The reasoning behind the product.</Text>
      <View style={styles.decisionGrid}>
        {rows.map((row) => {
          const Icon = row.icon;
          return <View key={row.title} style={[styles.decisionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><Icon color={colors.primary} size={19} /><Text style={[styles.decisionTitle, { color: colors.text }]}>{row.title}</Text><Text style={[styles.decisionBody, { color: colors.textMuted }]}>{row.body}</Text></View>;
        })}
      </View>
      <View style={styles.listGrid}>
        {lists.map((row) => <View key={row.title} style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.listTitle, { color: colors.text }]}>{row.title}</Text>{row.items.map((item) => <View key={item} style={styles.listItem}><CheckCircle2 color={colors.success} size={15} /><Text style={[styles.listItemText, { color: colors.textMuted }]}>{item}</Text></View>)}</View>)}
      </View>
    </View>
  );
}

function ArchitectureSection({ colors, profile, project }: { colors: PortfolioColors; profile: PortfolioProfile | null; project?: PortfolioProject }) {
  const profileArchitecture = profile?.architecture?.filter(Boolean) || [];
  const architecture = profileArchitecture.length ? profileArchitecture : fallbackArchitecture;
  const stack = project?.stack?.slice(0, 5) || [];

  return (
    <View style={[styles.architectureBand, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.eyebrow, { color: colors.primary }]}>ARCHITECTURE</Text>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Built across the application stack.</Text>
      <View style={styles.architectureList}>
        {architecture.map((item, index) => <View key={item} style={[styles.architectureRow, { borderColor: colors.border }]}><Text style={[styles.architectureIndex, { color: colors.primary }]}>{String(index + 1).padStart(2, '0')}</Text><Text style={[styles.architectureText, { color: colors.text }]}>{item}</Text></View>)}
      </View>
      {stack.length ? <View style={styles.architectureTags}>{stack.map((item) => <View key={item} style={[styles.architectureTag, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}><Text style={[styles.architectureTagText, { color: colors.text }]}>{item}</Text></View>)}</View> : null}
    </View>
  );
}

function FeatureMap({ colors, onDemo, projects, publicMode }: { colors: PortfolioColors; onDemo: DemoAction; projects: PortfolioProject[]; publicMode: boolean }) {
  const features = useMemo(() => projects.flatMap((project) => project.features.map((feature) => ({ ...feature, projectTitle: project.title }))).sort((a, b) => (a.tour_position || a.position || 0) - (b.tour_position || b.position || 0)), [projects]);
  if (!features.length) return null;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>FEATURE MAP</Text>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Open the live product areas.</Text>
        </View>
        <Text style={[styles.sectionCount, { color: colors.textMuted }]}>{features.length} areas</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.featureList} decelerationRate="fast">
        {features.map((feature, index) => <FeatureCard colors={colors} feature={feature} index={index} key={feature.id} onDemo={onDemo} publicMode={publicMode} />)}
      </ScrollView>
    </View>
  );
}

function FeatureCard({ colors, feature, index, onDemo, publicMode }: { colors: PortfolioColors; feature: PortfolioFeature & { projectTitle?: string }; index: number; onDemo: DemoAction; publicMode: boolean }) {
  const router = useRouter();
  const route = nativeRouteForDemoPath(feature.demo_path);
  const openFeature = async () => {
    if (publicMode) await onDemo(route);
    else router.push(route as never);
  };
  return (
    <Pressable accessibilityRole="button" onPress={openFeature} style={[styles.feature, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {feature.screenshot_url ? <Image accessibilityLabel={feature.alt_text || feature.title} contentFit="cover" source={{ uri: absoluteAssetUrl(feature.screenshot_url) }} style={[styles.featureImage, { backgroundColor: colors.surfaceMuted }]} transition={180} /> : <View style={[styles.featureImage, styles.featureFallback, { backgroundColor: colors.surfaceMuted }]}><Layers3 color={colors.primary} size={25} /></View>}
      <View style={styles.featureBody}>
        <Text style={[styles.featureCategory, { color: colors.primary }]}>{String(index + 1).padStart(2, '0')} / {feature.category.toUpperCase()}</Text>
        <Text numberOfLines={2} style={[styles.featureTitle, { color: colors.text }]}>{feature.title}</Text>
        <Text numberOfLines={4} style={[styles.featureSummary, { color: colors.textMuted }]}>{feature.summary}</Text>
        {feature.review_notes ? <Text numberOfLines={3} style={[styles.featureNote, { color: colors.text, backgroundColor: colors.surfaceMuted }]}>{feature.review_notes}</Text> : null}
        <View style={styles.openRoute}><Text style={[styles.openRouteText, { color: colors.primary }]}>{publicMode ? 'Open in demo' : 'Open screen'}</Text><ArrowUpRight color={colors.primary} size={16} /></View>
      </View>
    </Pressable>
  );
}

function SocialContactSection({ colors, profile, publicMode }: { colors: PortfolioColors; profile: PortfolioProfile | null; publicMode: boolean }) {
  const links = socialLinks(profile);
  const contactUrl = `${(process.env.EXPO_PUBLIC_WEB_URL || '').replace(/\/$/, '')}/contact`;
  if (!links.length && !publicMode) return null;

  return (
    <View style={[styles.socialBand, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.eyebrow, { color: colors.primary }]}>CONTACT</Text>
      <Text style={[styles.footerTitle, { color: colors.text }]}>Review the work or start a conversation.</Text>
      <View style={styles.socialActions}>
        {links.map((link) => <ActionButton colors={colors} icon={ExternalLink} key={link.label} label={link.label} onPress={() => openUrl(link.url)} />)}
        {publicMode && process.env.EXPO_PUBLIC_WEB_URL ? <ActionButton colors={colors} icon={MessageCircle} label="Contact form" onPress={() => openUrl(contactUrl)} primary /> : null}
      </View>
    </View>
  );
}

function PublicFooter({ colors, onDemo }: { colors: PortfolioColors; onDemo: DemoAction }) {
  return (
    <View style={[styles.footer, { borderTopColor: colors.border }]}>
      <Image accessibilityLabel="Nexus Hub" contentFit="contain" source={require('../../assets/images/nexus-logo.webp')} style={styles.footerLogo} />
      <Text style={[styles.footerTitle, { color: colors.text }]}>Bring the work into one focused workspace.</Text>
      <Text style={[styles.footerText, { color: colors.textMuted }]}>Projects, delivery, knowledge, collaboration, and document workflows are ready to inspect in the read-only demo.</Text>
      <ActionButton colors={colors} icon={PlayCircle} label="View demo" onPress={() => onDemo('/more/demo')} primary />
      <Text style={[styles.copyright, { color: colors.textMuted }]}>Nexus Hub</Text>
    </View>
  );
}

function PortfolioSkeleton({ colors }: { colors: PortfolioColors }) {
  return <View accessibilityLabel="Loading portfolio" style={styles.skeleton}><View style={[styles.skeletonAvatar, { backgroundColor: colors.surfaceMuted }]} /><View style={styles.skeletonCopy}><View style={[styles.skeletonLine, { backgroundColor: colors.surfaceMuted, width: '74%' }]} /><View style={[styles.skeletonLine, { backgroundColor: colors.surfaceMuted, width: '92%' }]} /><View style={[styles.skeletonLine, { backgroundColor: colors.surfaceMuted, width: '58%' }]} /></View><View style={[styles.skeletonHero, { backgroundColor: colors.surfaceMuted }]} /><View style={[styles.skeletonLine, { backgroundColor: colors.surfaceMuted, marginTop: 28, width: '42%' }]} /><View style={[styles.skeletonCover, { backgroundColor: colors.surfaceMuted }]} /></View>;
}

function ActionButton({ colors, icon: Icon, label, onPress, primary = false }: { colors: PortfolioColors; icon: LucideIcon; label: string; onPress: () => void; primary?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.action, { backgroundColor: primary ? colors.primary : colors.surface, borderColor: primary ? colors.primary : colors.border }]}><Icon color={primary ? '#ffffff' : colors.text} size={17} /><Text style={[styles.actionLabel, { color: primary ? '#ffffff' : colors.text }]}>{label}</Text></Pressable>;
}

function IconButton({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={styles.iconButton}>{children}</Pressable>;
}

function featuredProject(projects: PortfolioProject[]) {
  return projects.find((project) => project.featured) || projects[0];
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

function normalizeCaseStudy(caseStudy?: PortfolioCaseStudy | null) {
  const source = caseStudy || {};
  return {
    problem: String(source.problem || fallbackCaseStudy.problem),
    role: String(source.role || fallbackCaseStudy.role),
    constraints: listFrom(source.constraints, fallbackCaseStudy.constraints),
    decisions: listFrom(source.decisions, fallbackCaseStudy.decisions),
    trade_offs: listFrom(source.trade_offs, fallbackCaseStudy.trade_offs),
    outcomes: listFrom(source.outcomes, fallbackCaseStudy.outcomes),
  };
}

function listFrom(value: unknown, fallback: string[]) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return fallback;
}

function nativeRouteForDemoPath(path?: string | null) {
  const value = (path || '').toLowerCase();
  if (!value || value === '/' || value.startsWith('/demo')) return '/more/demo';
  if (value.startsWith('/projects')) return '/projects';
  if (value.startsWith('/momentum')) return '/more/momentum';
  if (value.startsWith('/calendar')) return '/more/calendar';
  if (value.startsWith('/worklog') || value.startsWith('/my-work')) return '/work';
  if (value.startsWith('/posts') || value.startsWith('/chat') || value.startsWith('/notifications')) return '/inbox';
  if (value.startsWith('/knowledge')) return '/more/knowledge';
  if (value.startsWith('/pdf')) return '/more/pdf';
  if (value.startsWith('/teams')) return '/more/teams';
  if (value.startsWith('/departments')) return '/more/departments';
  if (value.startsWith('/vault')) return '/more/vault';
  if (value.startsWith('/admin/portfolio')) return '/more/portfolio-admin';
  return '/more/demo';
}

function socialLinks(profile: PortfolioProfile | null) {
  const links = profile?.social_links || {};
  return [
    links.github ? { label: 'GitHub', url: links.github } : null,
    links.linkedin ? { label: 'LinkedIn', url: links.linkedin } : null,
    links.website ? { label: 'Website', url: links.website } : null,
  ].filter(Boolean) as Array<{ label: string; url: string }>;
}

function profileInitials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'NH';
}

function openUrl(url?: string | null) {
  if (url) void WebBrowser.openBrowserAsync(url);
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  publicScreen: { flex: 1 },
  scroll: { alignSelf: 'center', paddingBottom: 64, width: '100%' },
  publicScroll: { paddingTop: 6 },
  publicHeader: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 68, paddingHorizontal: 16 },
  publicHeaderActions: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  brand: { alignItems: 'center', flex: 1, flexDirection: 'row', flexShrink: 1, minWidth: 0 },
  logo: { borderRadius: 7, height: 40, marginRight: 10, width: 40 },
  brandName: { fontSize: 17, fontWeight: '900' },
  brandDetail: { fontSize: 8, fontWeight: '800', letterSpacing: 0, marginTop: 2 },
  headerDemoButton: { alignItems: 'center', borderRadius: 7, flexDirection: 'row', gap: 6, minHeight: 42, paddingHorizontal: 11 },
  headerDemoLabel: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  signInButton: { alignItems: 'center', borderRadius: 7, borderWidth: 1, flexDirection: 'row', flexShrink: 0, gap: 7, minHeight: 42, paddingHorizontal: 11 },
  signInLabel: { fontSize: 13, fontWeight: '800' },
  iconButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  hero: { overflow: 'hidden', paddingHorizontal: 20, paddingBottom: 30, paddingTop: 28 },
  publicHero: { paddingTop: 34 },
  heroHalo: { borderRadius: 999, height: 190, opacity: 0.78, position: 'absolute', right: -66, top: -76, width: 190 },
  identity: { alignItems: 'center', flexDirection: 'row' },
  avatar: { borderRadius: 8, height: 88, width: 88 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { color: '#ffffff', fontSize: 25, fontWeight: '900' },
  identityCopy: { flex: 1, marginLeft: 16, minWidth: 0 },
  heroKicker: { fontSize: 9, fontWeight: '900', letterSpacing: 0 },
  name: { fontSize: 28, fontWeight: '900', letterSpacing: 0, lineHeight: 32, marginTop: 5 },
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
  demoError: { fontSize: 12, lineHeight: 18, marginTop: 12 },
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
  section: { paddingHorizontal: 20, paddingTop: 34 },
  sectionHeader: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  eyebrow: { fontSize: 9, fontWeight: '900', letterSpacing: 0 },
  sectionTitle: { fontSize: 22, fontWeight: '900', letterSpacing: 0, lineHeight: 28, marginTop: 5 },
  sectionCount: { fontSize: 11, marginTop: 10 },
  featured: { borderRadius: 4, fontSize: 9, fontWeight: '900', overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 4 },
  tagline: { fontSize: 14, lineHeight: 20, marginTop: 8 },
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
  decisionGrid: { gap: 10, marginTop: 16 },
  decisionCard: { borderRadius: 8, borderWidth: 1, padding: 15 },
  decisionTitle: { fontSize: 14, fontWeight: '900', marginTop: 10 },
  decisionBody: { fontSize: 13, lineHeight: 20, marginTop: 7 },
  listGrid: { gap: 10, marginTop: 10 },
  listCard: { borderRadius: 8, borderWidth: 1, padding: 15 },
  listTitle: { fontSize: 14, fontWeight: '900', marginBottom: 5 },
  listItem: { alignItems: 'flex-start', flexDirection: 'row', gap: 8, marginTop: 9 },
  listItemText: { flex: 1, fontSize: 12, lineHeight: 18 },
  architectureBand: { borderBottomWidth: 1, borderTopWidth: 1, marginTop: 34, paddingHorizontal: 20, paddingVertical: 24 },
  architectureList: { gap: 9, marginTop: 15 },
  architectureRow: { alignItems: 'center', borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 11, minHeight: 52, paddingHorizontal: 12 },
  architectureIndex: { fontSize: 11, fontWeight: '900' },
  architectureText: { flex: 1, fontSize: 14, fontWeight: '700', lineHeight: 19 },
  architectureTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 16 },
  architectureTag: { borderRadius: 5, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 5 },
  architectureTagText: { fontSize: 10, fontWeight: '700' },
  featureList: { gap: 10, paddingRight: 20, paddingTop: 13 },
  feature: { borderRadius: 8, borderWidth: 1, overflow: 'hidden', width: 296 },
  featureImage: { aspectRatio: 16 / 9, width: '100%' },
  featureFallback: { alignItems: 'center', justifyContent: 'center' },
  featureBody: { padding: 13 },
  featureCategory: { fontSize: 9, fontWeight: '900', letterSpacing: 0 },
  featureTitle: { fontSize: 15, fontWeight: '800', lineHeight: 20, marginTop: 6 },
  featureSummary: { fontSize: 12, lineHeight: 18, marginTop: 5 },
  featureNote: { borderRadius: 6, fontSize: 11, lineHeight: 16, marginTop: 9, overflow: 'hidden', padding: 9 },
  openRoute: { alignItems: 'center', flexDirection: 'row', gap: 5, marginTop: 11 },
  openRouteText: { fontSize: 12, fontWeight: '900' },
  socialBand: { borderRadius: 8, borderWidth: 1, marginHorizontal: 20, marginTop: 34, padding: 18 },
  socialActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 15 },
  footer: { alignItems: 'flex-start', borderTopWidth: StyleSheet.hairlineWidth, marginHorizontal: 20, marginTop: 42, paddingTop: 30 },
  footerLogo: { borderRadius: 7, height: 42, width: 42 },
  footerTitle: { fontSize: 21, fontWeight: '900', letterSpacing: 0, lineHeight: 27, marginTop: 15 },
  footerText: { fontSize: 13, lineHeight: 20, marginBottom: 17, marginTop: 7, maxWidth: 420 },
  copyright: { fontSize: 10, fontWeight: '700', marginTop: 28 },
  skeleton: { padding: 20 },
  skeletonAvatar: { borderRadius: 8, height: 88, width: 88 },
  skeletonCopy: { gap: 10, left: 124, position: 'absolute', right: 20, top: 30 },
  skeletonLine: { borderRadius: 5, height: 13 },
  skeletonHero: { borderRadius: 6, height: 76, marginTop: 22, width: '100%' },
  skeletonCover: { aspectRatio: 16 / 9, borderRadius: 8, marginTop: 17, width: '100%' },
});
