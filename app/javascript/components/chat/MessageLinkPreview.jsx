import React, { useEffect, useState } from 'react';
import api from '../api';
import { splitMessageLinks } from '../../utils/messageLinks';

export default function MessageLinkPreview({ message, conversationId }) {
  const url = splitMessageLinks(message.body).find(part => part.url)?.url;
  const [preview, setPreview] = useState(null);
  useEffect(() => {
    setPreview(null);
    if (!url || message.id <= 0 || message.deleted_at) return;
    const controller = new AbortController();
    api.get(`/conversations/${conversationId}/messages/${message.id}/link_preview`, { params: { url }, signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted && data.title) setPreview(data); }).catch(() => {});
    return () => controller.abort();
  }, [url, message.id, conversationId, message.deleted_at]);
  if (!preview) return null;
  return <a href={url} target="_blank" rel="noopener noreferrer" className="mt-2 block max-w-sm overflow-hidden rounded-lg border border-slate-300 bg-white text-slate-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-slate-100">
    {preview.image && <img src={preview.image} alt="" loading="lazy" referrerPolicy="no-referrer" className="max-h-40 w-full object-cover" onError={event => { event.currentTarget.hidden = true; }} />}
    <div className="p-3"><span className="text-xs text-slate-500 dark:text-slate-400">{preview.hostname}</span><strong className="block text-sm">{preview.title}</strong>{preview.description && <p className="mt-1 line-clamp-3 text-xs">{preview.description}</p>}</div>
  </a>;
}
