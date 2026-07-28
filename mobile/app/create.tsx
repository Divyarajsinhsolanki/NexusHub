import DateTimePicker from '@react-native-community/datetimepicker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { format } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CalendarPlus, CheckSquare2, FilePlus2, MessageSquarePlus, NotebookPen, Send, Timer, TriangleAlert, X } from 'lucide-react-native';
import { ComponentType, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { apiErrorMessage } from '@/src/api/client';
import { endpoints } from '@/src/api/endpoints';
import { useAuth } from '@/src/auth/AuthProvider';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { draftStore } from '@/src/storage/draftStore';
import { useAppTheme } from '@/src/theme';

type CreateType = 'task' | 'work_log' | 'event' | 'post' | 'issue' | 'message' | 'document';
const options: Array<{ type: CreateType; label: string; icon: ComponentType<{ color: string; size: number }> }> = [
  { type: 'task', label: 'Task', icon: CheckSquare2 }, { type: 'work_log', label: 'Work log', icon: Timer }, { type: 'event', label: 'Event', icon: CalendarPlus }, { type: 'post', label: 'Post', icon: NotebookPen }, { type: 'issue', label: 'Issue', icon: TriangleAlert }, { type: 'message', label: 'Message', icon: MessageSquarePlus }, { type: 'document', label: 'PDF', icon: FilePlus2 },
];

export default function CreateScreen() {
  const params = useLocalSearchParams<{ type?: CreateType; projectId?: string }>();
  const router = useRouter();
  const theme = useAppTheme();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [type, setType] = useState<CreateType>(options.some((option) => option.type === params.type) ? params.type! : 'task');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date());
  const [image, setImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [document, setDocument] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const projects = useQuery({ queryKey: ['projects'], queryFn: endpoints.projects, enabled: type === 'issue' || type === 'task' });
  const conversations = useQuery({ queryKey: ['conversations'], queryFn: () => endpoints.conversations(), enabled: type === 'message' });
  const [projectId, setProjectId] = useState<number | undefined>(params.projectId ? Number(params.projectId) : undefined);
  const [conversationId, setConversationId] = useState<number | undefined>();
  const draftIdentity = user ? { key: `create:${type}`, userId: user.id, workspaceId: user.workspace.id } : null;
  const canSubmit = type === 'document' ? Boolean(document) : Boolean(title.trim()) && (type !== 'issue' || Boolean(projectId)) && (type !== 'message' || Boolean(conversationId));

  useEffect(() => {
    setTitle(''); setDescription(''); setImage(null); setDocument(null);
    if (draftIdentity) void draftStore.get<{ title: string; description: string }>(draftIdentity).then((draft) => { if (draft) { setTitle(draft.title); setDescription(draft.description); } });
  }, [type]);
  useEffect(() => { if (draftIdentity && (title || description)) void draftStore.set(draftIdentity, { title, description }); }, [title, description, draftIdentity]);
  useEffect(() => { if (!projectId && projects.data?.length) setProjectId(projects.data[0].id); }, [projectId, projects.data]);
  useEffect(() => { if (!conversationId && conversations.data?.data.length) setConversationId(conversations.data.data[0].id); }, [conversationId, conversations.data]);

  const save = useMutation({
    mutationFn: async () => {
      const now = new Date();
      if (type === 'task') return endpoints.createTask({ title: title.trim(), description, type: projectId ? 'Code' : 'general', status: 'todo', ...(projectId ? { project_id: projectId } : {}) });
      if (type === 'work_log') return endpoints.createWorkLog({ title: title.trim(), description, log_date: format(date, 'yyyy-MM-dd'), start_time: format(new Date(now.getTime() - 30 * 60_000), 'HH:mm'), end_time: format(now, 'HH:mm'), actual_minutes: 30, tags: [] });
      if (type === 'event') return endpoints.createCalendarEvent({ title: title.trim(), description, start_at: date.toISOString(), end_at: new Date(date.getTime() + 60 * 60_000).toISOString(), event_type: 'focus', visibility: 'private', status: 'confirmed' });
      if (type === 'post') return endpoints.createPost({ message: [title.trim(), description.trim()].filter(Boolean).join('\n\n'), image: image ? { uri: image.uri, name: image.fileName || 'post.jpg', type: image.mimeType || 'image/jpeg' } : undefined });
      if (type === 'issue') return endpoints.createIssue(
        { project_id: projectId, title: title.trim(), issue_description: description, status: 'Open', severity: 'Medium' },
        image ? { uri: image.uri, name: image.fileName || 'issue.jpg', type: image.mimeType || 'image/jpeg' } : undefined,
      );
      if (type === 'message') { const form = new FormData(); form.append('message[body]', [title.trim(), description.trim()].filter(Boolean).join('\n\n')); return endpoints.createMessage(conversationId!, form); }
      if (!document) throw new Error('Choose a PDF first.');
      return endpoints.uploadPdf(document, title.trim() || undefined);
    },
    onSuccess: async () => {
      if (draftIdentity) await draftStore.remove(draftIdentity);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['home'] }), queryClient.invalidateQueries({ queryKey: ['tasks'] }), queryClient.invalidateQueries({ queryKey: ['work-logs'] }), queryClient.invalidateQueries({ queryKey: ['calendar-events'] }), queryClient.invalidateQueries({ queryKey: ['posts'] }), queryClient.invalidateQueries({ queryKey: ['pdf-documents'] }), queryClient.invalidateQueries({ queryKey: ['conversations'] })]);
      router.back();
    },
    onError: (error) => Alert.alert('Unable to create item', apiErrorMessage(error)),
  });
  const fromLibrary = async () => { const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 }); if (!result.canceled) setImage(result.assets[0]); };
  const fromCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) { Alert.alert('Camera access is required', 'Enable camera access to capture an attachment.'); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (!result.canceled) setImage(result.assets[0]);
  };
  const pickImage = () => Alert.alert('Add a photo', undefined, [
    { text: 'Camera', onPress: () => void fromCamera() },
    { text: 'Photo library', onPress: () => void fromLibrary() },
    { text: 'Cancel', style: 'cancel' },
  ]);
  const pickDocument = async () => { const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true }); if (!result.canceled) setDocument(result.assets[0]); };
  const detailLabel = useMemo(() => type === 'post' || type === 'message' ? 'Additional message' : 'Description', [type]);

  return <View style={[styles.screen, { backgroundColor: theme.background }]}><View style={[styles.header, { borderBottomColor: theme.border }]}><Pressable accessibilityLabel="Close create sheet" onPress={() => router.back()} style={styles.iconButton}><X color={theme.text} size={23} /></Pressable><View style={styles.headerCopy}><Text style={[styles.headerTitle, { color: theme.text }]}>Create</Text><Text style={[styles.headerSubtitle, { color: theme.textMuted }]}>Add work without leaving your context</Text></View><View style={styles.iconButton} /></View>
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled"><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.options}>{options.map((option) => { const Icon = option.icon; const selected = type === option.type; return <Pressable accessibilityRole="button" key={option.type} onPress={() => setType(option.type)} style={[styles.option, { backgroundColor: selected ? theme.primary : theme.surface, borderColor: selected ? theme.primary : theme.border }]}><Icon color={selected ? '#ffffff' : theme.textMuted} size={18} /><Text style={[styles.optionLabel, { color: selected ? '#ffffff' : theme.text }]}>{option.label}</Text></Pressable>; })}</ScrollView>
      {type === 'document' ? <Pressable onPress={pickDocument} style={[styles.filePicker, { backgroundColor: theme.surface, borderColor: theme.border }]}><FilePlus2 color={theme.primary} size={28} /><Text style={[styles.fileTitle, { color: theme.text }]}>{document?.name || 'Choose a PDF document'}</Text><Text style={[styles.fileDetail, { color: theme.textMuted }]}>PDF files up to your workspace quota</Text></Pressable> : null}
      <Field label={type === 'post' || type === 'message' ? 'Message' : type === 'document' ? 'Document title (optional)' : 'Title'} onChangeText={setTitle} placeholder={type === 'work_log' ? 'What did you work on?' : 'Add a clear title'} value={title} />
      {type !== 'document' ? <Field label={detailLabel} multiline onChangeText={setDescription} placeholder="Add useful context" value={description} /> : null}
      {type === 'event' || type === 'work_log' ? <View><Text style={[styles.label, { color: theme.text }]}>{type === 'event' ? 'Starts at' : 'Log date'}</Text><View style={[styles.datePicker, { backgroundColor: theme.surface, borderColor: theme.border }]}><DateTimePicker display="default" mode={type === 'event' ? 'datetime' : 'date'} onChange={(_, value) => value && setDate(value)} value={date} /></View></View> : null}
      {(type === 'issue' || type === 'task') && projects.data?.length ? <ChoiceList label="Project" selected={projectId} onSelect={setProjectId} rows={projects.data.map((project) => ({ id: project.id, title: project.name }))} optional={type === 'task'} /> : null}
      {type === 'message' && conversations.data ? <ChoiceList label="Conversation" selected={conversationId} onSelect={setConversationId} rows={conversations.data.data.map((conversation) => ({ id: conversation.id, title: conversation.title || `Conversation ${conversation.id}` }))} /> : null}
      {type === 'post' || type === 'issue' ? <Pressable accessibilityLabel="Add photo attachment" onPress={pickImage} style={[styles.attachmentButton, { borderColor: theme.border }]}><FilePlus2 color={theme.primary} size={19} /><Text style={[styles.attachmentText, { color: theme.text }]}>{image?.fileName || 'Add photo attachment'}</Text></Pressable> : null}
      <View style={styles.save}><PrimaryButton disabled={!canSubmit || save.isPending} icon={<Send color="#ffffff" size={18} />} label={save.isPending ? 'Creating...' : `Create ${options.find((option) => option.type === type)?.label}`} onPress={() => save.mutate()} /></View>
    </ScrollView>
  </View>;
}

function Field({ label, value, onChangeText, multiline, placeholder }: { label: string; value: string; onChangeText: (value: string) => void; multiline?: boolean; placeholder?: string }) { const theme = useAppTheme(); return <View><Text style={[styles.label, { color: theme.text }]}>{label}</Text><TextInput accessibilityLabel={label} multiline={multiline} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={theme.textMuted} style={[styles.field, multiline && styles.multiline, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]} value={value} /></View>; }
function ChoiceList({ label, rows, selected, onSelect, optional }: { label: string; rows: Array<{ id: number; title: string }>; selected?: number; onSelect: (id: number | undefined) => void; optional?: boolean }) { const theme = useAppTheme(); return <View><Text style={[styles.label, { color: theme.text }]}>{label}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choices}>{optional ? <Pressable onPress={() => onSelect(undefined)} style={[styles.choice, { borderColor: !selected ? theme.primary : theme.border, backgroundColor: !selected ? theme.surfaceMuted : theme.surface }]}><Text style={{ color: theme.text, fontWeight: '700' }}>Personal</Text></Pressable> : null}{rows.map((row) => <Pressable key={row.id} onPress={() => onSelect(row.id)} style={[styles.choice, { borderColor: selected === row.id ? theme.primary : theme.border, backgroundColor: selected === row.id ? theme.surfaceMuted : theme.surface }]}><Text numberOfLines={1} style={{ color: theme.text, fontWeight: '700' }}>{row.title}</Text></Pressable>)}</ScrollView></View>; }

const styles = StyleSheet.create({ screen: { flex: 1, paddingTop: 12 }, header: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 66, paddingHorizontal: 10 }, iconButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 }, headerCopy: { alignItems: 'center', flex: 1 }, headerTitle: { fontSize: 18, fontWeight: '800' }, headerSubtitle: { fontSize: 11, marginTop: 2 }, scroll: { gap: 18, padding: 20, paddingBottom: 40 }, options: { gap: 8, paddingRight: 20 }, option: { alignItems: 'center', borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 7, height: 42, paddingHorizontal: 12 }, optionLabel: { fontSize: 12, fontWeight: '700' }, label: { fontSize: 13, fontWeight: '700', marginBottom: 7 }, field: { borderRadius: 8, borderWidth: 1, fontSize: 15, minHeight: 46, paddingHorizontal: 12, paddingVertical: 11 }, multiline: { minHeight: 112, textAlignVertical: 'top' }, datePicker: { alignItems: 'flex-start', borderRadius: 8, borderWidth: 1, minHeight: 48, paddingHorizontal: 6 }, choices: { gap: 8, paddingRight: 20 }, choice: { borderRadius: 8, borderWidth: 1, justifyContent: 'center', maxWidth: 180, minHeight: 44, paddingHorizontal: 13 }, filePicker: { alignItems: 'center', borderRadius: 8, borderStyle: 'dashed', borderWidth: 1, padding: 24 }, fileTitle: { fontSize: 15, fontWeight: '800', marginTop: 10 }, fileDetail: { fontSize: 12, marginTop: 4 }, attachmentButton: { alignItems: 'center', borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 10, minHeight: 48, paddingHorizontal: 13 }, attachmentText: { flex: 1, fontSize: 13, fontWeight: '700' }, save: { marginTop: 6 } });
