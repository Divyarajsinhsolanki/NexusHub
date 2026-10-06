import { absoluteAssetUrl } from '../api/client';

export function attachmentMedia(file: Record<string, unknown>) {
  const filename = typeof file.filename === 'string' ? file.filename : typeof file.name === 'string' ? file.name : 'Attachment';
  const rawUrl = typeof file.url === 'string' ? file.url : typeof file.download_url === 'string' ? file.download_url : '';
  const url = /^(https?:\/\/|file:|content:|\/)/i.test(rawUrl) ? (rawUrl.startsWith('/') ? absoluteAssetUrl(rawUrl) || '' : rawUrl) : '';
  const mime = String(file.content_type || file.mime_type || '').toLowerCase().split(';')[0].trim();
  let name = filename;
  if (name === 'Attachment' && url) {
    try { name = decodeURIComponent(new URL(url).pathname); } catch { /* Use the MIME type for non-HTTP assets. */ }
  }
  const infer = !mime || mime === 'application/octet-stream';
  const kind = mime.startsWith('image/') || (infer && /\.(png|jpe?g|gif|webp|heic|heif|avif)$/i.test(name)) ? 'image'
    : mime.startsWith('video/') || (infer && /\.(mp4|mov|m4v|webm|3gp)$/i.test(name)) ? 'video' : 'file';
  return { filename, url, kind };
}
