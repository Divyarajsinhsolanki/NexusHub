import React, { useState } from 'react';
import OperationsDrawer, { Field } from './OperationsDrawer';
import { errorMessage } from './operationsModel';

export default function EnvironmentManager({ environments, onSave, onDelete, onClose, writable, revision }) {
  const [draftRevision, setDraftRevision] = useState(revision);
  const [record, setRecord] = useState({ name: '', url: '', description: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(null);
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { const result = await onSave(record, draftRevision); setDraftRevision(result.revision); setRecord({ name: '', url: '', description: '' }); } catch (failure) { setError(errorMessage(failure)); } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError('');
    try {
      const result = await onDelete(deleting.id, deleting.revision);
      // A deletion is a separate draft. Do not bless another environment's
      // unfinished edit with the newer revision after deleting a record.
      if (!record.id || record.id === deleting.id) {
        setDraftRevision(result.revision);
        if (record.id) setRecord({ name: '', url: '', description: '' });
      }
      setDeleting(null);
    } catch (failure) { setError(errorMessage(failure)); } finally { setBusy(false); }
  }
  return <OperationsDrawer title="Manage environments" subtitle="Shared with your project Vault" onClose={onClose} busy={busy}><div className="ops-drawer-body"><ul className="ops-environment-list">{environments.map(env => <li key={env.id}><div><strong>{env.name}</strong><p>{env.description || env.url}</p></div>{writable && <><button type="button" disabled={busy} aria-label={`Edit ${env.name}`} onClick={() => { setRecord({ ...env }); setDraftRevision(revision); }}>Edit</button><button type="button" disabled={busy} aria-label={`Delete ${env.name}`} onClick={() => setDeleting({ ...env, revision })}>Delete</button></>}</li>)}</ul>{writable && <form onSubmit={save} className="ops-form-fields"><h3>{record.id ? `Edit ${record.name}` : 'New environment'}</h3><Field label="Environment name"><input required disabled={busy} value={record.name} onChange={event => setRecord({ ...record, name: event.target.value })} placeholder="Production" /></Field><Field label="Application URL"><input type="url" disabled={busy} value={record.url || ''} onChange={event => setRecord({ ...record, url: event.target.value })} /></Field><Field label="Description"><textarea disabled={busy} value={record.description || ''} onChange={event => setRecord({ ...record, description: event.target.value })} /></Field><button className="ops-primary" disabled={busy}>{busy ? 'Saving…' : record.id ? 'Save environment' : 'Add environment'}</button>{record.id && <button type="button" disabled={busy} onClick={() => { setRecord({ name: '', url: '', description: '' }); setDraftRevision(revision); }}>Cancel edit</button>}</form>}{deleting && <div className="ops-danger-confirm"><p>Delete {deleting.name}? Environments used by operations records must have those records removed or reassigned first. Existing Vault items remain.</p><button type="button" disabled={busy} onClick={remove}>Confirm delete environment</button><button type="button" disabled={busy} onClick={() => setDeleting(null)}>Cancel</button></div>}{error && <p role="alert" className="ops-error">{error}</p>}</div></OperationsDrawer>;
}
