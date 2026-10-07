import { useCallback, useEffect, useRef, useState } from "react";

const EMPTY_OBJECTS = [];
const EMPTY_ASSETS = {};
const copyObjects = (objects) => JSON.parse(JSON.stringify(objects || []));
const snapshotFor = (objects) => {
  const snapshot = copyObjects(objects);
  return { objects: snapshot, key: JSON.stringify(snapshot) };
};
const assetEntries = (assets) =>
  assets instanceof Map ? [...assets.entries()] : Object.entries(assets || {});
const versionFrom = (result, fallback) =>
  result?.baseVersionId ??
  result?.document?.current_version_id ??
  result?.data?.document?.current_version_id ??
  result?.current_version_id ??
  result?.data?.current_version_id ??
  fallback;
const makeDocumentState = (documentId, baseVersionId, objects) => {
  const latest = snapshotFor(objects);
  return {
    documentId,
    baseVersionId,
    propVersionId: baseVersionId,
    latest,
    baselineKey: latest.key,
    promise: null,
    error: null,
    immediateRequested: false,
    acknowledgedAssets: new Set(),
    detachedContext: null,
  };
};

/** Saves editable PDF objects in order; a completed request can never replace newer local edits. */
export default function usePdfAutosave(options) {
  const {
    documentId,
    baseVersionId,
    objects = EMPTY_OBJECTS,
    assets = EMPTY_ASSETS,
    enabled = true,
  } = options;
  const optionsRef = useRef(options);
  optionsRef.current = { ...options, objects, assets, enabled };
  const documentRef = useRef(null);
  if (!documentRef.current)
    documentRef.current = makeDocumentState(documentId, baseVersionId, objects);
  const timerRef = useRef(null);
  const mountedRef = useRef(true);
  const [view, setView] = useState({
    status: "saved",
    error: null,
    busy: false,
  });
  const publish = useCallback((data, status, error = data.error) => {
    if (mountedRef.current && documentRef.current === data)
      setView({ status, error, busy: Boolean(data.promise) });
  }, []);
  const clearTimer = useCallback(() => {
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);
  const refreshLatest = useCallback((data) => {
    const context = data.detachedContext || optionsRef.current;
    if (String(context.documentId) === String(data.documentId))
      data.latest = snapshotFor(context.objects);
  }, []);

  const reset = useCallback(
    (versionId, nextObjects) => {
      clearTimer();
      const current = optionsRef.current;
      const data = makeDocumentState(
        current.documentId,
        versionId ?? current.baseVersionId,
        nextObjects ?? current.objects,
      );
      documentRef.current = data;
      publish(data, "saved");
    },
    [clearTimer, publish],
  );

  const drain = useCallback(() => {
    clearTimer();
    const data = documentRef.current;
    refreshLatest(data);
    const currentContext = () => data.detachedContext || optionsRef.current;
    if (data.promise) return data.promise;
    if (data.error) return Promise.reject(data.error);
    if (
      !currentContext().enabled ||
      !data.documentId ||
      data.latest.key === data.baselineKey
    ) {
      publish(data, data.latest.key === data.baselineKey ? "saved" : "unsaved");
      return Promise.resolve(undefined);
    }

    data.immediateRequested = false;
    // Defer the runner by one microtask so the shared promise exists before any callback runs.
    data.promise = Promise.resolve()
      .then(async () => {
        let lastResult;
        while (documentRef.current === data && currentContext().enabled) {
          refreshLatest(data);
          if (data.latest.key === data.baselineKey) break;
          const context = currentContext();
          const snapshot = {
            objects: copyObjects(data.latest.objects),
            key: data.latest.key,
          };
          const neededAssetIds = new Set(
            snapshot.objects
              .flatMap((object) =>
                [
                  object.asset_id,
                  object.temporary_asset_id,
                  object.assetId,
                ].filter(Boolean),
              )
              .map(String),
          );
          const pendingAssets = Object.fromEntries(
            assetEntries(context.assets).filter(
              ([id]) =>
                neededAssetIds.has(String(id)) &&
                !data.acknowledgedAssets.has(String(id)),
            ),
          );
          publish(data, "saving", null);
          const result = await context.save({
            documentId: data.documentId,
            objects: snapshot.objects,
            assets: pendingAssets,
            baseVersionId: data.baseVersionId,
          });
          if (documentRef.current !== data) return result;
          data.baseVersionId = versionFrom(result, data.baseVersionId);
          data.baselineKey = snapshot.key;
          Object.keys(pendingAssets).forEach((id) =>
            data.acknowledgedAssets.add(id),
          );
          refreshLatest(data);
          if (mountedRef.current) {
            await context.onSaved?.(result, {
              snapshot: snapshot.objects,
              hadNewerChanges: data.latest.key !== snapshot.key,
              baseVersionId: data.baseVersionId,
            });
          }
          lastResult = result;
        }
        return lastResult;
      })
      .catch((failure) => {
        if (documentRef.current === data) {
          data.error =
            failure instanceof Error ? failure : new Error(String(failure));
          publish(data, "error");
          try {
            if (mountedRef.current) currentContext().onError?.(data.error);
          } catch {
            /* Preserve the save failure. */
          }
        }
        throw failure;
      })
      .finally(() => {
        data.promise = null;
        if (documentRef.current === data) {
          refreshLatest(data);
          publish(
            data,
            data.error
              ? "error"
              : data.latest.key === data.baselineKey
                ? "saved"
                : "unsaved",
          );
        }
      });
    publish(data, "saving", null);
    return data.promise;
  }, [clearTimer, publish, refreshLatest]);

  useEffect(() => {
    if (String(documentRef.current.documentId) !== String(documentId))
      reset(baseVersionId, objects);
    const data = documentRef.current;
    refreshLatest(data);
    if (baseVersionId != null && baseVersionId !== data.propVersionId) {
      data.propVersionId = baseVersionId;
      if (!data.promise) data.baseVersionId = baseVersionId;
    }
    clearTimer();
    const dirty = data.latest.key !== data.baselineKey;
    if (!dirty) data.immediateRequested = false;
    if (data.error) publish(data, "error");
    else if (data.promise) publish(data, "saving");
    else publish(data, dirty ? "unsaved" : "saved");
    if (dirty && enabled && documentId && !data.promise && !data.error) {
      if (data.immediateRequested) drain().catch(() => {});
      else
        timerRef.current = window.setTimeout(() => {
          drain().catch(() => {});
        }, 500);
    }
    return clearTimer;
  }, [
    documentId,
    baseVersionId,
    objects,
    assets,
    enabled,
    clearTimer,
    drain,
    publish,
    refreshLatest,
    reset,
  ]);

  useEffect(() => {
    mountedRef.current = true;
    documentRef.current.detachedContext = null;
    const beforeUnload = (event) => {
      const data = documentRef.current;
      refreshLatest(data);
      if (!data.promise && data.latest.key === data.baselineKey) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      mountedRef.current = false;
      clearTimer();
      window.removeEventListener("beforeunload", beforeUnload);
      // Router navigation can remove the editor before its debounce expires.
      // Keep the final completed snapshot and its files alive while it saves;
      // callers should still await flush before leaving so errors remain visible.
      const data = documentRef.current;
      data.detachedContext = { ...optionsRef.current };
      refreshLatest(data);
      if (data.detachedContext.enabled && !data.error) drain().catch(() => {});
    };
  }, [clearTimer, drain, refreshLatest]);

  const retry = useCallback(() => {
    documentRef.current.error = null;
    return drain();
  }, [drain]);

  const saveNow = useCallback(() => {
    documentRef.current.immediateRequested = true;
    return drain();
  }, [drain]);

  const flush = useCallback(async () => {
    const result = await drain();
    const data = documentRef.current;
    refreshLatest(data);
    if (data.latest.key !== data.baselineKey) {
      if (data.error) throw data.error;
      throw new Error("Finish the current drawing or drag before saving.");
    }
    return result;
  }, [drain, refreshLatest]);

  return { ...view, flush, saveNow, retry, reset };
}
