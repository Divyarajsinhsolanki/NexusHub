import React, { useRef, useState } from 'react';
import { deleteConversation, muteConversation, unmuteConversation } from '../api';

export default function ConversationBulkActions({ selected, onSelection, visibleIds, onUpdated, onRemoved, onClose, onBusy }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stage, setStage] = useState(null);
  const pending = useRef(false);
  const apply = async (action, duration) => {
    if (pending.current || !selected.size) return;
    pending.current = true; setBusy(true); onBusy?.(true); setError(''); setStage(null);
    const ids = [...selected];
    // Limit concurrency and retain failed selections so retry cannot repeat successful actions.
    const failed = [];
    for (const id of ids) {
      try {
        if (action === 'delete') { await deleteConversation(id); onRemoved(id); }
        else { const { data } = action === 'mute' ? await muteConversation(id, duration) : await unmuteConversation(id); onUpdated(data); }
      } catch { failed.push(id); }
    }
    onSelection(new Set(failed));
    if (failed.length) setError(`${ids.length - failed.length} updated; ${failed.length} could not be updated. Retry the selected chats.`);
    else onClose();
    pending.current = false; setBusy(false); onBusy?.(false);
  };
  return <section className="chat-bulk-actions" aria-label="Selected conversations" aria-busy={busy}>
    <div className="flex items-center justify-between gap-2"><strong role="status">{selected.size} selected</strong><button type="button" disabled={busy} onClick={onClose}>Cancel selection</button></div>
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={busy || !selected.size} onClick={() => onSelection(new Set())}>Clear chat selection</button><button type="button" disabled={busy || !visibleIds.length} onClick={() => onSelection(new Set([...selected, ...visibleIds]))}>Select visible</button>
      <button type="button" disabled={busy || !selected.size} onClick={() => setStage('mute')}>Mute selected</button>
      <button type="button" disabled={busy || !selected.size} onClick={() => apply('unmute')}>Unmute selected</button>
      <button type="button" disabled={busy || !selected.size} onClick={() => setStage('delete')}>Delete selected for me</button>
    </div>
    {stage === 'mute' && <div role="group" aria-label="Mute selected chats for">{[['1h', '1 hour'], ['8h', '8 hours'], ['1w', '1 week'], ['forever', 'Until I unmute']].map(([id, label]) => <button type="button" key={id} onClick={() => apply('mute', id)}>{label}</button>)}<button type="button" onClick={() => setStage(null)}>Back</button></div>}
    {stage === 'delete' && <div role="group" aria-label="Confirm deleting selected chats"><p>Remove {selected.size} chats from your inbox? Other members keep their messages.</p><button type="button" onClick={() => apply('delete')}>Confirm delete for me</button><button type="button" onClick={() => setStage(null)}>Back</button></div>}
    {busy && <p role="status">Updating selected chats…</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
