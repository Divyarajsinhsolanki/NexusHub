import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { Alert } from 'react-native';

import PdfDetailScreen from '../../app/(tabs)/more/pdf/[id]';
import { endpoints } from '../api/endpoints';
import type { PdfDocument, PdfOperation } from '../api/types';

const mockPush = jest.fn();
const mockBack = jest.fn();
let mockDemo = false;
let mockDocumentId = '3';

jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ id: mockDocumentId }), useRouter: () => ({ back: mockBack, push: mockPush }) }));
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: 'file:///cache' } }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('react-native-pdf', () => {
  const React = require('react');
  const { View } = require('react-native');
  return (props: object) => React.createElement(View, { ...props, testID: 'pdf-preview' });
});
jest.mock('../api/endpoints', () => ({ endpoints: { pdfDocument: jest.fn(), pdfOperation: jest.fn(), createPdfOperation: jest.fn(), pdfHistoryAction: jest.fn(), renamePdf: jest.fn(), deletePdf: jest.fn() } }));
jest.mock('../api/client', () => ({ absoluteAssetUrl: (url?: string) => url ? `https://example.test${url}` : undefined, apiErrorMessage: (error: unknown) => error instanceof Error ? error.message : 'Request failed' }));
jest.mock('../auth/tokenStore', () => ({ tokenStore: { get: async () => ({ accessToken: 'test-token' }) } }));
jest.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: { demo_account: mockDemo } }) }));
jest.mock('../theme', () => ({ useAppTheme: () => ({ background: '#fff', surface: '#fff', primary: '#00f', border: '#ccc', text: '#111', textMuted: '#666', danger: '#f00' }) }));
jest.mock('../components/Screen', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { Screen: ({ header, children }: { header: React.ReactNode; children: React.ReactNode }) => React.createElement(View, {}, header, children) };
});
jest.mock('../components/PageHeader', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  return { PageHeader: ({ leading, title, subtitle, action }: { leading: React.ReactNode; title: string; subtitle: string; action: React.ReactNode }) => React.createElement(View, {}, leading, React.createElement(Text, {}, title), React.createElement(Text, {}, subtitle), action) };
});
jest.mock('../components/PrimaryButton', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return { PrimaryButton: ({ label, ...props }: { label: string }) => React.createElement(Pressable, { ...props, accessibilityRole: 'button' }, React.createElement(Text, {}, label)) };
});
jest.mock('../components/StateView', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return { LoadingState: ({ label }: { label: string }) => React.createElement(Text, {}, label), ErrorState: ({ message }: { message: string }) => React.createElement(Text, {}, message) };
});

const source: PdfDocument = { id: 3, title: 'Sample', page_count: 3, current_version_id: 11, can_undo: true, can_redo: false, content_url: '/api/pdf_documents/3/content', download_url: '/api/pdf_documents/3/download' };
const mockDocument = endpoints.pdfDocument as jest.MockedFunction<typeof endpoints.pdfDocument>;
const mockCreate = endpoints.createPdfOperation as jest.MockedFunction<typeof endpoints.createPdfOperation>;
const mockOperation = endpoints.pdfOperation as jest.MockedFunction<typeof endpoints.pdfOperation>;
const mockHistory = endpoints.pdfHistoryAction as jest.MockedFunction<typeof endpoints.pdfHistoryAction>;
let client: QueryClient;

beforeEach(() => {
  jest.resetAllMocks();
  mockDemo = false;
  mockDocumentId = '3';
  mockDocument.mockResolvedValue(source);
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => { client.clear(); jest.useRealTimers(); jest.restoreAllMocks(); });

async function openScreen() {
  const screen = await render(<QueryClientProvider client={client}><PdfDetailScreen /></QueryClientProvider>);
  await screen.findByTestId('pdf-preview');
  return screen;
}

test('undo supplies the current version, refreshes the native preview, and clamps the current page', async () => {
  const screen = await openScreen();
  await act(async () => screen.getByTestId('pdf-preview').props.onPageChanged(3));
  expect(screen.getByText('Page 3 of 3')).toBeTruthy();
  expect(screen.getByTestId('pdf-preview').props.source.uri).toContain('pdf_version=11');
  const previous = { ...source, current_version_id: 10, page_count: 2, can_redo: true };
  mockHistory.mockResolvedValue(previous);
  mockDocument.mockResolvedValue(previous);
  await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
  await waitFor(() => expect(mockHistory).toHaveBeenCalledWith(3, 'undo', 11));
  await screen.findByText('Page 2 of 2');
  expect(screen.getByTestId('pdf-preview').props.source.uri).toContain('pdf_version=10');
  expect(screen.getByTestId('pdf-preview').props.page).toBe(2);
  await screen.unmount();
});

test('queued jobs lock other actions until completion and then reveal generated split files', async () => {
  jest.useFakeTimers();
  const screen = await openScreen();
  const queued = { id: 17, kind: 'split_by_size', status: 'queued', progress: 0 } as unknown as PdfOperation;
  mockCreate.mockResolvedValue(queued);
  mockOperation.mockResolvedValueOnce({ ...queued, status: 'processing', progress: 50 }).mockResolvedValueOnce({ ...queued, status: 'completed', progress: 100, result: { document_ids: [21, 22] } });
  await fireEvent.press(screen.getByRole('button', { name: 'PDF tools' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Split into 10 MB parts' }));
  await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('button', { name: 'Duplicate current page' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  await act(async () => { await jest.advanceTimersByTimeAsync(3_000); });
  await waitFor(() => expect(mockOperation).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Files ready', expect.any(String), expect.any(Array)));
  await fireEvent.press(screen.getByRole('button', { name: 'PDF tools' }));
  expect(screen.getByRole('button', { name: 'Open split PDF 1 · #21' })).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Open split PDF 2 · #22' }));
  expect(mockPush).toHaveBeenCalledWith('/more/pdf/22');
  await screen.unmount();
});

test('a connection failure retains the job and Check status resumes it without another mutation', async () => {
  jest.useFakeTimers();
  const screen = await openScreen();
  const queued = { id: 17, kind: 'compress', status: 'queued', progress: 0 } as unknown as PdfOperation;
  mockCreate.mockResolvedValue(queued);
  mockOperation.mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValueOnce({ ...queued, status: 'completed', progress: 100 });
  await fireEvent.press(screen.getByRole('button', { name: 'Rotate' }));
  await act(async () => { await jest.advanceTimersByTimeAsync(1_500); });
  await screen.findByText('Connection lost');
  expect(screen.getByRole('button', { name: 'Rotate' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Check PDF operation status' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Rotate' })).toBeEnabled());
  expect(mockCreate).toHaveBeenCalledTimes(1);
  expect(mockOperation.mock.calls).toEqual([[17], [17]]);
  await screen.unmount();
});

test('reopening a PDF resumes a queued job without creating a second one', async () => {
  jest.useFakeTimers();
  const queued = { id: 17, kind: 'compress', status: 'queued', progress: 0 } as unknown as PdfOperation;
  mockDocument.mockResolvedValueOnce({ ...source, recent_operations: [queued] }).mockResolvedValue(source);
  mockOperation.mockResolvedValueOnce({ ...queued, status: 'processing', progress: 40 }).mockResolvedValueOnce({ ...queued, status: 'completed', progress: 100 });
  const screen = await openScreen();
  await waitFor(() => expect(mockOperation).toHaveBeenCalledWith(17));
  expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  await act(async () => { await jest.advanceTimersByTimeAsync(1_500); });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled());
  expect(mockCreate).not.toHaveBeenCalled();
  expect(mockOperation.mock.calls).toEqual([[17], [17]]);
  await screen.unmount();
});

test('pending history disables operation taps until it settles', async () => {
  const screen = await openScreen();
  let finishHistory!: (document: PdfDocument) => void;
  mockHistory.mockImplementation(() => new Promise((resolve) => { finishHistory = resolve; }));
  await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
  expect(screen.getByRole('button', { name: 'Rotate' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Rotate' }));
  expect(mockHistory).toHaveBeenCalledTimes(1);
  expect(mockCreate).not.toHaveBeenCalled();
  await act(async () => finishHistory(source));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Rotate' })).toBeEnabled());
  await screen.unmount();
});

test('a late operation response after switching PDFs cannot change the new screen or release its action lock', async () => {
  jest.useFakeTimers();
  const second = { ...source, id: 4, title: 'Second sample', current_version_id: 21, content_url: '/api/pdf_documents/4/content' };
  mockDocument.mockImplementation(async (id) => id === 4 ? second : source);
  const screen = await openScreen();
  const queued = { id: 17, kind: 'compress', status: 'queued', progress: 0 } as unknown as PdfOperation;
  mockCreate.mockResolvedValue(queued);
  let finishOld!: (operation: PdfOperation) => void;
  let finishNew!: (operation: PdfOperation) => void;
  mockOperation.mockImplementation((id) => new Promise((resolve) => { if (id === 17) finishOld = resolve; else finishNew = resolve; }));
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  await fireEvent.press(screen.getByRole('button', { name: 'Rotate' }));
  await act(async () => { await jest.advanceTimersByTimeAsync(1_500); });
  expect(mockOperation).toHaveBeenCalledWith(17);

  mockDocumentId = '4';
  await screen.rerender(<QueryClientProvider client={client}><PdfDetailScreen /></QueryClientProvider>);
  await screen.findByText('Second sample');
  mockCreate.mockResolvedValue({ ...queued, id: 27 });
  await fireEvent.press(screen.getByRole('button', { name: 'Rotate' }));
  expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  await act(async () => finishOld({ ...queued, status: 'completed', result: { document_ids: [31, 32] }, document: { ...source, current_version_id: 12 } }));
  expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  expect(screen.getByText('Second sample')).toBeTruthy();
  expect(screen.getByTestId('pdf-preview').props.source.uri).toContain('pdf_version=21');
  expect(client.getQueryData(['pdf-document', 3])).toEqual(source);
  expect(invalidate).not.toHaveBeenCalled();
  expect(Alert.alert).not.toHaveBeenCalled();

  await act(async () => { await jest.advanceTimersByTimeAsync(1_500); });
  expect(mockOperation.mock.calls).toEqual([[17], [27]]);
  await act(async () => finishNew({ ...queued, id: 27, status: 'completed', document: second }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled());
  await screen.unmount();
});

test('unmounting before an operation request rejects suppresses alerts and refreshes', async () => {
  const screen = await openScreen();
  let rejectCreate!: (error: Error) => void;
  mockCreate.mockImplementation(() => new Promise((_, reject) => { rejectCreate = reject; }));
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  await fireEvent.press(screen.getByRole('button', { name: 'Rotate' }));
  await screen.unmount();
  await act(async () => rejectCreate(new Error('Late network error')));
  expect(Alert.alert).not.toHaveBeenCalled();
  expect(invalidate).not.toHaveBeenCalled();
  expect(mockOperation).not.toHaveBeenCalled();
  expect(mockDocument).toHaveBeenCalledTimes(1);
});

test('unmounting a queued operation cancels its polling timer without refreshing or alerting', async () => {
  jest.useFakeTimers();
  const screen = await openScreen();
  mockCreate.mockResolvedValue({ id: 17, kind: 'compress', status: 'queued', progress: 0 } as unknown as PdfOperation);
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  await fireEvent.press(screen.getByRole('button', { name: 'Rotate' }));
  await screen.findByText('Queued');
  await screen.unmount();
  await act(async () => { await jest.advanceTimersByTimeAsync(10_000); });
  expect(mockOperation).not.toHaveBeenCalled();
  expect(Alert.alert).not.toHaveBeenCalled();
  expect(invalidate).not.toHaveBeenCalled();
  expect(mockDocument).toHaveBeenCalledTimes(1);
});

test('a stale Check status tap cannot replace the operation already holding the lock', async () => {
  jest.useFakeTimers();
  const queued = { id: 17, kind: 'compress', status: 'queued', progress: 0 } as unknown as PdfOperation;
  mockDocument.mockResolvedValueOnce({ ...source, recent_operations: [queued] }).mockResolvedValue(source);
  mockOperation.mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValueOnce({ ...queued, status: 'completed' });
  const screen = await openScreen();
  await screen.findByText('Connection lost');
  // Capture the callback itself to model a native tap queued before React
  // replaces or disables this control, as fireEvent resolves current props.
  let fiber = screen.getByRole('button', { name: 'Check PDF operation status' }).unstable_fiber;
  while (fiber && typeof fiber.memoizedProps?.onPress !== 'function') fiber = fiber.return;
  const staleCheck = fiber!.memoizedProps.onPress;
  await fireEvent.press(screen.getByRole('button', { name: 'Check PDF operation status' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Rotate' })).toBeEnabled());

  const running = { ...queued, id: 27, status: 'processing', progress: 75 } as unknown as PdfOperation;
  mockCreate.mockResolvedValue(running);
  mockOperation.mockResolvedValueOnce({ ...running, status: 'completed' });
  await fireEvent.press(screen.getByRole('button', { name: 'Rotate' }));
  await screen.findByText('Processing · 75%');
  await act(async () => staleCheck());
  expect(screen.getByText('Processing · 75%')).toBeTruthy();
  expect(screen.queryByText('Queued')).toBeNull();
  expect(mockOperation.mock.calls).toEqual([[17], [17]]);
  await act(async () => { await jest.advanceTimersByTimeAsync(1_500); });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Rotate' })).toBeEnabled());
  await screen.unmount();
});

test('the only page cannot be deleted and demo documents expose sharing without modification tools', async () => {
  mockDocument.mockResolvedValue({ ...source, page_count: 1 });
  const screen = await openScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'PDF tools' }));
  expect(screen.getByRole('button', { name: 'Delete current page' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Delete current page' }));
  expect(mockCreate).not.toHaveBeenCalled();
  await screen.unmount();
  mockDemo = true;
  const demoScreen = await openScreen();
  expect(demoScreen.queryByRole('button', { name: 'Rotate' })).toBeNull();
  expect(demoScreen.getByRole('button', { name: 'Share' })).toBeEnabled();
  await demoScreen.unmount();
});
