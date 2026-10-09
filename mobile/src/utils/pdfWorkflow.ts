import type { EntityRecord, PdfDocument } from '../api/types';

export type MobilePdfOperation = EntityRecord & {
  kind: string;
  status: 'queued' | 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string | null;
  document?: PdfDocument | null;
  artifacts?: EntityRecord[];
};

export function pdfOperationIsActive(operation?: { status: string } | null) {
  return !!operation && ['queued', 'pending', 'processing'].includes(operation.status);
}

export class PdfOperationTimeoutError extends Error {
  constructor(public operation: MobilePdfOperation) {
    super('This PDF operation is still running. Check its status before starting another operation.');
  }
}

export class PdfOperationCancelledError extends Error {
  constructor() {
    super('PDF operation monitoring was cancelled.');
    this.name = 'AbortError';
  }
}

function assertMonitoringActive(signal?: AbortSignal) {
  if (signal?.aborted) throw new PdfOperationCancelledError();
}

function cancellableStep<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  assertMonitoringActive(signal);
  if (!signal) return task();
  return new Promise<T>((resolve, reject) => {
    const cancel = () => reject(new PdfOperationCancelledError());
    signal.addEventListener('abort', cancel, { once: true });
    task().then((value) => {
      signal.removeEventListener('abort', cancel);
      if (signal.aborted) reject(new PdfOperationCancelledError());
      else resolve(value);
    }, (error) => {
      signal.removeEventListener('abort', cancel);
      reject(signal.aborted ? new PdfOperationCancelledError() : error);
    });
  });
}

function waitForPoll(milliseconds: number, signal?: AbortSignal): Promise<void> {
  assertMonitoringActive(signal);
  return new Promise((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); reject(new PdfOperationCancelledError()); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', cancel); resolve(); }, milliseconds);
    signal?.addEventListener('abort', cancel, { once: true });
  });
}

export async function pollPdfOperation(
  initial: MobilePdfOperation,
  fetchOperation: (id: number) => Promise<MobilePdfOperation>,
  options: {
    attempts?: number;
    intervalMs?: number;
    wait?: (milliseconds: number) => Promise<unknown>;
    onUpdate?: (operation: MobilePdfOperation) => void;
    signal?: AbortSignal;
  } = {},
) {
  const { attempts = 60, intervalMs = 1_500, wait, onUpdate, signal } = options;
  let operation = initial;
  assertMonitoringActive(signal);
  onUpdate?.(operation);
  for (let attempt = 0; attempt < attempts && pdfOperationIsActive(operation); attempt += 1) {
    if (wait) await cancellableStep(() => wait(intervalMs), signal);
    else await waitForPoll(intervalMs, signal);
    operation = await cancellableStep(() => fetchOperation(operation.id), signal);
    assertMonitoringActive(signal);
    onUpdate?.(operation);
  }
  assertMonitoringActive(signal);
  if (operation.status === 'failed') throw new Error(operation.error || 'PDF operation failed.');
  if (pdfOperationIsActive(operation)) throw new PdfOperationTimeoutError(operation);
  if (operation.status !== 'completed') throw new Error('Unable to determine the PDF operation status.');
  return operation;
}

// The content route is stable, while react-native-pdf caches by URI. Versioning
// the URL and remounting the viewer ensures edits and undo load the right file.
export function pdfVersionedUri(uri?: string, versionId?: number, updatedAt?: string) {
  if (!uri) return undefined;
  const version = versionId ?? updatedAt;
  if (version == null) return uri;
  const [path, fragment] = uri.split('#', 2);
  return `${path}${path.includes('?') ? '&' : '?'}pdf_version=${encodeURIComponent(String(version))}${fragment ? `#${fragment}` : ''}`;
}

export function clampPdfPage(page: number, pageCount?: number) {
  const count = Math.max(1, Math.floor(pageCount || 1));
  return Math.min(count, Math.max(1, Math.floor(page) || 1));
}

export function pdfGeneratedDocumentIds(operation?: MobilePdfOperation | null) {
  if (operation?.status !== 'completed') return [];
  const result = operation.result as { document_ids?: unknown; document_id?: unknown } | undefined;
  const ids = Array.isArray(result?.document_ids) ? result.document_ids : [];
  // Single-result operations normally update the source document in place.
  // Splits return document_ids, which are separate documents in the library.
  return [...new Set(ids.filter((id): id is number => typeof id === 'number' && Number.isInteger(id) && id > 0))];
}

export function recentPdfOperations(value: unknown): MobilePdfOperation[] {
  if (!Array.isArray(value)) return [];
  return value.filter((operation): operation is MobilePdfOperation => !!operation && typeof operation === 'object'
    && typeof operation.id === 'number' && typeof operation.status === 'string' && typeof operation.kind === 'string');
}

export function pdfActionAllowed({ writable, busy, processing, pageCount, action, available = true }: {
  writable: boolean;
  busy: boolean;
  processing: boolean;
  pageCount?: number;
  action: 'modify' | 'delete_page' | 'history' | 'download';
  available?: boolean;
}) {
  if (busy || processing || !available) return false;
  if (action === 'download') return true;
  return writable && (action !== 'delete_page' || (pageCount || 0) > 1);
}

// React state updates do not synchronously disable a second tap. Keep the
// claim synchronous so rapid taps cannot launch overlapping mutations.
export class PdfActionLock {
  private held = false;

  acquire() {
    if (this.held) return null;
    this.held = true;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.held = false;
    };
  }
}
