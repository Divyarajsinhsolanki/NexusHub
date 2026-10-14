import React, { useEffect, useRef, useState } from 'react';
import { Phone, Video, X, RefreshCw } from 'lucide-react';
import { fetchCallHistory } from '../api';

export function formatCallDuration(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(value / 3600);
  return hours ? `${hours}h ${Math.floor(value % 3600 / 60)}m ${value % 60}s` : `${Math.floor(value / 60)}m ${value % 60}s`;
}
export default function CallHistory({ onClose, onCallback }) {
  const [rows, setRows] = useState([]);
  const [nextPage, setNextPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null);
  const loadingRef = useRef(false);
  const callbackRef = useRef(false);
  const mounted = useRef(true);
  const dialog = useRef(null);
  const retryPage = useRef(1);
  const load = async (page = 1) => {
    if (loadingRef.current) return;
    loadingRef.current = true; retryPage.current = page; setLoading(true); setError('');
    try {
      const { data } = await fetchCallHistory(page);
      if (!mounted.current) return;
      setRows(previous => page === 1 ? data.data : [...previous, ...data.data.filter(row => !previous.some(old => old.id === row.id))]);
      setNextPage(data.meta.next_page);
    } catch (requestError) {
      if (mounted.current) setError(requestError?.response?.data?.message || 'Unable to load call history.');
    } finally { loadingRef.current = false; if (mounted.current) setLoading(false); }
  };
  useEffect(() => {
    mounted.current = true; dialog.current?.showModal(); void load();
    return () => { mounted.current = false; };
  }, []);
  const callback = async row => {
    if (callbackRef.current) return;
    callbackRef.current = true; setPending(row.id); setError('');
    try { await onCallback(row); onClose(); }
    catch (requestError) { if (mounted.current) setError(requestError?.response?.data?.message || requestError?.message || 'Unable to call back. Try again.'); }
    finally { callbackRef.current = false; if (mounted.current) setPending(null); }
  };
  return <dialog ref={dialog} aria-labelledby="call-history-title" onCancel={onClose} className="m-auto w-[calc(100%_-_2rem)] max-w-xl max-h-[85dvh] rounded-2xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-xl backdrop:bg-black/50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white">
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900"><h2 id="call-history-title" className="text-lg font-bold">Call history</h2><div className="flex"><button aria-label="Refresh call history" disabled={loading || pending !== null} onClick={() => load()} className="p-3"><RefreshCw size={18}/></button><button aria-label="Close call history" onClick={onClose} className="p-3"><X size={20}/></button></div></header>
    <div className="space-y-3 p-4">
      {error && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}<button disabled={loading || pending !== null} onClick={() => load(retryPage.current)} className="ml-3 underline">Reload history</button></div>}
      {!loading && !rows.length && !error && <p className="py-10 text-center text-sm text-zinc-500">Your calls will appear here.</p>}
      {rows.map(row => <article key={row.id} className="flex items-center gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-700">{row.call_type === 'video' ? <Video className="shrink-0 text-[var(--theme-color)]" size={21}/> : <Phone className="shrink-0 text-[var(--theme-color)]" size={21}/>}<div className="min-w-0 flex-1"><h3 className="truncate font-semibold">{row.title}</h3><p className="mt-1 text-xs capitalize text-zinc-500 dark:text-zinc-400">{row.direction} · {row.participant_status === 'missed' ? 'Missed' : row.status} · {formatCallDuration(row.duration_seconds)}</p><time className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">{new Date(row.created_at).toLocaleString()}</time></div><button disabled={!row.can_callback || pending !== null} aria-label={`Call back ${row.title}`} onClick={() => callback(row)} className="shrink-0 rounded-lg bg-[var(--theme-color)] px-3 py-3 text-xs font-semibold text-white disabled:opacity-40">{pending === row.id ? 'Calling…' : 'Call back'}</button></article>)}
      {loading && <p role="status" className="py-4 text-center text-sm">Loading calls…</p>}
      {nextPage && !loading && <button onClick={() => load(nextPage)} className="w-full rounded-xl border border-zinc-200 p-3 text-sm font-semibold dark:border-zinc-700">Load older calls</button>}
    </div>
  </dialog>;
}
