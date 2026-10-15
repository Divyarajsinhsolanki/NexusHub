import React, { useEffect, useRef, useState } from 'react';
import { canChangeMessage } from '../../utils/chatState';
import { deleteChatMessage, pinChatMessage } from '../api';

export default function MessageBulkActions({ messages, selected, onSelection, onClose, conversationId, userId, readOnly, onChanged, onBusy }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; onBusy(false); }; }, [onBusy]);
  const eligible = messages.filter(m => m.id > 0 && !m.deleted_at && m.message_type !== 'system');
  const chosen = eligible.filter(m => selected.has(m.id)).sort((a, b) => a.id - b.id);
  const deletable = chosen.length > 0 && chosen.every(m => canChangeMessage(m, userId));
  useEffect(() => {
    if (!busy && chosen.length !== selected.size) onSelection(new Set(chosen.map(message => message.id)));
  }, [messages, selected, busy, onSelection]);
  const apply = async action => {
    if (pending.current || !chosen.length || readOnly) return;
    if (action === 'delete' && (!deletable || !window.confirm(`Delete ${chosen.length} selected messages for everyone? This cannot be undone.`))) return;
    pending.current = true; setBusy(true); onBusy(true); setError('');
    const failed = [];
    for (const message of chosen) {
      if (!mounted.current) break;
      try {
        const { data } = action === 'delete' ? await deleteChatMessage(conversationId, message.id) : await pinChatMessage(conversationId, message.id, action === 'pin');
        onChanged(conversationId, data);
      } catch { failed.push(message.id); }
    }
    if (!mounted.current) return;
    onSelection(new Set(failed));
    if (failed.length) setError(`${chosen.length - failed.length} updated; ${failed.length} failed. Retry the selected messages.`);
    else onClose();
    pending.current = false; setBusy(false); onBusy(false);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(chosen.map(m => m.body || '[Attachment]').join('\n\n')); setError('Messages copied.'); }
    catch { setError('Could not copy messages. Please try again.'); }
  };
  return <section className="chat-bulk-actions chat-message-selection" aria-label="Selected messages" aria-busy={busy}>
    <div className="flex items-center justify-between"><strong role="status">{chosen.length} messages selected</strong><button type="button" disabled={busy} onClick={onClose}>Cancel message selection</button></div>
    <div className="flex flex-wrap">
      <button type="button" disabled={busy} onClick={() => onSelection(new Set(eligible.slice(0, 100).map(m => m.id)))}>Select loaded messages</button>
      <button type="button" disabled={busy || !selected.size} onClick={() => onSelection(new Set())}>Clear message selection</button>
      <button type="button" disabled={busy || !chosen.length} onClick={copy}>Copy selected messages</button>
      {!readOnly && <><button type="button" disabled={busy || !chosen.length} onClick={() => apply('pin')}>Pin selected messages</button><button type="button" disabled={busy || !chosen.length} onClick={() => apply('unpin')}>Unpin selected messages</button><button type="button" disabled={busy || !deletable} onClick={() => apply('delete')}>Delete selected messages</button></>}
    </div>
    {!readOnly && chosen.length > 0 && !deletable && <p>Delete is available only when all selected messages are yours and less than 15 minutes old.</p>}
    <p className="text-xs">Select up to 100 loaded messages. Attachments are not copied.</p>
    {error && <p role="status">{error}</p>}
  </section>;
}
