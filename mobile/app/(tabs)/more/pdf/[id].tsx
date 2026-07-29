import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Archive, ArrowLeft, Copy, Download, MoreHorizontal, Redo2, RotateCw, Scissors, Share2, Trash2, Undo2 } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Pdf from 'react-native-pdf';

import { absoluteAssetUrl, apiErrorMessage } from '@/src/api/client';
import { endpoints } from '@/src/api/endpoints';
import type { PdfOperation } from '@/src/api/types';
import { tokenStore } from '@/src/auth/tokenStore';
import { useAuth } from '@/src/auth/AuthProvider';
import { PageHeader } from '@/src/components/PageHeader';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { Screen } from '@/src/components/Screen';
import { ErrorState, LoadingState } from '@/src/components/StateView';
import { useAppTheme } from '@/src/theme';

export default function PdfDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const documentId = Number(id);
  const router = useRouter();
  const theme = useAppTheme();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const writable = !user?.demo_account;
  const [page, setPage] = useState(1);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState('');
  const viewerToken = useQuery({
    queryKey: ['pdf-viewer-token'],
    queryFn: async () => (await tokenStore.get())?.accessToken,
    staleTime: 60_000,
  });
  const document = useQuery({ queryKey: ['pdf-document', documentId], queryFn: () => endpoints.pdfDocument(documentId), enabled: Number.isFinite(documentId) });
  const refresh = async () => { await document.refetch(); await queryClient.invalidateQueries({ queryKey: ['pdf-documents'] }); };
  const operation = useMutation({
    mutationFn: async ({ kind, parameters = {} }: { kind: string; parameters?: Record<string, unknown> }) => {
      const created = await endpoints.createPdfOperation({ kind, pdf_document_id: documentId, base_version_id: document.data?.current_version_id, parameters });
      return created.status === 'pending' || created.status === 'processing' ? pollOperation(created) : created;
    },
    onSuccess: async (result) => { setToolsOpen(false); await refresh(); if (result.artifacts?.length) Alert.alert('Export ready', 'The generated files are available from this operation.'); },
    onError: (error) => Alert.alert('PDF operation failed', apiErrorMessage(error), [{ text: 'Reload', onPress: refresh }]),
  });
  const history = useMutation({ mutationFn: (action: 'undo' | 'redo' | 'restore_original') => endpoints.pdfHistoryAction(documentId, action), onSuccess: refresh, onError: (error) => Alert.alert('Unable to update PDF', apiErrorMessage(error)) });
  const rename = useMutation({ mutationFn: () => endpoints.renamePdf(documentId, title.trim()), onSuccess: async () => { setRenaming(false); await refresh(); }, onError: (error) => Alert.alert('Unable to rename', apiErrorMessage(error)) });
  const remove = async () => { try { await endpoints.deletePdf(documentId); await queryClient.invalidateQueries({ queryKey: ['pdf-documents'] }); router.back(); } catch (error) { Alert.alert('Unable to delete', apiErrorMessage(error)); } };
  const downloadAndShare = async (share: boolean) => {
    if (!document.data?.download_url) return;
    try {
      const tokens = await tokenStore.get();
      const target = new File(Paths.cache, `${document.data.title.replace(/[^a-z0-9]+/gi, '-')}.pdf`);
      const file = await File.downloadFileAsync(absoluteAssetUrl(document.data.download_url)!, target, { idempotent: true, headers: tokens?.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : undefined });
      if (share && await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: document.data.title });
      else Alert.alert('Download complete', file.uri);
    } catch (error) { Alert.alert('Download failed', apiErrorMessage(error)); }
  };

  if (document.isLoading) return <Screen><LoadingState label="Opening PDF" /></Screen>;
  if (document.isError || !document.data) return <Screen><ErrorState message={apiErrorMessage(document.error)} onRetry={() => document.refetch()} /></Screen>;
  const data = document.data;
  const allPages = Array.from({ length: data.page_count || 1 }, (_, index) => index + 1);

  return <Screen header={<PageHeader leading={<Pressable accessibilityLabel="Back" onPress={() => router.back()} style={styles.iconButton}><ArrowLeft color={theme.text} size={22} /></Pressable>} title={data.title} subtitle={`Page ${page} of ${data.page_count || 1}`} action={<Pressable accessibilityLabel="PDF tools" onPress={() => setToolsOpen(true)} style={styles.iconButton}><MoreHorizontal color={theme.text} size={23} /></Pressable>} />}>
    <View style={styles.viewer}><Pdf enablePaging horizontal onError={(error) => Alert.alert('Unable to render PDF', String(error))} onPageChanged={setPage} source={{ uri: absoluteAssetUrl(data.content_url), cache: true, headers: viewerToken.data ? { Authorization: `Bearer ${viewerToken.data}` } : undefined }} style={styles.pdf} trustAllCerts={false} /></View>
    <View style={[styles.quickTools, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>{writable ? <><Tool label="Undo" disabled={!data.can_undo || history.isPending} onPress={() => history.mutate('undo')}><Undo2 color={theme.text} size={20} /></Tool><Tool label="Redo" disabled={!data.can_redo || history.isPending} onPress={() => history.mutate('redo')}><Redo2 color={theme.text} size={20} /></Tool><Tool label="Rotate" disabled={operation.isPending} onPress={() => operation.mutate({ kind: 'rotate_pages', parameters: { page_numbers: [page], degrees: 90 } })}><RotateCw color={theme.text} size={20} /></Tool></> : null}<Tool label="Share" onPress={() => downloadAndShare(true)}><Share2 color={theme.text} size={20} /></Tool></View>

    <Modal animationType="slide" onRequestClose={() => setToolsOpen(false)} presentationStyle="pageSheet" visible={toolsOpen}><View style={[styles.modal, { backgroundColor: theme.background }]}><PageHeader leading={<Pressable accessibilityLabel="Close tools" onPress={() => setToolsOpen(false)} style={styles.iconButton}><ArrowLeft color={theme.text} size={22} /></Pressable>} title="Document tools" subtitle={operation.isPending ? 'Processing operation...' : `${data.page_count || 0} pages`} /><ScrollView contentContainerStyle={styles.toolList}>
      {writable ? <><ToolRow icon={<RotateCw color={theme.primary} size={20} />} label="Rotate every page" onPress={() => operation.mutate({ kind: 'rotate_pages', parameters: { page_numbers: allPages, degrees: 90 } })} /><ToolRow icon={<Copy color={theme.primary} size={20} />} label="Duplicate current page" onPress={() => operation.mutate({ kind: 'duplicate_pages', parameters: { page_numbers: [page] } })} /><ToolRow icon={<Scissors color={theme.primary} size={20} />} label="Delete current page" onPress={() => data.page_count && data.page_count > 1 && operation.mutate({ kind: 'delete_pages', parameters: { page_numbers: [page] } })} /><ToolRow icon={<Archive color={theme.primary} size={20} />} label="Compress document" onPress={() => operation.mutate({ kind: 'compress' })} /><ToolRow icon={<Scissors color={theme.primary} size={20} />} label="Split into 10 MB parts" onPress={() => operation.mutate({ kind: 'split_by_size', parameters: { max_size_mb: 10 } })} /></> : null}
      <ToolRow icon={<Download color={theme.primary} size={20} />} label="Download PDF" onPress={() => downloadAndShare(false)} />
      <ToolRow icon={<Share2 color={theme.primary} size={20} />} label="Share PDF" onPress={() => downloadAndShare(true)} />
      {writable ? <><ToolRow icon={<Undo2 color={theme.primary} size={20} />} label="Restore original" onPress={() => history.mutate('restore_original')} /><ToolRow icon={<MoreHorizontal color={theme.primary} size={20} />} label="Rename document" onPress={() => { setTitle(data.title); setRenaming(true); }} /><ToolRow danger icon={<Trash2 color={theme.danger} size={20} />} label="Delete document" onPress={() => Alert.alert('Delete this PDF?', 'All versions and operations will be removed.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: remove }])} /></> : null}
    </ScrollView></View></Modal>
    <Modal animationType="fade" onRequestClose={() => setRenaming(false)} transparent visible={renaming}><View style={styles.overlay}><View style={[styles.dialog, { backgroundColor: theme.surface }]}><Text style={[styles.dialogTitle, { color: theme.text }]}>Rename PDF</Text><TextInput autoFocus onChangeText={setTitle} style={[styles.input, { borderColor: theme.border, color: theme.text }]} value={title} /><PrimaryButton disabled={!title.trim() || rename.isPending} label={rename.isPending ? 'Saving...' : 'Rename'} onPress={() => rename.mutate()} /><Pressable onPress={() => setRenaming(false)} style={styles.cancel}><Text style={{ color: theme.textMuted, fontWeight: '700' }}>Cancel</Text></Pressable></View></View></Modal>
  </Screen>;
}

async function pollOperation(initial: PdfOperation) {
  let operation = initial;
  for (let attempt = 0; attempt < 60 && ['pending', 'processing'].includes(operation.status); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    operation = await endpoints.pdfOperation(operation.id);
  }
  if (operation.status === 'failed') throw new Error(operation.error || 'PDF operation failed.');
  if (operation.status !== 'completed') throw new Error('PDF operation is taking longer than expected.');
  return operation;
}

function Tool({ label, onPress, disabled, children }: { label: string; onPress: () => void; disabled?: boolean; children: React.ReactNode }) { return <Pressable accessibilityLabel={label} disabled={disabled} onPress={onPress} style={[styles.quickTool, disabled && styles.disabled]}>{children}<Text style={styles.quickLabel}>{label}</Text></Pressable>; }
function ToolRow({ label, onPress, icon, danger }: { label: string; onPress: () => void; icon: React.ReactNode; danger?: boolean }) { const theme = useAppTheme(); return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.toolRow, { borderBottomColor: theme.border }]}>{icon}<Text style={[styles.toolText, { color: danger ? theme.danger : theme.text }]}>{label}</Text></Pressable>; }

const styles = StyleSheet.create({
  iconButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 }, viewer: { backgroundColor: '#373b42', flex: 1 }, pdf: { flex: 1, width: '100%' },
  quickTools: { borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', height: 70, justifyContent: 'space-around' }, quickTool: { alignItems: 'center', justifyContent: 'center', minWidth: 60 }, quickLabel: { color: '#667085', fontSize: 10, marginTop: 4 }, disabled: { opacity: 0.35 },
  modal: { flex: 1 }, toolList: { paddingHorizontal: 20, paddingBottom: 36 }, toolRow: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 13, minHeight: 58 }, toolText: { flex: 1, fontSize: 15, fontWeight: '700' },
  overlay: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)', flex: 1, justifyContent: 'center', padding: 24 }, dialog: { borderRadius: 8, padding: 20, width: '100%' }, dialogTitle: { fontSize: 18, fontWeight: '800', marginBottom: 14 }, input: { borderRadius: 8, borderWidth: 1, fontSize: 15, marginBottom: 15, minHeight: 46, paddingHorizontal: 12 }, cancel: { alignItems: 'center', minHeight: 44, paddingTop: 14 },
});
