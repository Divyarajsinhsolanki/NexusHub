import { describe, expect, jest, test } from '@jest/globals';

import { clampPdfPage, MobilePdfOperation, PdfActionLock, pdfActionAllowed, pdfGeneratedDocumentIds, PdfOperationCancelledError, PdfOperationTimeoutError, pdfVersionedUri, pollPdfOperation } from './pdfWorkflow';

const operation = (status: MobilePdfOperation['status'], overrides: Partial<MobilePdfOperation> = {}): MobilePdfOperation => ({ id: 17, kind: 'compress', status, progress: 0, ...overrides });
const wait = async () => undefined;

describe('mobile PDF operation monitoring', () => {
  test('polls a queued operation through processing and completion', async () => {
    const fetch = jest.fn<(id: number) => Promise<MobilePdfOperation>>()
      .mockResolvedValueOnce(operation('processing', { progress: 50 }))
      .mockResolvedValueOnce(operation('completed', { progress: 100 }));
    const update = jest.fn();
    const result = await pollPdfOperation(operation('queued'), fetch, { wait, onUpdate: update });

    expect(result.status).toBe('completed');
    expect(fetch.mock.calls).toEqual([[17], [17]]);
    expect(update.mock.calls.map(([value]) => (value as MobilePdfOperation).status)).toEqual(['queued', 'processing', 'completed']);
  });

  test('retains legacy pending support and reports a server failure', async () => {
    const failed = operation('failed', { error: 'The PDF password is incorrect.' });
    const fetch = jest.fn<(id: number) => Promise<MobilePdfOperation>>().mockResolvedValue(failed);
    await expect(pollPdfOperation(operation('pending'), fetch, { wait })).rejects.toThrow('The PDF password is incorrect.');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('a timeout retains the accepted operation for status recovery', async () => {
    const running = operation('processing', { progress: 80 });
    const fetch = jest.fn<(id: number) => Promise<MobilePdfOperation>>().mockResolvedValue(running);
    try {
      await pollPdfOperation(operation('queued'), fetch, { wait, attempts: 2 });
      throw new Error('Expected polling to time out');
    } catch (error) {
      expect(error).toBeInstanceOf(PdfOperationTimeoutError);
      const timeout = error as PdfOperationTimeoutError;
      expect(timeout.operation).toEqual(running);
      fetch.mockResolvedValueOnce(operation('completed'));
      expect((await pollPdfOperation(timeout.operation, fetch, { wait })).status).toBe('completed');
    }
    expect(fetch.mock.calls).toEqual([[17], [17], [17]]);
  });

  test('network failure leaves the last operation available and does not pretend it completed', async () => {
    const update = jest.fn();
    const fetch = jest.fn<(id: number) => Promise<MobilePdfOperation>>().mockRejectedValue(new Error('Connection lost'));
    await expect(pollPdfOperation(operation('queued'), fetch, { wait, onUpdate: update })).rejects.toThrow('Connection lost');
    expect(update).toHaveBeenLastCalledWith(operation('queued'));
  });

  test('completed immediate operations do not poll', async () => {
    const fetch = jest.fn<(id: number) => Promise<MobilePdfOperation>>();
    expect(await pollPdfOperation(operation('completed'), fetch, { wait })).toEqual(operation('completed'));
    expect(fetch).not.toHaveBeenCalled();
  });

  test('a cancelled monitor does not report its initial state or make a request', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetch = jest.fn<(id: number) => Promise<MobilePdfOperation>>();
    const update = jest.fn();
    await expect(pollPdfOperation(operation('queued'), fetch, { signal: controller.signal, onUpdate: update })).rejects.toBeInstanceOf(PdfOperationCancelledError);
    expect(fetch).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  test('cancelling while waiting clears the timer and stops polling', async () => {
    jest.useFakeTimers();
    try {
      const controller = new AbortController();
      const fetch = jest.fn<(id: number) => Promise<MobilePdfOperation>>();
      const result = pollPdfOperation(operation('queued'), fetch, { signal: controller.signal });
      const cancelled = expect(result).rejects.toBeInstanceOf(PdfOperationCancelledError);
      expect(jest.getTimerCount()).toBe(1);
      controller.abort();
      await cancelled;
      expect(jest.getTimerCount()).toBe(0);
      await jest.advanceTimersByTimeAsync(10_000);
      expect(fetch).not.toHaveBeenCalled();
    } finally { jest.useRealTimers(); }
  });

  test('cancelling an in-flight request ignores its eventual result', async () => {
    const controller = new AbortController();
    let complete!: (operation: MobilePdfOperation) => void;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const fetch = jest.fn<(id: number) => Promise<MobilePdfOperation>>().mockImplementation(() => new Promise((resolve) => { complete = resolve; markStarted(); }));
    const update = jest.fn();
    const result = pollPdfOperation(operation('queued'), fetch, { wait, signal: controller.signal, onUpdate: update });
    await started;
    controller.abort();
    await expect(result).rejects.toBeInstanceOf(PdfOperationCancelledError);
    complete(operation('completed'));
    await Promise.resolve();
    expect(update.mock.calls.map(([value]) => (value as MobilePdfOperation).status)).toEqual(['queued']);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

test('preview URI changes with edits and undo while preserving existing query and fragment', () => {
  const uri = 'https://example.test/api/pdf_documents/3/content?token=abc#page=2';
  expect(pdfVersionedUri(uri, 10)).toBe('https://example.test/api/pdf_documents/3/content?token=abc&pdf_version=10#page=2');
  expect(pdfVersionedUri(uri, 11)).not.toBe(pdfVersionedUri(uri, 10));
  expect(pdfVersionedUri(uri, 10)).toBe(pdfVersionedUri(uri, 10));
  expect(pdfVersionedUri('/content', undefined, '2026-10-09T12:00:00Z')).toBe('/content?pdf_version=2026-10-09T12%3A00%3A00Z');
  expect(pdfVersionedUri(undefined, 10)).toBeUndefined();
});

test('current page stays valid when deleting, undoing, or reopening shorter documents', () => {
  expect(clampPdfPage(5, 4)).toBe(4);
  expect(clampPdfPage(4, 2)).toBe(2);
  expect(clampPdfPage(2, 5)).toBe(2);
  expect(clampPdfPage(0, 3)).toBe(1);
  expect(clampPdfPage(Number.NaN, 3)).toBe(1);
});

test('split results expose each generated PDF without exposing the source as a generated file', () => {
  expect(pdfGeneratedDocumentIds(operation('completed', { result: { document_ids: [21, 22, 21, -1, '23'] } }))).toEqual([21, 22]);
  expect(pdfGeneratedDocumentIds(operation('completed', { result: { document_id: 3 } }))).toEqual([]);
  expect(pdfGeneratedDocumentIds(operation('processing', { result: { document_ids: [21] } }))).toEqual([]);
});

test('unavailable, overlapping, and last-page destructive actions are disabled', () => {
  const state = { writable: true, busy: false, processing: false, pageCount: 1 };
  expect(pdfActionAllowed({ ...state, action: 'delete_page' })).toBe(false);
  expect(pdfActionAllowed({ ...state, action: 'delete_page', pageCount: 2 })).toBe(true);
  expect(pdfActionAllowed({ ...state, action: 'history', available: false })).toBe(false);
  expect(pdfActionAllowed({ ...state, action: 'history', busy: true })).toBe(false);
  expect(pdfActionAllowed({ ...state, action: 'modify', processing: true })).toBe(false);
  expect(pdfActionAllowed({ ...state, action: 'modify', writable: false })).toBe(false);
  expect(pdfActionAllowed({ ...state, action: 'download', writable: false })).toBe(true);
  expect(pdfActionAllowed({ ...state, action: 'download', processing: true })).toBe(false);
});

test('rapid taps cannot claim a second action before React disables its control', () => {
  const lock = new PdfActionLock();
  const release = lock.acquire()!;
  expect(lock.acquire()).toBeNull();
  release();
  const secondRelease = lock.acquire();
  expect(secondRelease).not.toBeNull();
  release();
  expect(lock.acquire()).toBeNull();
  secondRelease!();
  expect(lock.acquire()).not.toBeNull();
});
