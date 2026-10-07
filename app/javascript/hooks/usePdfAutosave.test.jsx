// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import usePdfAutosave from "./usePdfAutosave";

const objects = (text) => [
  { id: "text-1", type: "text", page_number: 1, text },
];
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

describe("PDF autosave", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("keeps the loaded baseline clean and debounces text edits", async () => {
    const save = vi.fn(async () => ({ baseVersionId: 2 }));
    const { result, rerender } = renderHook((props) => usePdfAutosave(props), {
      initialProps: {
        documentId: 1,
        baseVersionId: 1,
        objects: objects("Loaded"),
        enabled: true,
        save,
      },
    });
    await act(async () => vi.advanceTimersByTimeAsync(600));
    expect(save).not.toHaveBeenCalled();
    rerender({
      documentId: 1,
      baseVersionId: 1,
      objects: objects("Edited"),
      enabled: true,
      save,
    });
    expect(result.current.status).toBe("unsaved");
    await act(async () => vi.advanceTimersByTimeAsync(499));
    expect(save).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(save).toHaveBeenCalledWith({
      documentId: 1,
      objects: objects("Edited"),
      assets: {},
      baseVersionId: 1,
    });
    expect(result.current.status).toBe("saved");
    rerender({
      documentId: 1,
      baseVersionId: 1,
      objects: objects("Next edit"),
      enabled: true,
      save,
    });
    await act(async () => {
      await result.current.flush();
    });
    expect(save.mock.calls[1][0].baseVersionId).toBe(2);
  });

  it("serializes saves, retains the newest edit, and advances the acknowledged base", async () => {
    const first = deferred();
    const second = deferred();
    const save = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const onSaved = vi.fn();
    const base = {
      documentId: 1,
      baseVersionId: 4,
      enabled: true,
      save,
      onSaved,
    };
    const { result, rerender } = renderHook((props) => usePdfAutosave(props), {
      initialProps: { ...base, objects: objects("Loaded") },
    });
    rerender({ ...base, objects: objects("First") });
    let flushing;
    await act(async () => {
      flushing = result.current.saveNow();
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(1);
    rerender({ ...base, objects: objects("Newest") });
    await act(async () => {
      first.resolve({ baseVersionId: 5 });
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0]).toMatchObject({
      objects: objects("Newest"),
      baseVersionId: 5,
    });
    expect(onSaved.mock.calls[0][1]).toMatchObject({
      snapshot: objects("First"),
      hadNewerChanges: true,
    });
    await act(async () => {
      second.resolve({ baseVersionId: 6 });
      await flushing;
    });
    expect(result.current.status).toBe("saved");
    expect(result.current.busy).toBe(false);
  });

  it("retains failed edits for retry and never resends acknowledged asset files", async () => {
    const file = new File(["image"], "signature.png", { type: "image/png" });
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValue({ baseVersionId: 8 });
    const base = {
      documentId: 1,
      baseVersionId: 7,
      enabled: true,
      save,
      assets: new Map([
        ["asset-1", file],
        ["unused", file],
      ]),
    };
    const { result, rerender } = renderHook((props) => usePdfAutosave(props), {
      initialProps: { ...base, objects: [] },
    });
    const image = {
      id: "image-1",
      type: "signature",
      asset_id: "asset-1",
      x: 10,
    };
    rerender({ ...base, objects: [image] });
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(result.current.status).toBe("error");
    expect(save.mock.calls[0][0].assets).toEqual({ "asset-1": file });
    rerender({ ...base, objects: [{ ...image, x: 40 }] });
    await act(async () => vi.advanceTimersByTimeAsync(600));
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.retry();
    });
    expect(save.mock.calls[1][0]).toMatchObject({
      objects: [{ ...image, x: 40 }],
      assets: { "asset-1": file },
      baseVersionId: 7,
    });
    rerender({ ...base, objects: [{ ...image, x: 80 }] });
    await act(async () => {
      await result.current.flush();
    });
    expect(save.mock.calls[2][0]).toMatchObject({
      assets: {},
      baseVersionId: 8,
    });
  });

  it("pauses disabled saves and discards stale acknowledgements after switching documents", async () => {
    const pending = deferred();
    const save = vi.fn(() => pending.promise);
    const onSaved = vi.fn();
    const base = {
      documentId: 1,
      baseVersionId: 1,
      save,
      onSaved,
      enabled: false,
    };
    const { result, rerender } = renderHook((props) => usePdfAutosave(props), {
      initialProps: { ...base, objects: [] },
    });
    rerender({ ...base, objects: objects("Draft") });
    await act(async () => {
      await expect(result.current.flush()).rejects.toThrow(
        "Finish the current drawing or drag",
      );
      vi.advanceTimersByTime(600);
    });
    expect(save).not.toHaveBeenCalled();
    rerender({ ...base, enabled: true, objects: objects("Draft") });
    let saving;
    await act(async () => {
      saving = result.current.flush();
      await Promise.resolve();
    });
    rerender({
      ...base,
      documentId: 2,
      baseVersionId: 10,
      enabled: true,
      objects: objects("Other document"),
    });
    await act(async () => {
      pending.resolve({ baseVersionId: 2 });
      await saving;
    });
    expect(onSaved).not.toHaveBeenCalled();
    expect(result.current.status).toBe("saved");
    await act(async () => vi.advanceTimersByTimeAsync(600));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("protects unsaved edits before unloading and reset clears the pending baseline", () => {
    const save = vi.fn();
    const base = { documentId: 1, baseVersionId: 1, enabled: true, save };
    const { result, rerender } = renderHook((props) => usePdfAutosave(props), {
      initialProps: { ...base, objects: [] },
    });
    rerender({ ...base, objects: objects("Draft") });
    const dirtyEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirtyEvent);
    expect(dirtyEvent.defaultPrevented).toBe(true);
    act(() => result.current.reset(3, objects("Draft")));
    const cleanEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(cleanEvent);
    expect(cleanEvent.defaultPrevented).toBe(false);
    expect(result.current.status).toBe("saved");
  });

  it("waits for a gesture to end and immediately saves its final state when resumed", async () => {
    const first = deferred();
    const save = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue({ baseVersionId: 3 });
    const base = { documentId: 1, baseVersionId: 1, save };
    const { result, rerender } = renderHook((props) => usePdfAutosave(props), {
      initialProps: { ...base, enabled: true, objects: [] },
    });
    rerender({ ...base, enabled: true, objects: objects("Typed") });
    let pending;
    await act(async () => {
      pending = result.current.saveNow();
      await Promise.resolve();
    });
    rerender({ ...base, enabled: false, objects: objects("Moving") });
    await act(async () => {
      first.resolve({ baseVersionId: 2 });
      await pending;
    });
    expect(save).toHaveBeenCalledTimes(1);
    rerender({ ...base, enabled: false, objects: objects("Placed") });
    await act(async () => {
      await result.current.saveNow();
    });
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => {
      rerender({ ...base, enabled: true, objects: objects("Placed") });
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0]).toMatchObject({
      objects: objects("Placed"),
      baseVersionId: 2,
    });
    expect(result.current.status).toBe("saved");
  });

  it("saves the final debounced edit and its asset when the editor unmounts", async () => {
    const file = new File(["image"], "image.png", { type: "image/png" });
    const pending = deferred();
    const save = vi.fn(() => pending.promise);
    const onSaved = vi.fn();
    const onError = vi.fn();
    const base = {
      documentId: 12,
      baseVersionId: 40,
      enabled: true,
      save,
      onSaved,
      onError,
      assets: { "asset-1": file },
    };
    const { rerender, unmount } = renderHook((props) => usePdfAutosave(props), {
      initialProps: { ...base, objects: [] },
    });
    const image = { id: "image-1", type: "image", asset_id: "asset-1", x: 24 };
    rerender({ ...base, objects: [image] });
    await act(async () => {
      unmount();
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledExactlyOnceWith({
      documentId: 12,
      baseVersionId: 40,
      objects: [image],
      assets: { "asset-1": file },
    });
    await act(async () => {
      pending.resolve({ baseVersionId: 41 });
      await pending.promise;
    });
    expect(onSaved).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(600));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("finishes an in-flight save before saving a newer edit after unmount", async () => {
    const first = deferred();
    const second = deferred();
    const save = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const onSaved = vi.fn();
    const base = {
      documentId: 12,
      baseVersionId: 40,
      enabled: true,
      save,
      onSaved,
    };
    const { result, rerender, unmount } = renderHook(
      (props) => usePdfAutosave(props),
      { initialProps: { ...base, objects: objects("Loaded") } },
    );
    rerender({ ...base, objects: objects("First") });
    let flushing;
    await act(async () => {
      flushing = result.current.flush();
      await Promise.resolve();
    });
    rerender({ ...base, objects: objects("Final") });
    unmount();
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => {
      first.resolve({ baseVersionId: 41 });
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0]).toMatchObject({
      documentId: 12,
      objects: objects("Final"),
      baseVersionId: 41,
    });
    await act(async () => {
      second.resolve({ baseVersionId: 42 });
      await flushing;
    });
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("does not persist an incomplete gesture when unmounted", async () => {
    const save = vi.fn();
    const base = { documentId: 1, baseVersionId: 1, enabled: true, save };
    const { rerender, unmount } = renderHook((props) => usePdfAutosave(props), {
      initialProps: { ...base, objects: [] },
    });
    rerender({ ...base, enabled: false, objects: objects("Unfinished") });
    await act(async () => {
      unmount();
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("rejects a flush paused by an unfinished gesture and retains it for later saving", async () => {
    const first = deferred();
    const save = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue({ baseVersionId: 3 });
    const base = { documentId: 1, baseVersionId: 1, enabled: true, save };
    const { result, rerender } = renderHook((props) => usePdfAutosave(props), {
      initialProps: { ...base, objects: [] },
    });
    rerender({ ...base, objects: objects("First") });
    let flushing;
    await act(async () => {
      flushing = result.current.flush();
      await Promise.resolve();
    });
    const failedFlush = expect(flushing).rejects.toThrow(
      "Finish the current drawing or drag",
    );
    rerender({ ...base, enabled: false, objects: objects("Moving") });
    await act(async () => {
      first.resolve({ baseVersionId: 2 });
      await failedFlush;
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("unsaved");
    rerender({ ...base, enabled: true, objects: objects("Placed") });
    await act(async () => {
      await result.current.flush();
    });
    expect(save.mock.calls[1][0]).toMatchObject({
      objects: objects("Placed"),
      baseVersionId: 2,
    });
    expect(result.current.status).toBe("saved");
  });

  it("does not retry a failed save during cleanup", async () => {
    const save = vi.fn().mockRejectedValue(new Error("Offline"));
    const onError = vi.fn();
    const base = {
      documentId: 1,
      baseVersionId: 1,
      enabled: true,
      save,
      onError,
    };
    const { result, rerender, unmount } = renderHook(
      (props) => usePdfAutosave(props),
      { initialProps: { ...base, objects: [] } },
    );
    rerender({ ...base, objects: objects("Draft") });
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(result.current.status).toBe("error");
    expect(onError).toHaveBeenCalledTimes(1);
    await act(async () => {
      unmount();
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(save).toHaveBeenCalledTimes(1);
  });
});
