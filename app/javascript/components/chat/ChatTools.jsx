import React, { useEffect, useRef, useState } from 'react';
import { fetchConversationMessages, fetchScheduledMessages, scheduleChatMessage, cancelScheduledMessage, pinChatMessage } from '../api';
import { prepareChatUpload } from '../../utils/chatUploads';

export default function ChatTools({ conversationId, thread, onCloseThread, onReply, onOpen, draft, onScheduled, readOnly, unreadId, onJumpUnread }) {
  const [mode, setMode] = useState(null);
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [when, setWhen] = useState('');
  const dialog = useRef(null);
  const request = useRef(0);
  const scheduledDraft = useRef(null);
  const selectedMode = thread ? 'thread' : mode;
  const threadId = thread?.reply_to_id || thread?.id;
  const load = async (before) => {
    const token = ++request.current;
    setBusy(true); setError('');
    try {
      const { data } = selectedMode === 'scheduled' ? await fetchScheduledMessages(conversationId, before) : await fetchConversationMessages(conversationId, { limit: 50, ...(selectedMode === 'pins' ? { pinned: true } : ['media', 'files'].includes(selectedMode) ? { attachments: selectedMode } : { thread_id: threadId }), ...(before ? { before_id: before } : {}) });
      if (request.current !== token) return;
      setRows(previous => before ? [...(data.data || []), ...previous] : data.data || []);
      setMeta(data.meta || {});
    } catch { if (request.current === token) setError('Could not load messages. Please retry.'); }
    finally { if (request.current === token) setBusy(false); }
  };
  const close = () => { setMode(null); onCloseThread(); };
  useEffect(() => {
    setRows([]); setMeta({}); setWhen(''); setError('');
    if (selectedMode) { dialog.current?.showModal?.(); load(); }
    else dialog.current?.close?.();
    return () => { ++request.current; };
  }, [selectedMode, threadId, conversationId]);
  const mutate = async (operation) => {
    setBusy(true); setError('');
    try { await operation(); await load(); }
    catch (err) { setError(err.response?.data?.errors?.join(', ') || 'Could not update this message. Please retry.'); }
    finally { setBusy(false); }
  };
  const schedule = async () => {
    const date = new Date(when);
    if (!when || !Number.isFinite(date.getTime()) || date <= new Date()) { setError('Choose a future date and time.'); return; }
    const snapshot = { ...draft };
    await mutate(async () => {
      const form = new FormData();
      form.append('message[body]', snapshot.body);
      const cached = scheduledDraft.current;
      const same = cached && cached.body === snapshot.body && cached.attachments === snapshot.attachments && cached.replyTo?.id === snapshot.replyTo?.id && cached.when === when;
      const clientId = same ? cached.clientId : crypto.randomUUID();
      scheduledDraft.current = { ...snapshot, when, clientId };
      form.append('message[client_id]', clientId);
      form.append('message[send_at]', date.toISOString());
      if (snapshot.replyTo) form.append('message[reply_to_id]', snapshot.replyTo.id);
      for (const file of snapshot.attachments || []) form.append('message[attachments][]', await prepareChatUpload(file));
      await scheduleChatMessage(conversationId, form);
      onScheduled(snapshot);
    });
  };
  return <>
    <div className="chat-tools-toolbar">{unreadId > 0 && <button type="button" onClick={onJumpUnread}>Jump to unread</button>}<button type="button" onClick={() => setMode('media')}>Shared media</button><button type="button" onClick={() => setMode('files')}>Shared files</button><button type="button" onClick={() => setMode('pins')}>Pinned messages</button><button type="button" onClick={() => setMode('scheduled')}>Scheduled messages</button></div>
    <dialog ref={dialog} className="chat-tools-dialog" onCancel={close} onClose={() => { if (selectedMode) close(); }}>
      <header><h2>{selectedMode === 'thread' ? 'Reply thread' : selectedMode === 'pins' ? 'Pinned messages' : selectedMode === 'media' ? 'Shared media' : selectedMode === 'files' ? 'Shared files' : 'Scheduled messages'}</h2><button type="button" aria-label="Close chat tools" onClick={close}>×</button></header>
      {error && <p role="alert">{error} <button disabled={busy} onClick={() => load()}>Retry</button></p>}
      {busy && <p role="status">Loading…</p>}
      {!busy && !rows.length && <p>No {selectedMode === 'pins' ? 'pinned' : selectedMode === 'scheduled' ? 'scheduled' : selectedMode === 'media' ? 'shared media' : selectedMode === 'files' ? 'shared file' : 'thread'} messages yet.</p>}
      <div className="chat-tools-rows">{rows.map(row => <article key={row.id}><strong>{row.user_name || (row.send_at ? new Date(row.send_at).toLocaleString() : 'Message')}</strong><p>{row.body || 'Attachment'}</p>{row.attachment_count > 0 && <small>{row.attachment_count} attachment(s)</small>}{row.attachments?.filter(file => !['media', 'files'].includes(selectedMode) || (selectedMode === 'media') === /^(image|video|audio)\//.test(String(file.content_type || ''))).map(file => <div key={file.id}>{file.content_type?.startsWith('image/') && <img src={file.url} alt={file.filename} loading="lazy" decoding="async" style={{ maxWidth: '100%', maxHeight: 240, objectFit: 'contain' }} />}{file.content_type?.startsWith('video/') && <video src={file.url} controls preload="metadata" aria-label={file.filename} style={{ maxWidth: '100%', maxHeight: 240 }} />}<a href={file.url} target="_blank" rel="noreferrer">{file.filename}</a></div>)}
        {selectedMode === 'scheduled' ? <button disabled={busy} onClick={() => mutate(() => cancelScheduledMessage(conversationId, row.id))}>Cancel scheduled send</button> : <><button onClick={() => { close(); onOpen(row.id); }}>Open in conversation</button>{selectedMode === 'pins' && !readOnly && <button disabled={busy} onClick={() => mutate(() => pinChatMessage(conversationId, row.id, false))}>Unpin</button>}</>}
      </article>)}</div>
      {meta.has_more && <button disabled={busy} onClick={() => load(meta.next_before_id)}>Load older messages</button>}
      {selectedMode === 'thread' && !readOnly && !meta.thread_root?.deleted_at && <button disabled={busy || !meta.thread_root} onClick={() => { onReply(meta.thread_root); close(); }}>Reply in thread</button>}
      {selectedMode === 'scheduled' && !readOnly && <section><h3>Schedule your current draft</h3><p>{draft.body || (draft.attachments?.length ? `${draft.attachments.length} attachment(s)` : 'Write a message in the composer first.')}</p><label>Send at <input aria-label="Scheduled send date and time" type="datetime-local" value={when} onChange={event => setWhen(event.target.value)} /></label><small>Times use your device’s timezone.</small><button disabled={busy || (!draft.body.trim() && !draft.attachments?.length)} onClick={schedule}>Schedule message</button></section>}
    </dialog>
  </>;
}
