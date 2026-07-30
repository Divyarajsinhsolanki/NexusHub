import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { ArrowDown, ArrowLeft, ArrowUp, Camera, ChevronRight, FileText, ImagePlus, Pencil, Plus, Trash2, X, type LucideIcon } from 'lucide-react-native';
import { ReactNode, useEffect, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { absoluteAssetUrl, apiErrorMessage } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { PortfolioFeature, PortfolioProfile, PortfolioProject } from '../api/types';
import { PageHeader } from '../components/PageHeader';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { SegmentedControl } from '../components/SegmentedControl';
import { EmptyState, ErrorState, LoadingState } from '../components/StateView';
import { useAppTheme } from '../theme';

type Mode = 'profile' | 'projects';
type ProfileDraft = {
  full_name: string;
  headline: string;
  location: string;
  summary: string;
  skills: string;
  metrics: string;
  architecture: string;
  engineering_highlights: string;
  social_github: string;
  social_linkedin: string;
  social_website: string;
  published: boolean;
};
type ProjectDraft = {
  title: string;
  slug: string;
  tagline: string;
  summary: string;
  description: string;
  stack: string;
  metrics: string;
  engineering_highlights: string;
  repository_url: string;
  live_url: string;
  position: string;
  case_study_problem: string;
  case_study_role: string;
  case_study_constraints: string;
  case_study_decisions: string;
  case_study_trade_offs: string;
  case_study_outcomes: string;
  seo_title: string;
  seo_description: string;
  seo_canonical_path: string;
  featured: boolean;
  published: boolean;
};
type FeatureDraft = { category: string; title: string; summary: string; demo_path: string; alt_text: string; review_notes: string; position: string; tour_position: string; published: boolean };

const emptyProfile: ProfileDraft = { full_name: '', headline: '', location: '', summary: '', skills: '', metrics: '', architecture: '', engineering_highlights: '', social_github: '', social_linkedin: '', social_website: '', published: false };
const emptyProject: ProjectDraft = { title: '', slug: '', tagline: '', summary: '', description: '', stack: '', metrics: '', engineering_highlights: '', repository_url: '', live_url: '', position: '0', case_study_problem: '', case_study_role: '', case_study_constraints: '', case_study_decisions: '', case_study_trade_offs: '', case_study_outcomes: '', seo_title: '', seo_description: '', seo_canonical_path: '', featured: false, published: false };
const emptyFeature: FeatureDraft = { category: '', title: '', summary: '', demo_path: '', alt_text: '', review_notes: '', position: '0', tour_position: '0', published: false };

export function PortfolioAdminScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>('profile');
  const portfolio = useQuery({ queryKey: ['portfolio-admin'], queryFn: endpoints.portfolioAdmin });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['portfolio-admin'] });

  return (
    <Screen header={<PageHeader leading={<Pressable accessibilityLabel="Back" onPress={() => router.back()} style={styles.iconButton}><ArrowLeft color={theme.text} size={22} /></Pressable>} title="Portfolio admin" subtitle="Published profile, projects, and tour media" />}>
      <View style={styles.segment}><SegmentedControl value={mode} onChange={setMode} options={[{ value: 'profile', label: 'Profile' }, { value: 'projects', label: 'Projects' }]} /></View>
      {portfolio.isLoading ? <LoadingState label="Loading portfolio editor" /> : null}
      {portfolio.isError ? <ErrorState message={apiErrorMessage(portfolio.error)} onRetry={() => portfolio.refetch()} /> : null}
      {portfolio.data && mode === 'profile' ? <ProfileEditor profile={portfolio.data.profile} onSaved={refresh} /> : null}
      {portfolio.data && mode === 'projects' ? <ProjectManager projects={portfolio.data.projects} onSaved={refresh} /> : null}
    </Screen>
  );
}

function ProfileEditor({ profile, onSaved }: { profile: PortfolioProfile | null; onSaved: () => Promise<unknown> }) {
  const theme = useAppTheme();
  const [draft, setDraft] = useState<ProfileDraft>(emptyProfile);
  const [avatar, setAvatar] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [resume, setResume] = useState<DocumentPicker.DocumentPickerAsset | null>(null);

  useEffect(() => {
    setDraft(profile ? {
      full_name: profile.full_name || '', headline: profile.headline || '', location: profile.location || '', summary: profile.summary || '',
      skills: toLines(profile.skills),
      metrics: toLines(profile.metrics),
      architecture: toLines(profile.architecture),
      engineering_highlights: toLines(profile.engineering_highlights),
      social_github: profile.social_links?.github || '',
      social_linkedin: profile.social_links?.linkedin || '',
      social_website: profile.social_links?.website || '',
      published: Boolean(profile.published),
    } : emptyProfile);
  }, [profile]);

  const save = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      appendText(form, 'portfolio_profile', draft, ['skills', 'metrics', 'architecture', 'engineering_highlights', 'social_github', 'social_linkedin', 'social_website']);
      splitLines(draft.skills).forEach((value) => form.append('portfolio_profile[skills][]', value));
      splitLines(draft.metrics).forEach((value) => form.append('portfolio_profile[metrics][]', value));
      splitLines(draft.architecture).forEach((value) => form.append('portfolio_profile[architecture][]', value));
      splitLines(draft.engineering_highlights).forEach((value) => form.append('portfolio_profile[engineering_highlights][]', value));
      form.append('portfolio_profile[social_links][github]', draft.social_github);
      form.append('portfolio_profile[social_links][linkedin]', draft.social_linkedin);
      form.append('portfolio_profile[social_links][website]', draft.social_website);
      if (avatar) form.append('portfolio_profile[avatar]', uploadPart(avatar.uri, avatar.fileName || 'avatar.jpg', avatar.mimeType || 'image/jpeg'));
      if (resume) form.append('portfolio_profile[resume]', uploadPart(resume.uri, resume.name, resume.mimeType || 'application/pdf'));
      return endpoints.updatePortfolioProfile(form);
    },
    onSuccess: async () => { setAvatar(null); setResume(null); await onSaved(); },
    onError: (error) => Alert.alert('Unable to save portfolio profile', apiErrorMessage(error)),
  });
  const chooseAvatar = async () => { const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.88 }); if (!result.canceled) setAvatar(result.assets[0]); };
  const chooseResume = async () => { const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true }); if (!result.canceled) setResume(result.assets[0]); };

  return (
    <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
      <View style={styles.mediaRow}>
        {avatar?.uri || profile?.avatar_url ? <Image contentFit="cover" source={{ uri: avatar?.uri || absoluteAssetUrl(profile?.avatar_url) }} style={styles.avatar} /> : <View style={[styles.avatar, styles.mediaFallback, { backgroundColor: theme.surfaceMuted }]}><Camera color={theme.primary} size={25} /></View>}
        <View style={styles.flex}><Text style={[styles.mediaTitle, { color: theme.text }]}>Profile media</Text><Text style={[styles.help, { color: theme.textMuted }]}>Square avatar and a PDF resume.</Text><View style={styles.inlineActions}><SmallButton icon={ImagePlus} label={avatar ? 'Image selected' : 'Choose avatar'} onPress={chooseAvatar} /><SmallButton icon={FileText} label={resume?.name || 'Choose resume'} onPress={chooseResume} /></View></View>
      </View>
      <Field label="Full name" value={draft.full_name} onChangeText={(value) => setDraft({ ...draft, full_name: value })} />
      <Field label="Headline" value={draft.headline} onChangeText={(value) => setDraft({ ...draft, headline: value })} />
      <Field label="Location" value={draft.location} onChangeText={(value) => setDraft({ ...draft, location: value })} />
      <Field label="Summary" multiline value={draft.summary} onChangeText={(value) => setDraft({ ...draft, summary: value })} />
      <Field help="One skill per line" label="Skills" multiline value={draft.skills} onChangeText={(value) => setDraft({ ...draft, skills: value })} />
      <Field help="One metric per line" label="Metrics" multiline value={draft.metrics} onChangeText={(value) => setDraft({ ...draft, metrics: value })} />
      <Field help="One architecture note per line" label="Architecture" multiline value={draft.architecture} onChangeText={(value) => setDraft({ ...draft, architecture: value })} />
      <Field help="One highlight per line" label="Engineering highlights" multiline value={draft.engineering_highlights} onChangeText={(value) => setDraft({ ...draft, engineering_highlights: value })} />
      <Field label="GitHub URL" value={draft.social_github} onChangeText={(value) => setDraft({ ...draft, social_github: value })} />
      <Field label="LinkedIn URL" value={draft.social_linkedin} onChangeText={(value) => setDraft({ ...draft, social_linkedin: value })} />
      <Field label="Website URL" value={draft.social_website} onChangeText={(value) => setDraft({ ...draft, social_website: value })} />
      <Toggle label="Published" detail="Show this profile in the public portfolio." value={draft.published} onValueChange={(value) => setDraft({ ...draft, published: value })} />
      <PrimaryButton disabled={!draft.full_name.trim() || !draft.headline.trim() || !draft.summary.trim()} label="Save profile" loading={save.isPending} onPress={() => save.mutate()} />
    </ScrollView>
  );
}

function ProjectManager({ projects, onSaved }: { projects: PortfolioProject[]; onSaved: () => Promise<unknown> }) {
  const theme = useAppTheme();
  const [editing, setEditing] = useState<PortfolioProject | null | undefined>(undefined);
  const [featuresFor, setFeaturesFor] = useState<number | null>(null);
  const featureProject = projects.find((project) => project.id === featuresFor) || null;
  const order = useMutation({
    mutationFn: (payload: { projects?: Array<{ id: number; position: number }>; features?: Array<{ id: number; position: number; tour_position?: number }> }) => endpoints.updatePortfolioOrder(payload),
    onSuccess: async () => { await onSaved(); },
    onError: (error) => Alert.alert('Unable to update order', apiErrorMessage(error)),
  });
  const moveProject = (projectId: number, direction: -1 | 1) => {
    const rows = [...projects].sort((a, b) => (a.position || 0) - (b.position || 0) || a.id - b.id);
    const index = rows.findIndex((project) => project.id === projectId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= rows.length) return;
    [rows[index], rows[nextIndex]] = [rows[nextIndex], rows[index]];
    order.mutate({ projects: rows.map((project, position) => ({ id: project.id, position: position + 1 })) });
  };

  return (
    <View style={styles.flex}>
      <FlatList
        contentContainerStyle={styles.list}
        data={projects}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={<Pressable accessibilityRole="button" onPress={() => setEditing(null)} style={[styles.newRow, { borderColor: theme.primary }]}><Plus color={theme.primary} size={19} /><Text style={[styles.newLabel, { color: theme.primary }]}>New portfolio project</Text></Pressable>}
        ListEmptyComponent={<EmptyState title="No portfolio projects" message="Create the first published case study." />}
        renderItem={({ item }) => (
          <View style={[styles.projectRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {item.cover_image_url ? <Image contentFit="cover" source={{ uri: absoluteAssetUrl(item.cover_image_url) }} style={styles.projectThumb} /> : <View style={[styles.projectThumb, styles.mediaFallback, { backgroundColor: theme.surfaceMuted }]}><ImagePlus color={theme.primary} size={21} /></View>}
            <View style={styles.flex}><View style={styles.titleLine}><Text numberOfLines={1} style={[styles.rowTitle, { color: theme.text }]}>{item.title}</Text>{item.published ? <Text style={[styles.status, { color: theme.success }]}>LIVE</Text> : <Text style={[styles.status, { color: theme.textMuted }]}>DRAFT</Text>}</View><Text numberOfLines={1} style={[styles.rowMeta, { color: theme.textMuted }]}>{item.features.length} features · {item.stack.join(', ') || 'No stack'}</Text><View style={styles.rowActions}><SmallButton disabled={order.isPending} icon={ArrowUp} label="Up" onPress={() => moveProject(item.id, -1)} /><SmallButton disabled={order.isPending} icon={ArrowDown} label="Down" onPress={() => moveProject(item.id, 1)} /><SmallButton icon={Pencil} label="Edit" onPress={() => setEditing(item)} /><SmallButton icon={ChevronRight} label="Features" onPress={() => setFeaturesFor(item.id)} /></View></View>
          </View>
        )}
      />
      <ProjectEditor editing={editing} onClose={() => setEditing(undefined)} onSaved={onSaved} />
      <FeatureManager onClose={() => setFeaturesFor(null)} onSaved={onSaved} project={featureProject} />
    </View>
  );
}

function ProjectEditor({ editing, onClose, onSaved }: { editing: PortfolioProject | null | undefined; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const theme = useAppTheme();
  const [draft, setDraft] = useState<ProjectDraft>(emptyProject);
  const [cover, setCover] = useState<ImagePicker.ImagePickerAsset | null>(null);
  useEffect(() => {
    setDraft(editing ? {
      title: editing.title,
      slug: editing.slug,
      tagline: editing.tagline || '',
      summary: editing.summary,
      description: editing.description || '',
      stack: toLines(editing.stack),
      metrics: toLines(editing.metrics),
      engineering_highlights: toLines(editing.engineering_highlights),
      repository_url: editing.repository_url || '',
      live_url: editing.live_url || '',
      position: String(editing.position || 0),
      case_study_problem: String(editing.case_study?.problem || ''),
      case_study_role: String(editing.case_study?.role || ''),
      case_study_constraints: toLines(editing.case_study?.constraints),
      case_study_decisions: toLines(editing.case_study?.decisions),
      case_study_trade_offs: toLines(editing.case_study?.trade_offs),
      case_study_outcomes: toLines(editing.case_study?.outcomes),
      seo_title: String(editing.seo?.title || ''),
      seo_description: String(editing.seo?.description || ''),
      seo_canonical_path: String(editing.seo?.canonical_path || ''),
      featured: Boolean(editing.featured),
      published: Boolean(editing.published),
    } : emptyProject);
    setCover(null);
  }, [editing]);
  const save = useMutation({
    mutationFn: () => {
      const form = new FormData();
      appendText(form, 'portfolio_project', draft, [
        'stack',
        'metrics',
        'engineering_highlights',
        'case_study_problem',
        'case_study_role',
        'case_study_constraints',
        'case_study_decisions',
        'case_study_trade_offs',
        'case_study_outcomes',
        'seo_title',
        'seo_description',
        'seo_canonical_path',
      ]);
      splitLines(draft.stack).forEach((value) => form.append('portfolio_project[stack][]', value));
      splitLines(draft.metrics).forEach((value) => form.append('portfolio_project[metrics][]', value));
      splitLines(draft.engineering_highlights).forEach((value) => form.append('portfolio_project[engineering_highlights][]', value));
      form.append('portfolio_project[case_study][problem]', draft.case_study_problem);
      form.append('portfolio_project[case_study][role]', draft.case_study_role);
      splitLines(draft.case_study_constraints).forEach((value) => form.append('portfolio_project[case_study][constraints][]', value));
      splitLines(draft.case_study_decisions).forEach((value) => form.append('portfolio_project[case_study][decisions][]', value));
      splitLines(draft.case_study_trade_offs).forEach((value) => form.append('portfolio_project[case_study][trade_offs][]', value));
      splitLines(draft.case_study_outcomes).forEach((value) => form.append('portfolio_project[case_study][outcomes][]', value));
      form.append('portfolio_project[seo][title]', draft.seo_title);
      form.append('portfolio_project[seo][description]', draft.seo_description);
      form.append('portfolio_project[seo][canonical_path]', draft.seo_canonical_path);
      if (cover) form.append('portfolio_project[cover_image]', uploadPart(cover.uri, cover.fileName || 'cover.jpg', cover.mimeType || 'image/jpeg'));
      return editing ? endpoints.updatePortfolioProject(editing.id, form) : endpoints.createPortfolioProject(form);
    },
    onSuccess: async () => { await onSaved(); onClose(); },
    onError: (error) => Alert.alert('Unable to save project', apiErrorMessage(error)),
  });
  const remove = useMutation({ mutationFn: () => endpoints.deletePortfolioProject(editing!.id), onSuccess: async () => { await onSaved(); onClose(); }, onError: (error) => Alert.alert('Unable to delete project', apiErrorMessage(error)) });
  const chooseCover = async () => { const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.88 }); if (!result.canceled) setCover(result.assets[0]); };

  return (
    <EditorModal title={editing ? 'Edit project' : 'New project'} visible={editing !== undefined} onClose={onClose}>
      <Pressable onPress={chooseCover} style={[styles.coverPicker, { backgroundColor: theme.surface, borderColor: theme.border }]}>{cover?.uri || editing?.cover_image_url ? <Image contentFit="cover" source={{ uri: cover?.uri || absoluteAssetUrl(editing?.cover_image_url) }} style={styles.coverPreview} /> : <><ImagePlus color={theme.primary} size={27} /><Text style={[styles.pickerLabel, { color: theme.text }]}>Choose cover image</Text></>}</Pressable>
      <Field label="Title" value={draft.title} onChangeText={(value) => setDraft({ ...draft, title: value })} />
      <Field label="Slug" value={draft.slug} onChangeText={(value) => setDraft({ ...draft, slug: slugify(value) })} />
      <Field label="Tagline" value={draft.tagline} onChangeText={(value) => setDraft({ ...draft, tagline: value })} />
      <Field label="Summary" multiline value={draft.summary} onChangeText={(value) => setDraft({ ...draft, summary: value })} />
      <Field label="Description" multiline value={draft.description} onChangeText={(value) => setDraft({ ...draft, description: value })} />
      <Field help="One technology per line" label="Stack" multiline value={draft.stack} onChangeText={(value) => setDraft({ ...draft, stack: value })} />
      <Field help="One metric per line" label="Metrics" multiline value={draft.metrics} onChangeText={(value) => setDraft({ ...draft, metrics: value })} />
      <Field help="One highlight per line" label="Engineering highlights" multiline value={draft.engineering_highlights} onChangeText={(value) => setDraft({ ...draft, engineering_highlights: value })} />
      <Field label="Live URL" value={draft.live_url} onChangeText={(value) => setDraft({ ...draft, live_url: value })} />
      <Field label="Repository URL" value={draft.repository_url} onChangeText={(value) => setDraft({ ...draft, repository_url: value })} />
      <Field keyboardType="number-pad" label="Position" value={draft.position} onChangeText={(value) => setDraft({ ...draft, position: value })} />
      <Text style={[styles.sectionTitle, { color: theme.text }]}>Case study</Text>
      <Field label="Problem" multiline value={draft.case_study_problem} onChangeText={(value) => setDraft({ ...draft, case_study_problem: value })} />
      <Field label="Role" multiline value={draft.case_study_role} onChangeText={(value) => setDraft({ ...draft, case_study_role: value })} />
      <Field help="One constraint per line" label="Constraints" multiline value={draft.case_study_constraints} onChangeText={(value) => setDraft({ ...draft, case_study_constraints: value })} />
      <Field help="One decision per line" label="Technical decisions" multiline value={draft.case_study_decisions} onChangeText={(value) => setDraft({ ...draft, case_study_decisions: value })} />
      <Field help="One trade-off per line" label="Trade-offs" multiline value={draft.case_study_trade_offs} onChangeText={(value) => setDraft({ ...draft, case_study_trade_offs: value })} />
      <Field help="One outcome per line" label="Outcomes" multiline value={draft.case_study_outcomes} onChangeText={(value) => setDraft({ ...draft, case_study_outcomes: value })} />
      <Text style={[styles.sectionTitle, { color: theme.text }]}>Search preview</Text>
      <Field label="SEO title" value={draft.seo_title} onChangeText={(value) => setDraft({ ...draft, seo_title: value })} />
      <Field label="SEO description" multiline value={draft.seo_description} onChangeText={(value) => setDraft({ ...draft, seo_description: value })} />
      <Field label="Canonical path" value={draft.seo_canonical_path} onChangeText={(value) => setDraft({ ...draft, seo_canonical_path: value })} />
      <Toggle label="Featured" detail="Highlight this case study." value={draft.featured} onValueChange={(value) => setDraft({ ...draft, featured: value })} />
      <Toggle label="Published" detail="Show this project publicly." value={draft.published} onValueChange={(value) => setDraft({ ...draft, published: value })} />
      <PrimaryButton disabled={!draft.title.trim() || !draft.slug.trim() || !draft.summary.trim()} label="Save project" loading={save.isPending} onPress={() => save.mutate()} />
      {editing ? <DeleteButton label="Delete project" onPress={() => Alert.alert('Delete project?', 'Its portfolio features will also be removed.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => remove.mutate() }])} /> : null}
    </EditorModal>
  );
}

function FeatureManager({ project, onClose, onSaved }: { project: PortfolioProject | null; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const theme = useAppTheme();
  const [editing, setEditing] = useState<PortfolioFeature | null | undefined>(undefined);
  const order = useMutation({
    mutationFn: (payload: { projects?: Array<{ id: number; position: number }>; features?: Array<{ id: number; position: number; tour_position?: number }> }) => endpoints.updatePortfolioOrder(payload),
    onSuccess: async () => { await onSaved(); },
    onError: (error) => Alert.alert('Unable to update feature order', apiErrorMessage(error)),
  });
  const moveFeature = (featureId: number, direction: -1 | 1) => {
    const rows = [...(project?.features || [])].sort((a, b) => (a.position || 0) - (b.position || 0) || a.id - b.id);
    const index = rows.findIndex((feature) => feature.id === featureId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= rows.length) return;
    [rows[index], rows[nextIndex]] = [rows[nextIndex], rows[index]];
    order.mutate({ features: rows.map((feature, position) => ({ id: feature.id, position: position + 1, tour_position: position + 1 })) });
  };
  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={Boolean(project)}>
      <View style={[styles.modal, { backgroundColor: theme.background }]}>
        <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}><Pressable accessibilityLabel="Close feature manager" onPress={onClose} style={styles.iconButton}><X color={theme.text} size={22} /></Pressable><View style={styles.modalCopy}><Text style={[styles.modalTitle, { color: theme.text }]}>Project features</Text><Text numberOfLines={1} style={[styles.modalSubtitle, { color: theme.textMuted }]}>{project?.title}</Text></View><Pressable accessibilityLabel="Add feature" onPress={() => setEditing(null)} style={styles.iconButton}><Plus color={theme.primary} size={22} /></Pressable></View>
        <FlatList contentContainerStyle={styles.list} data={project?.features || []} keyExtractor={(item) => String(item.id)} ListEmptyComponent={<EmptyState title="No feature stories" message="Add screenshots and review notes for the guided portfolio tour." />} renderItem={({ item }) => <View style={[styles.featureRow, { borderBottomColor: theme.border }]}>{item.screenshot_url ? <Image contentFit="cover" source={{ uri: absoluteAssetUrl(item.screenshot_url) }} style={styles.featureThumb} /> : <View style={[styles.featureThumb, styles.mediaFallback, { backgroundColor: theme.surfaceMuted }]}><ImagePlus color={theme.primary} size={19} /></View>}<View style={styles.flex}><Text style={[styles.rowTitle, { color: theme.text }]}>{item.title}</Text><Text numberOfLines={1} style={[styles.rowMeta, { color: theme.textMuted }]}>{item.category} · {item.published ? 'Published' : 'Draft'}</Text><View style={styles.rowActions}><SmallButton disabled={order.isPending} icon={ArrowUp} label="Up" onPress={() => moveFeature(item.id, -1)} /><SmallButton disabled={order.isPending} icon={ArrowDown} label="Down" onPress={() => moveFeature(item.id, 1)} /><SmallButton icon={Pencil} label="Edit" onPress={() => setEditing(item)} /></View></View></View>} />
        {project ? <FeatureEditor editing={editing} onClose={() => setEditing(undefined)} onSaved={onSaved} projectId={project.id} /> : null}
      </View>
    </Modal>
  );
}

function FeatureEditor({ editing, projectId, onClose, onSaved }: { editing: PortfolioFeature | null | undefined; projectId: number; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const theme = useAppTheme();
  const [draft, setDraft] = useState<FeatureDraft>(emptyFeature);
  const [screenshot, setScreenshot] = useState<ImagePicker.ImagePickerAsset | null>(null);
  useEffect(() => {
    setDraft(editing ? { category: editing.category, title: editing.title, summary: editing.summary, demo_path: editing.demo_path || '', alt_text: editing.alt_text || '', review_notes: editing.review_notes || '', position: String(editing.position || 0), tour_position: String(editing.tour_position || 0), published: Boolean(editing.published) } : emptyFeature);
    setScreenshot(null);
  }, [editing]);
  const save = useMutation({ mutationFn: () => { const form = new FormData(); appendText(form, 'portfolio_feature', draft); if (screenshot) form.append('portfolio_feature[screenshot]', uploadPart(screenshot.uri, screenshot.fileName || 'feature.jpg', screenshot.mimeType || 'image/jpeg')); return editing ? endpoints.updatePortfolioFeature(editing.id, form) : endpoints.createPortfolioFeature(projectId, form); }, onSuccess: async () => { await onSaved(); onClose(); }, onError: (error) => Alert.alert('Unable to save feature', apiErrorMessage(error)) });
  const remove = useMutation({ mutationFn: () => endpoints.deletePortfolioFeature(editing!.id), onSuccess: async () => { await onSaved(); onClose(); }, onError: (error) => Alert.alert('Unable to delete feature', apiErrorMessage(error)) });
  const chooseScreenshot = async () => { const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.88 }); if (!result.canceled) setScreenshot(result.assets[0]); };
  return <EditorModal title={editing ? 'Edit feature' : 'New feature'} visible={editing !== undefined} onClose={onClose}><Pressable onPress={chooseScreenshot} style={[styles.coverPicker, { backgroundColor: theme.surface, borderColor: theme.border }]}>{screenshot?.uri || editing?.screenshot_url ? <Image contentFit="cover" source={{ uri: screenshot?.uri || absoluteAssetUrl(editing?.screenshot_url) }} style={styles.coverPreview} /> : <><ImagePlus color={theme.primary} size={27} /><Text style={[styles.pickerLabel, { color: theme.text }]}>Choose screenshot</Text></>}</Pressable><Field label="Category" value={draft.category} onChangeText={(value) => setDraft({ ...draft, category: value })} /><Field label="Title" value={draft.title} onChangeText={(value) => setDraft({ ...draft, title: value })} /><Field label="Summary" multiline value={draft.summary} onChangeText={(value) => setDraft({ ...draft, summary: value })} /><Field label="Mobile or web route" value={draft.demo_path} onChangeText={(value) => setDraft({ ...draft, demo_path: value })} /><Field label="Image description" value={draft.alt_text} onChangeText={(value) => setDraft({ ...draft, alt_text: value })} /><Field label="Tour review notes" multiline value={draft.review_notes} onChangeText={(value) => setDraft({ ...draft, review_notes: value })} /><View style={styles.twoColumns}><View style={styles.flex}><Field keyboardType="number-pad" label="Position" value={draft.position} onChangeText={(value) => setDraft({ ...draft, position: value })} /></View><View style={styles.flex}><Field keyboardType="number-pad" label="Tour position" value={draft.tour_position} onChangeText={(value) => setDraft({ ...draft, tour_position: value })} /></View></View><Toggle label="Published" detail="Include in the public case study." value={draft.published} onValueChange={(value) => setDraft({ ...draft, published: value })} /><PrimaryButton disabled={!draft.category.trim() || !draft.title.trim() || !draft.summary.trim()} label="Save feature" loading={save.isPending} onPress={() => save.mutate()} />{editing ? <DeleteButton label="Delete feature" onPress={() => Alert.alert('Delete feature?', 'This cannot be undone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => remove.mutate() }])} /> : null}</EditorModal>;
}

function EditorModal({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) { const theme = useAppTheme(); return <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={visible}><View style={[styles.modal, { backgroundColor: theme.background }]}><View style={[styles.modalHeader, { borderBottomColor: theme.border }]}><Pressable accessibilityLabel="Close editor" onPress={onClose} style={styles.iconButton}><X color={theme.text} size={22} /></Pressable><Text style={[styles.modalTitle, { color: theme.text }]}>{title}</Text><View style={styles.iconButton} /></View><ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">{children}</ScrollView></View></Modal>; }
function Field({ label, help, value, onChangeText, multiline, keyboardType }: { label: string; help?: string; value: string; onChangeText: (value: string) => void; multiline?: boolean; keyboardType?: 'default' | 'number-pad' }) { const theme = useAppTheme(); return <View><Text style={[styles.label, { color: theme.text }]}>{label}</Text>{help ? <Text style={[styles.help, { color: theme.textMuted }]}>{help}</Text> : null}<TextInput accessibilityLabel={label} keyboardType={keyboardType} multiline={multiline} onChangeText={onChangeText} placeholderTextColor={theme.textMuted} style={[styles.field, multiline && styles.multiline, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]} value={value} /></View>; }
function Toggle({ label, detail, value, onValueChange }: { label: string; detail: string; value: boolean; onValueChange: (value: boolean) => void }) { const theme = useAppTheme(); return <View style={[styles.toggle, { backgroundColor: theme.surface, borderColor: theme.border }]}><View style={styles.flex}><Text style={[styles.rowTitle, { color: theme.text }]}>{label}</Text><Text style={[styles.help, { color: theme.textMuted }]}>{detail}</Text></View><Switch accessibilityLabel={label} onValueChange={onValueChange} trackColor={{ false: theme.surfaceMuted, true: theme.primary }} value={value} /></View>; }
function SmallButton({ disabled = false, icon: Icon, label, onPress }: { disabled?: boolean; icon: LucideIcon; label: string; onPress: () => void }) { const theme = useAppTheme(); return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.smallButton, { borderColor: theme.border, opacity: disabled ? 0.5 : 1 }]}><Icon color={theme.primary} size={15} /><Text numberOfLines={1} style={[styles.smallLabel, { color: theme.text }]}>{label}</Text></Pressable>; }
function DeleteButton({ label, onPress }: { label: string; onPress: () => void }) { const theme = useAppTheme(); return <Pressable accessibilityRole="button" onPress={onPress} style={styles.delete}><Trash2 color={theme.danger} size={18} /><Text style={{ color: theme.danger, fontWeight: '800' }}>{label}</Text></Pressable>; }
function splitLines(value?: string) { return (value || '').split(/[\n,]/).map((item) => item.trim()).filter(Boolean); }
function toLines(value?: Array<string | Record<string, unknown>>) { return (value || []).map(lineFrom).filter(Boolean).join('\n'); }
function lineFrom(value: string | Record<string, unknown>) {
  if (typeof value === 'string') return value;
  const metricValue = value.value ?? value.metric ?? value.number;
  const label = value.label ?? value.name ?? value.title;
  return [metricValue, label].filter(Boolean).map(String).join(' ') || JSON.stringify(value);
}
function slugify(value: string) { return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function uploadPart(uri: string, name: string, type: string) { return { uri, name, type } as never; }
function appendText(form: FormData, wrapper: string, values: object, excluded: string[] = []) { Object.entries(values).forEach(([key, value]) => { if (!excluded.includes(key)) form.append(`${wrapper}[${key}]`, String(value)); }); }

const styles = StyleSheet.create({
  flex: { flex: 1 }, segment: { paddingHorizontal: 20, paddingTop: 14 }, list: { gap: 10, padding: 20, paddingBottom: 44 }, formScroll: { gap: 17, padding: 20, paddingBottom: 48 }, iconButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  mediaRow: { alignItems: 'center', flexDirection: 'row', gap: 14 }, avatar: { borderRadius: 8, height: 76, width: 76 }, mediaFallback: { alignItems: 'center', justifyContent: 'center' }, mediaTitle: { fontSize: 16, fontWeight: '800' }, help: { fontSize: 11, lineHeight: 16, marginTop: 3 }, inlineActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 9 },
  smallButton: { alignItems: 'center', borderRadius: 6, borderWidth: 1, flexDirection: 'row', gap: 5, maxWidth: 170, minHeight: 38, paddingHorizontal: 9 }, smallLabel: { fontSize: 11, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '800', marginBottom: 7 }, field: { borderRadius: 8, borderWidth: 1, fontSize: 15, minHeight: 47, paddingHorizontal: 12, paddingVertical: 11 }, multiline: { minHeight: 104, textAlignVertical: 'top' }, sectionTitle: { fontSize: 15, fontWeight: '900', marginTop: 4 },
  toggle: { alignItems: 'center', borderRadius: 8, borderWidth: 1, flexDirection: 'row', minHeight: 66, paddingHorizontal: 13 }, newRow: { alignItems: 'center', borderRadius: 8, borderStyle: 'dashed', borderWidth: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 4, minHeight: 50 }, newLabel: { fontSize: 13, fontWeight: '800' },
  projectRow: { alignItems: 'center', borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 12, padding: 11 }, projectThumb: { borderRadius: 7, height: 78, width: 78 }, titleLine: { alignItems: 'center', flexDirection: 'row', gap: 8 }, rowTitle: { flex: 1, fontSize: 15, fontWeight: '800' }, rowMeta: { fontSize: 11, marginTop: 4 }, status: { fontSize: 9, fontWeight: '900' }, rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 9 },
  modal: { flex: 1 }, modalHeader: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', minHeight: 62, paddingHorizontal: 10 }, modalCopy: { alignItems: 'center', flex: 1 }, modalTitle: { fontSize: 17, fontWeight: '800' }, modalSubtitle: { fontSize: 11, marginTop: 2, maxWidth: 220 },
  coverPicker: { alignItems: 'center', borderRadius: 8, borderStyle: 'dashed', borderWidth: 1, justifyContent: 'center', minHeight: 132, overflow: 'hidden' }, coverPreview: { aspectRatio: 16 / 8, width: '100%' }, pickerLabel: { fontSize: 13, fontWeight: '800', marginTop: 8 }, twoColumns: { flexDirection: 'row', gap: 10 }, delete: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 48 },
  featureRow: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 11, minHeight: 76 }, featureThumb: { borderRadius: 6, height: 52, width: 72 },
});
