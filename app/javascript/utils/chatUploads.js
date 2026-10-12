const prepared = new WeakMap();

// Re-encode large photos only. Preserve animated images, transparent PNGs,
// documents and videos, and fall back to the original on unsupported browsers.
export function prepareChatUpload(file) {
  if (!file || file.size < 1024 * 1024 || !["image/jpeg", "image/webp"].includes(file.type) || typeof createImageBitmap !== "function") return Promise.resolve(file);
  if (prepared.has(file)) return prepared.get(file);
  const result = compressPhoto(file);
  prepared.set(file, result);
  return result;
}
async function compressPhoto(file) {
  let bitmap;
  let canvas;
  try {
    // Animated WebP must keep all frames.
    if (file.type === "image/webp") {
      const bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer());
      if (String.fromCharCode(...bytes.slice(12, 16)) === "VP8X" && (bytes[20] & 2)) return file;
    }
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, file.type, 0.85));
    if (!blob || blob.type !== file.type || blob.size >= file.size) return file;
    return new File([blob], file.name, { type: blob.type, lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    bitmap?.close?.();
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}
