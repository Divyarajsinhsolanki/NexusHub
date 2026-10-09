import { useQuery, useQueryClient } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Archive, ArrowLeft, Copy, Download, MoreHorizontal, Redo2, RotateCw, Scissors, Share2, Trash2, Undo2 } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Pdf from 'react-native-pdf';

import { absoluteAssetUrl, apiErrorMessage } from '@/src/api/client';
import { endpoints } from '@/src/api/endpoints';
import { tokenStore } from '@/src/auth/tokenStore';
import { useAuth } from '@/src/auth/AuthProvider';
import { PageHeader } from '@/src/components/PageHeader';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { Screen } from '@/src/components/Screen';
import { ErrorState, LoadingState } from '@/src/components/StateView';
import { useAppTheme } from '@/src/theme';
import { clampPdfPage, MobilePdfOperation, PdfActionLock, pdfActionAllowed, pdfGeneratedDocumentIds, PdfOperationCancelledError, pdfOperationIsActive, pdfVersionedUri, pollPdfOperation, recentPdfOperations } from '@/src/utils/pdfWorkflow';

type PdfActionContext = { signal: AbortSignal; isCurrent: () => boolean; assertCurrent: () => void };
const newActionScope = (documentId: number) => ({ documentId, controller: new AbortController(), lock: new PdfActionLock() });

export default function PdfDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const documentId = Number(id);
  const router = useRouter();
  const theme = useAppTheme();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const writable = !user?.demo_account;
  const currentDocumentId = useRef(documentId);
  currentDocumentId.current = documentId;
  const actionScope = useRef(newActionScope(documentId));
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState('');
  const [trackedOperation, setTrackedOperation] = useState<MobilePdfOperation | null>(null);
  const [operationError, setOperationError] = useState('');
  const [viewerError, setViewerError] = useState('');
  const [viewerAttempt, setViewerAttempt] = useState(0);
  const viewerToken = useQuery({ queryKey: ['pdf-viewer-token'], queryFn: async () => (await tokenStore.get())?.accessToken, staleTime: 60_000 });
  const document = useQuery({ queryKey: ['pdf-document', documentId], queryFn: () => endpoints.pdfDocument(documentId), enabled: Number.isInteger(documentId) && documentId > 0 });
  const recentOperations = recentPdfOperations(document.data?.recent_operations);
  const activeOperation = pdfOperationIsActive(trackedOperation) ? trackedOperation : recentOperations.find((operation) => operation.id !== trackedOperation?.id && pdfOperationIsActive(operation));
  const processing = !!activeOperation;
  const allowed = (action: 'modify' | 'delete_page' | 'history' | 'download', available = true) => pdfActionAllowed({ writable, busy, processing, pageCount: document.data?.page_count, action, available });
  const refresh = async (context: PdfActionContext) => {
    context.assertCurrent();
    await document.refetch({ throwOnError: true });
    context.assertCurrent();
    await queryClient.invalidateQueries({ queryKey: ['pdf-documents'] });
    context.assertCurrent();
  };
  const runAction = async (errorTitle: string, task: (context: PdfActionContext) => Promise<void>) => {
    const scope = actionScope.current;
    const isCurrent = () => !scope.controller.signal.aborted && scope === actionScope.current && scope.documentId === currentDocumentId.current && scope.documentId === documentId;
    if (!isCurrent()) return;
    const context = { signal: scope.controller.signal, isCurrent, assertCurrent: () => { if (!isCurrent()) throw new PdfOperationCancelledError(); } };
    const release = scope.lock.acquire();
    if (!release) return;
    setBusy(true);
    try { await task(context); }
    catch (error) {
      if (isCurrent()) Alert.alert(errorTitle, apiErrorMessage(error), [{ text: 'Close' }, { text: 'Reload', onPress: () => {
        if (!isCurrent()) return;
        void refresh(context).catch((refreshError) => { if (isCurrent()) Alert.alert('Unable to reload PDF', apiErrorMessage(refreshError)); });
      } }]);
    }
    finally { release(); if (isCurrent()) setBusy(false); }
  };
  const finishOperation = async (initial: MobilePdfOperation, context: PdfActionContext) => {
    context.assertCurrent();
    setOperationError('');
    let latest = initial;
    try {
      const result = await pollPdfOperation(initial, endpoints.pdfOperation, { signal: context.signal, onUpdate: (operation) => { context.assertCurrent(); latest = operation; setTrackedOperation(operation); } });
      context.assertCurrent();
      if (result.document?.id === documentId) {
        queryClient.setQueryData(['pdf-document', documentId], result.document);
        setPage((current) => clampPdfPage(current, result.document?.page_count));
      }
      setToolsOpen(false);
      await refresh(context);
      if (pdfGeneratedDocumentIds(result).length || result.artifacts?.length) Alert.alert('Files ready', 'Open Document tools to view the generated PDFs and downloads.', [{ text: 'Close' }, { text: 'View files', onPress: () => { if (context.isCurrent()) setToolsOpen(true); } }]);
    } catch (error) {
      context.assertCurrent();
      setOperationError(apiErrorMessage(error));
      if (!pdfOperationIsActive(latest)) await refresh(context).catch(() => undefined);
      // A timeout retains the operation ID; checking never submits a new job.
      throw error;
    }
  };
  const executeOperation = (kind: string, parameters: Record<string, unknown> = {}) => {
    if (!allowed(kind === 'delete_pages' ? 'delete_page' : 'modify')) return;
    void runAction('PDF operation failed', async (context) => {
      setOperationError('');
      const created = await endpoints.createPdfOperation({ kind, pdf_document_id: documentId, base_version_id: document.data?.current_version_id, parameters });
      context.assertCurrent();
      await finishOperation(created, context);
    });
  };
  const checkOperation = (operation: MobilePdfOperation) => {
    if (busy) return;
    void runAction('Unable to check PDF operation', async (context) => {
      setTrackedOperation(operation);
      setOperationError('');
      try {
        const latest = await endpoints.pdfOperation(operation.id);
        context.assertCurrent();
        await finishOperation(latest, context);
      } catch (error) {
        context.assertCurrent();
        setOperationError(apiErrorMessage(error));
        throw error;
      }
    });
  };
  const historyAction = (action: 'undo' | 'redo' | 'restore_original') => {
    const available = action === 'undo' ? document.data?.can_undo : action === 'redo' ? document.data?.can_redo : true;
    if (!allowed('history', !!available)) return;
    void runAction('Unable to update PDF', async (context) => {
      const updated = await endpoints.pdfHistoryAction(documentId, action, document.data?.current_version_id);
      context.assertCurrent();
      queryClient.setQueryData(['pdf-document', documentId], updated);
      setPage((current) => clampPdfPage(current, updated.page_count));
      await refresh(context);
    });
  };
  const rename = () => {
    if (!allowed('modify') || !title.trim()) return;
    void runAction('Unable to rename', async (context) => { await endpoints.renamePdf(documentId, title.trim()); context.assertCurrent(); setRenaming(false); await refresh(context); });
  };
  const remove = () => {
    if (!allowed('modify')) return;
    void runAction('Unable to delete', async (context) => { await endpoints.deletePdf(documentId); context.assertCurrent(); await queryClient.invalidateQueries({ queryKey: ['pdf-documents'] }); context.assertCurrent(); router.back(); });
  };
  const downloadFile = (url: string | undefined, filename: string, share: boolean, mimeType = 'application/pdf') => {
    if (!url || !allowed('download')) return;
    void runAction('Download failed', async (context) => {
      const tokens = await tokenStore.get();
      context.assertCurrent();
      const target = new File(Paths.cache, filename.replace(/[^a-z0-9._-]+/gi, '-'));
      const file = await File.downloadFileAsync(absoluteAssetUrl(url)!, target, { idempotent: true, headers: tokens?.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : undefined });
      context.assertCurrent();
      const canShare = share && await Sharing.isAvailableAsync();
      context.assertCurrent();
      if (canShare) await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: filename });
      else Alert.alert('Download complete', file.uri);
    });
  };
  const downloadAndShare = (share: boolean) => downloadFile(document.data?.download_url, `${document.data?.title || 'document'}-${document.data?.current_version_id || 'current'}.pdf`, share);

  useEffect(() => {
    const scope = newActionScope(documentId);
    actionScope.current = scope;
    setBusy(false); setPage(1); setTrackedOperation(null); setOperationError(''); setViewerError(''); setToolsOpen(false); setRenaming(false);
    return () => { scope.controller.abort(); };
  }, [documentId]);
  useEffect(() => { setPage((current) => clampPdfPage(current, document.data?.page_count)); setViewerError(''); }, [document.data?.current_version_id, document.data?.page_count]);
  useEffect(() => {
    // Reopening resumes an accepted operation instead of leaving it unnoticed.
    if (!trackedOperation && activeOperation && !busy) checkOperation(activeOperation);
  }, [activeOperation?.id, trackedOperation?.id, busy]);

  if (document.isLoading) return <Screen><LoadingState label="Opening PDF" /></Screen>;
  if (document.isError || !document.data) return <Screen><ErrorState message={apiErrorMessage(document.error)} onRetry={() => document.refetch()} /></Screen>;
  const data = document.data;
  const currentPage = clampPdfPage(page, data.page_count);
  const allPages = Array.from({ length: data.page_count || 1 }, (_, index) => index + 1);
  const viewerUri = pdfVersionedUri(absoluteAssetUrl(data.content_url), data.current_version_id, data.updated_at);
  const generatedOperations = [trackedOperation, ...recentOperations].filter((operation, index, values): operation is MobilePdfOperation => !!operation && values.findIndex((candidate) => candidate?.id === operation.id) === index && (!!pdfGeneratedDocumentIds(operation).length || !!operation.artifacts?.length));
  const operationLabel = activeOperation ? `${activeOperation.status === 'queued' || activeOperation.status === 'pending' ? 'Queued' : 'Processing'}${activeOperation.progress ? ` · ${activeOperation.progress}%` : ''}` : busy ? 'Updating PDF...' : `${data.page_count || 0} pages`;

  return <Screen header={<PageHeader leading={<Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.iconButton}><ArrowLeft color={theme.text} size={22} /></Pressable>} title={data.title} subtitle={`Page ${currentPage} of ${data.page_count || 1}`} action={<Pressable accessibilityRole="button" accessibilityLabel="PDF tools" onPress={() => setToolsOpen(true)} style={styles.iconButton}><MoreHorizontal color={theme.text} size={23} /></Pressable>} />}>
    <View style={[styles.viewer, (viewerToken.isLoading || viewerError || !viewerUri) && { backgroundColor: theme.surface }]}>{viewerToken.isLoading ? <LoadingState label="Preparing preview" /> : viewerError || !viewerUri ? <ErrorState message={viewerError || 'This PDF preview is unavailable.'} onRetry={() => { setViewerError(''); setViewerAttempt((attempt) => attempt + 1); void viewerToken.refetch(); void document.refetch(); }} /> : <Pdf key={`${documentId}:${data.current_version_id ?? data.updated_at}:${viewerAttempt}`} page={currentPage} enablePaging horizontal onError={(error) => setViewerError(String(error))} onPageChanged={(nextPage) => setPage(clampPdfPage(nextPage, data.page_count))} source={{ uri: viewerUri, cache: true, headers: viewerToken.data ? { Authorization: `Bearer ${viewerToken.data}` } : undefined }} style={styles.pdf} trustAllCerts={false} />}</View>
    {processing || operationError ? <View style={[styles.status, { backgroundColor: theme.surface, borderTopColor: theme.border }]}><Text style={[styles.statusText, { color: operationError ? theme.danger : theme.text }]}>{operationError || operationLabel}</Text>{activeOperation ? <Pressable accessibilityRole="button" accessibilityLabel="Check PDF operation status" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => checkOperation(activeOperation)} style={[styles.statusButton, busy && styles.disabled]}><Text style={{ color: theme.primary, fontWeight: '700' }}>{busy ? 'Checking...' : 'Check status'}</Text></Pressable> : <Pressable accessibilityRole="button" onPress={() => setOperationError('')} style={styles.statusButton}><Text style={{ color: theme.textMuted }}>Dismiss</Text></Pressable>}</View> : null}
    <View style={[styles.quickTools, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>{writable ? <><Tool label="Undo" disabled={!allowed('history', !!data.can_undo)} onPress={() => historyAction('undo')}><Undo2 color={theme.text} size={20} /></Tool><Tool label="Redo" disabled={!allowed('history', !!data.can_redo)} onPress={() => historyAction('redo')}><Redo2 color={theme.text} size={20} /></Tool><Tool label="Rotate" disabled={!allowed('modify')} onPress={() => executeOperation('rotate_pages', { page_numbers: [currentPage], degrees: 90 })}><RotateCw color={theme.text} size={20} /></Tool></> : null}<Tool label="Share" disabled={!allowed('download', !!data.download_url)} onPress={() => downloadAndShare(true)}><Share2 color={theme.text} size={20} /></Tool></View>

    <Modal animationType="slide" onRequestClose={() => setToolsOpen(false)} presentationStyle="pageSheet" visible={toolsOpen}><View style={[styles.modal, { backgroundColor: theme.background }]}><PageHeader leading={<Pressable accessibilityRole="button" accessibilityLabel="Close tools" onPress={() => setToolsOpen(false)} style={styles.iconButton}><ArrowLeft color={theme.text} size={22} /></Pressable>} title="Document tools" subtitle={operationLabel} /><ScrollView contentContainerStyle={styles.toolList}>
      {writable ? <><ToolRow disabled={!allowed('modify')} icon={<RotateCw color={theme.primary} size={20} />} label="Rotate every page" onPress={() => executeOperation('rotate_pages', { page_numbers: allPages, degrees: 90 })} /><ToolRow disabled={!allowed('modify')} icon={<Copy color={theme.primary} size={20} />} label="Duplicate current page" onPress={() => executeOperation('duplicate_pages', { page_numbers: [currentPage] })} /><ToolRow danger disabled={!allowed('delete_page')} icon={<Scissors color={theme.danger} size={20} />} label="Delete current page" onPress={() => Alert.alert('Delete this page?', `Page ${currentPage} will be removed. You can undo this change.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete page', style: 'destructive', onPress: () => executeOperation('delete_pages', { page_numbers: [currentPage] }) }])} /><ToolRow disabled={!allowed('modify')} icon={<Archive color={theme.primary} size={20} />} label="Compress document" onPress={() => executeOperation('compress')} /><ToolRow disabled={!allowed('modify')} icon={<Scissors color={theme.primary} size={20} />} label="Split into 10 MB parts" onPress={() => executeOperation('split_by_size', { max_size_mb: 10 })} /></> : null}
      <ToolRow disabled={!allowed('download', !!data.download_url)} icon={<Download color={theme.primary} size={20} />} label="Download PDF" onPress={() => downloadAndShare(false)} />
      <ToolRow disabled={!allowed('download', !!data.download_url)} icon={<Share2 color={theme.primary} size={20} />} label="Share PDF" onPress={() => downloadAndShare(true)} />
      {writable ? <><ToolRow disabled={!allowed('history')} icon={<Undo2 color={theme.primary} size={20} />} label="Restore original" onPress={() => Alert.alert('Restore original PDF?', 'The document will return to the uploaded original. This change can be undone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Restore', onPress: () => historyAction('restore_original') }])} /><ToolRow disabled={!allowed('modify')} icon={<MoreHorizontal color={theme.primary} size={20} />} label="Rename document" onPress={() => { setTitle(data.title); setRenaming(true); }} /><ToolRow danger disabled={!allowed('modify')} icon={<Trash2 color={theme.danger} size={20} />} label="Delete document" onPress={() => Alert.alert('Delete this PDF?', 'All versions and operations will be removed.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: remove }])} /></> : null}
      {generatedOperations.length ? <Text style={[styles.sectionTitle, { color: theme.text }]}>Generated files</Text> : null}
      {generatedOperations.map((operation) => <View key={operation.id}>
        {pdfGeneratedDocumentIds(operation).map((generatedId, index) => <ToolRow key={generatedId} disabled={busy} icon={<Copy color={theme.primary} size={20} />} label={`Open split PDF ${index + 1} · #${generatedId}`} onPress={() => { setToolsOpen(false); router.push(`/more/pdf/${generatedId}`); }} />)}
        {operation.artifacts?.map((artifact) => <ToolRow key={artifact.id} disabled={!allowed('download')} icon={<Download color={theme.primary} size={20} />} label={typeof artifact.filename === 'string' ? artifact.filename : 'Download generated file'} onPress={() => downloadFile(typeof artifact.download_url === 'string' ? artifact.download_url : typeof artifact.url === 'string' ? artifact.url : undefined, typeof artifact.filename === 'string' ? artifact.filename : 'export.zip', true, artifact.kind === 'text' ? 'text/plain' : 'application/zip')} />)}
      </View>)}
    </ScrollView></View></Modal>
    <Modal animationType="fade" onRequestClose={() => { if (!busy) setRenaming(false); }} transparent visible={renaming}><View style={styles.overlay}><View style={[styles.dialog, { backgroundColor: theme.surface }]}><Text style={[styles.dialogTitle, { color: theme.text }]}>Rename PDF</Text><TextInput accessibilityLabel="PDF title" autoFocus editable={!busy} onChangeText={setTitle} style={[styles.input, { borderColor: theme.border, color: theme.text }]} value={title} /><PrimaryButton disabled={!title.trim() || !allowed('modify')} label={busy ? 'Saving...' : 'Rename'} onPress={rename} /><Pressable disabled={busy} onPress={() => setRenaming(false)} style={styles.cancel}><Text style={{ color: theme.textMuted, fontWeight: '700' }}>Cancel</Text></Pressable></View></View></Modal>
  </Screen>;
}

function Tool({ label, onPress, disabled, children }: { label: string; onPress: () => void; disabled?: boolean; children: React.ReactNode }) { const theme = useAppTheme(); return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} style={[styles.quickTool, disabled && styles.disabled]}>{children}<Text style={[styles.quickLabel, { color: theme.textMuted }]}>{label}</Text></Pressable>; }
function ToolRow({ label, onPress, icon, danger, disabled }: { label: string; onPress: () => void; icon: React.ReactNode; danger?: boolean; disabled?: boolean }) { const theme = useAppTheme(); return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} style={[styles.toolRow, { borderBottomColor: theme.border }, disabled && styles.disabled]}>{icon}<Text style={[styles.toolText, { color: danger ? theme.danger : theme.text }]}>{label}</Text></Pressable>; }

const styles = StyleSheet.create({
  iconButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 }, viewer: { backgroundColor: '#373b42', flex: 1 }, pdf: { flex: 1, width: '100%' },
  quickTools: { borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', height: 70, justifyContent: 'space-around' }, quickTool: { alignItems: 'center', justifyContent: 'center', minWidth: 60 }, quickLabel: { fontSize: 10, marginTop: 4 }, disabled: { opacity: 0.35 },
  status: { alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 8 }, statusText: { flex: 1, fontSize: 12 }, statusButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: 8 },
  modal: { flex: 1 }, toolList: { paddingHorizontal: 20, paddingBottom: 36 }, sectionTitle: { fontSize: 17, fontWeight: '800', marginTop: 24, marginBottom: 8 }, toolRow: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 13, minHeight: 58 }, toolText: { flex: 1, fontSize: 15, fontWeight: '700' },
  overlay: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)', flex: 1, justifyContent: 'center', padding: 24 }, dialog: { borderRadius: 8, padding: 20, width: '100%' }, dialogTitle: { fontSize: 18, fontWeight: '800', marginBottom: 14 }, input: { borderRadius: 8, borderWidth: 1, fontSize: 15, marginBottom: 15, minHeight: 46, paddingHorizontal: 12 }, cancel: { alignItems: 'center', minHeight: 44, paddingTop: 14 },
});
