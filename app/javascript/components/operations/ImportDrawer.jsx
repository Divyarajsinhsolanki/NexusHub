import React, { useState } from 'react';
import OperationsDrawer, { Field } from './OperationsDrawer';
import { operationsApi } from '../../lib/operationsApi';
import { errorMessage } from './operationsModel';

export default function ImportDrawer({ projectId, snapshot, environmentId, format: initialFormat, onClose, onCommit }) {
  const [format, setFormat] = useState(initialFormat || 'env');
  const [destination, setDestination] = useState('observed');
  const [envId, setEnvId] = useState(String(environmentId || snapshot.environments[0]?.id || ''));
  const [file, setFile] = useState(null);
  const [content, setContent] = useState('');
  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState([]);
  const [publicKeys, setPublicKeys] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function readFile(event) {
    setPreview(null); setContent(''); setError('');
    const chosen = event.target.files[0]; setFile(chosen || null);
    if (!chosen) return;
    if (chosen.size > 1024 * 1024) { setError('Choose a file smaller than 1 MB.'); return; }
    try { setContent(await chosen.text()); } catch { setError('Unable to read that file.'); }
  }
  async function review(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { const { data } = await operationsApi.previewImport(projectId, { format, environment_id: Number(envId), content, version_destination: destination }); setPreview(data); setSelected((data.rows || []).map(row => row.name)); setPublicKeys([]); }
    catch (failure) { setError(errorMessage(failure)); } finally { setBusy(false); }
  }
  async function commit() {
    setBusy(true); setError('');
    try { await onCommit({ format, environment_id: Number(envId), content, revision: preview.revision, selected_keys: selected, public_keys: publicKeys.filter(key => selected.includes(key)), version_destination: destination }); setContent(''); onClose(); }
    catch (failure) { setError(errorMessage(failure)); } finally { setBusy(false); }
  }
  const toggle = (list, name, checked) => checked ? [...list, name] : list.filter(key => key !== name);
  return <OperationsDrawer title="Import configuration or versions" subtitle="Review selected records before merging" onClose={onClose} busy={busy}><form onSubmit={review} className="ops-drawer-form"><div className="ops-drawer-body">
    <Field label="Import format"><select value={format} disabled={busy} onChange={event => { setFormat(event.target.value); setPreview(null); }}><option value="env">.env variables</option><option value="versions">Software versions CSV</option></select></Field>
    {format === 'versions' && <><Field label="Version destination"><select value={destination} disabled={busy} onChange={event => { setDestination(event.target.value); setPreview(null); }}><option value="observed">Recorded installed versions</option><option value="expected">Approved expected versions</option></select></Field><p className="ops-muted">{destination === 'observed' ? 'Observations do not change approved expected versions. A member must confirm matching installed versions after import.' : 'Update the approved baseline. Recorded installed versions remain unchanged.'}</p><a className="ops-download" href={`data:text/csv;charset=utf-8,${encodeURIComponent(`name,${destination}_version,ecosystem\nRedis,7.2.1,infrastructure\n`)}`} download={`software-${destination}-versions.csv`}>Download CSV template</a></>}
    <Field label="Destination environment"><select required value={envId} disabled={busy} onChange={event => { setEnvId(event.target.value); setPreview(null); }}><option value="">Select environment</option>{snapshot.environments.map(env => <option key={env.id} value={env.id}>{env.name}</option>)}</select></Field>
    <Field label="Choose file" hint={format === 'env' ? 'Values stay hidden. New variables are secret unless marked public below.' : `Required CSV columns: name,${destination}_version. Optional: ecosystem${destination === 'observed' ? ', observed_at (ISO timestamp with time zone)' : ''}. Only the selected destination is updated.`}><input type="file" accept={format === 'env' ? '.env,.txt,text/plain' : '.csv,text/csv'} disabled={busy} onChange={readFile} /></Field>
    {file && <p className="ops-muted">{file.name} · {Math.ceil(file.size / 1024)} KB</p>}
    {preview && <section className="ops-form-section"><h3>{preview.rows?.length || 0} records found</h3><p className="ops-muted">Only selected records will be merged. Existing records absent from this file are kept.</p><div className="ops-import-rows">{(preview.rows || []).map(row => <div key={row.name}><label className="ops-check"><input type="checkbox" checked={selected.includes(row.name)} disabled={busy} onChange={event => setSelected(toggle(selected, row.name, event.target.checked))} /><strong>{row.name}</strong><span className="ops-badge">{row.action}</span></label>{format === 'env' && !row.exists && <label className="ops-check"><input type="checkbox" checked={publicKeys.includes(row.name)} disabled={busy || !selected.includes(row.name)} onChange={event => setPublicKeys(toggle(publicKeys, row.name, event.target.checked))} />Public value</label>}{format === 'versions' && <small>{destination === 'expected' ? 'Expected' : 'Observed'}: {row[`${destination}_version`]}{row.ecosystem ? ` · ${row.ecosystem}` : ''}</small>}{row.exists && format === 'env' && <small>{row.secret ? 'Secret' : 'Public'} · existing classification preserved</small>}</div>)}</div></section>}
    {error && <p role="alert" className="ops-error">{error}</p>}
  </div><footer className="ops-drawer-footer"><button type="button" disabled={busy} onClick={onClose}>Cancel</button><span />{preview ? <button type="button" className="ops-primary" disabled={busy || !selected.length} onClick={commit}>{busy ? 'Importing…' : `Import ${selected.length} selected`}</button> : <button className="ops-primary" disabled={busy || !content || !envId}>{busy ? 'Reading…' : 'Preview import'}</button>}</footer></form></OperationsDrawer>;
}
