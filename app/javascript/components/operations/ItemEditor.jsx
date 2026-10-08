import React, { useState } from 'react';
import OperationsDrawer, { Field, CheckList } from './OperationsDrawer';
import { csvNumbers, entryFor, errorMessage, formatDate } from './operationsModel';

export default function ItemEditor({ item, kind, environmentId, snapshot, onClose, onSave, onDelete, onVerifyEntry }) {
  const environments = snapshot.environments || [];
  const [draftRevision, setDraftRevision] = useState(snapshot.revision);
  const initialEnvironment = String(environmentId || environments[0]?.id || '');
  const [form, setForm] = useState({ name: '', description: '', category: '', secret: kind === 'configuration', comparison: 'environment_specific', ...item, details: { ...(kind === 'license' ? { time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', reminder_days: [30, 7, 1] } : kind === 'configuration' ? { scope: 'env' } : {}), ...(item?.details || {}) } });
  const [envId, setEnvId] = useState(initialEnvironment);
  const blankEntry = id => { const entry = entryFor(item || {}, id) || {}; return { required: false, expected_version: '', observed_version: '', source: 'manual', details: {}, ...entry, value: item?.secret ? '' : (entry.value || ''), clear_value: false }; };
  const [entry, setEntry] = useState(() => blankEntry(initialEnvironment));
  const [entryDirty, setEntryDirty] = useState(false);
  const [secretValue, setSecretValue] = useState('');
  const [clearLicense, setClearLicense] = useState(false);
  const [reason, setReason] = useState('');
  const [reminders, setReminders] = useState((item?.details?.reminder_days || [30, 7, 1]).join(', '));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('details');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const writable = snapshot.can_edit !== false;
  const canEncrypt = snapshot.encryption_available !== false;
  const details = form.details || {};
  const detail = (key, value) => setForm(previous => ({ ...previous, details: { ...previous.details, [key]: value } }));
  const changeEntry = patch => { setEntry(previous => ({ ...previous, ...patch })); setEntryDirty(true); };
  const history = (snapshot.history || []).filter(event => String(event.metadata?.item_id) === String(item?.id) || (event.item_name === item?.name && event.item_kind === kind));
  const title = ({ configuration: 'variable', software: 'software', service: 'service', license: 'license' })[kind];

  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    const payload = { kind, name: form.name, description: form.description, category: form.category, secret: form.secret, comparison: form.comparison, details: kind === 'license' ? { ...details, reminder_days: csvNumbers(reminders) } : details };
    if (kind === 'license') {
      if (secretValue) payload.license_key = secretValue;
      if (clearLicense) payload.clear_license_key = true;
    }
    let entryPayload;
    if (kind !== 'license' && envId && (entryDirty || !item)) {
      entryPayload = { required: !!entry.required, details: entry.details || {} };
      if (kind === 'configuration') {
        if (!form.secret || entry.value) entryPayload.value = entry.value;
        if (entry.clear_value) entryPayload.clear_value = true;
      }
      if (kind === 'service') { entryPayload.details = { ...entry.details, endpoints: (entry.details.endpoints || (entry.details.endpoint ? [{ label: 'API', url: entry.details.endpoint }] : [])).filter(endpoint => endpoint.label || endpoint.url) }; delete entryPayload.details.endpoint; }
      if (kind === 'software') Object.assign(entryPayload, { expected_version: entry.expected_version, observed_version: entry.observed_version, source: entry.source || 'manual' });
    }
    try { await onSave(item?.id, payload, entryPayload ? { environmentId: envId, payload: entryPayload } : null, reason, draftRevision); onClose(); }
    catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(false); }
  }

  async function remove() {
    setBusy(true); setError('');
    try { await onDelete(item.id, reason, draftRevision); onClose(); } catch (failure) { setError(errorMessage(failure)); } finally { setBusy(false); }
  }

  return <OperationsDrawer title={item ? item.name : `Add ${title}`} subtitle={item ? `Edit ${title} · Changes are recorded` : 'Add a record to your project'} onClose={onClose} busy={busy}>
    {item && <nav className="ops-drawer-tabs" aria-label="Record details"><button type="button" aria-pressed={tab === 'details'} onClick={() => setTab('details')}>Details</button><button type="button" aria-pressed={tab === 'history'} onClick={() => setTab('history')}>History ({history.length})</button></nav>}
    {tab === 'history' ? <div className="ops-drawer-body"><History events={history} /></div> : <form onSubmit={submit} className="ops-drawer-form"><div className="ops-drawer-body"><fieldset disabled={!writable || busy} className="ops-form-fields">
      <Field label={kind === 'configuration' ? 'Variable name' : 'Name'}><input autoFocus required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder={kind === 'configuration' ? 'DATABASE_URL' : kind === 'software' ? 'Redis' : 'Name'} /></Field>
      <Field label="Description"><textarea rows={2} value={form.description || ''} onChange={event => setForm({ ...form, description: event.target.value })} /></Field>
      <Field label={kind === 'software' ? 'Ecosystem / category' : 'Category'}><input value={form.category || ''} onChange={event => setForm({ ...form, category: event.target.value })} placeholder={kind === 'software' ? 'Ruby gem, npm, runtime, infrastructure…' : 'Optional grouping'} /></Field>
      {kind === 'configuration' && <><Field label="Setting type"><select value={details.scope || 'env'} onChange={event => detail('scope', event.target.value)}><option value="env">ENV variable</option><option value="application">Application setting</option><option value="infrastructure">Infrastructure setting</option></select></Field><label className="ops-check"><input type="checkbox" checked={!!form.secret} disabled={!!item?.secret} onChange={event => setForm({ ...form, secret: event.target.checked })} />Secret value</label><Field label="Comparison policy"><select value={form.comparison} onChange={event => setForm({ ...form, comparison: event.target.value })}><option value="environment_specific">May differ by environment</option><option value="must_match">Must match across environments</option></select></Field></>}
      {['software', 'service'].includes(kind) && <><Field label="Purpose"><input value={details.purpose || ''} onChange={event => detail('purpose', event.target.value)} /></Field><Field label="Documentation URL"><input type="url" value={details.documentation_url || ''} onChange={event => detail('documentation_url', event.target.value)} /></Field></>}
      {kind === 'software' && <><Field label="Package ecosystem"><input value={details.ecosystem || ''} onChange={event => detail('ecosystem', event.target.value)} placeholder="Ruby, npm, runtime…" /></Field><Field label="Associated service"><select value={details.service_id || ''} onChange={event => detail('service_id', event.target.value ? Number(event.target.value) : null)}><option value="">None</option>{(snapshot.items || []).filter(record => record.kind === 'service').map(record => <option key={record.id} value={record.id}>{record.name}</option>)}</select></Field></>}
      {kind === 'service' && <><Owner snapshot={snapshot} value={details.owner_id} onChange={id => detail('owner_id', id)} /><Field label="Endpoint comparison"><select value={form.comparison} onChange={event => setForm({ ...form, comparison: event.target.value })}><option value="environment_specific">May differ by environment</option><option value="must_match">Must match across environments</option></select></Field></>}
      {kind !== 'license' && <section className="ops-form-section"><h3>Environment details</h3><Field label="Environment"><select required={environments.length > 0} value={envId} onChange={event => { if (entryDirty && !window.confirm('Discard unsaved environment changes?')) return; setEnvId(event.target.value); setEntry(blankEntry(event.target.value)); setEntryDirty(false); }}><option value="">Select environment</option>{environments.map(env => <option key={env.id} value={env.id}>{env.name}</option>)}</select></Field>
        {!environments.length && <p className="ops-muted">Create an environment before recording environment details.</p>}
        {kind === 'configuration' && <><label className="ops-check"><input type="checkbox" checked={!!entry.required} onChange={event => changeEntry({ required: event.target.checked })} />Required in this environment</label><Field label={form.secret ? (entry.configured ? 'Replace secret' : 'Secret value') : 'Value'} hint={form.secret ? 'Stored values are never revealed. Leave blank to keep the current value.' : undefined}><input type={form.secret ? 'password' : 'text'} autoComplete="new-password" value={entry.value} disabled={!canEncrypt} onChange={event => changeEntry({ value: event.target.value, clear_value: false })} /></Field>{form.secret && !canEncrypt && <p className="ops-warning">Secret storage is unavailable. An administrator must configure encryption.</p>}{entry.configured && <label className="ops-check"><input type="checkbox" checked={entry.clear_value} onChange={event => changeEntry({ clear_value: event.target.checked, value: '' })} />Remove stored value</label>}</>}
        {kind === 'software' && <><Field label="Expected version"><input value={entry.expected_version || ''} onChange={event => changeEntry({ expected_version: event.target.value })} placeholder="7.2.1" /></Field><Field label="Recorded installed version" hint="Record the version verified in this environment."><input value={entry.observed_version || ''} onChange={event => changeEntry({ observed_version: event.target.value })} placeholder="Unknown until recorded" /></Field><Field label="Observation source"><input value={entry.source || ''} onChange={event => changeEntry({ source: event.target.value })} placeholder="manual" /></Field>{entry.observed_at && <p className="ops-muted">Recorded {formatDate(entry.observed_at)} · {entry.source || 'manual'}</p>}{entry.verified_at ? <p className="ops-muted">Verified by {entry.verified_by?.name || 'Project member'} · {formatDate(entry.verified_at)}</p> : item && !entryDirty && entry.observed_version && entry.observed_version === entry.expected_version && <button type="button" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { const result = await onVerifyEntry(item.id, envId, draftRevision); setDraftRevision(result.revision); setEntry(previous => ({ ...previous, verified_at: new Date().toISOString() })); } catch (failure) { setError(errorMessage(failure)); } finally { setBusy(false); } }}>Confirm installed version</button>}</>}
        {kind === 'service' && <><h3>Service endpoints</h3><p className="ops-muted">Use separate labelled URLs for API, authentication, or webhooks. Keep tokens in linked credentials.</p>{(entry.details?.endpoints || (entry.details?.endpoint ? [{ label: 'API', url: entry.details.endpoint }] : [])).map((endpoint, index, endpoints) => <div key={index} className="ops-endpoint-row"><Field label="Label"><input required value={endpoint.label} placeholder="API" onChange={event => changeEntry({ details: { ...entry.details, endpoints: endpoints.map((current, position) => position === index ? { ...current, label: event.target.value } : current) } })} /></Field><Field label="Endpoint URL"><input type="url" required value={endpoint.url} placeholder="https://api.example.com" onChange={event => changeEntry({ details: { ...entry.details, endpoints: endpoints.map((current, position) => position === index ? { ...current, url: event.target.value } : current) } })} /></Field><button type="button" aria-label={`Remove ${endpoint.label || 'endpoint'}`} onClick={() => changeEntry({ details: { ...entry.details, endpoints: endpoints.filter((_, position) => position !== index) } })}>Remove</button></div>)}<button type="button" onClick={() => changeEntry({ details: { ...entry.details, endpoints: [...(entry.details?.endpoints || (entry.details?.endpoint ? [{ label: 'API', url: entry.details.endpoint }] : [])), { label: '', url: '' }] } })}>Add endpoint</button><CheckList label="Linked credentials" options={(snapshot.items || []).filter(record => record.kind === 'configuration' && record.secret)} selected={entry.details?.credential_item_ids || []} onChange={ids => changeEntry({ details: { ...entry.details, credential_item_ids: ids } })} /><p className="ops-muted">Create credentials as secret configuration variables, then link them here. Each credential uses this environment's value.</p></>}

      </section>}
      {kind === 'license' && <><Field label="Vendor / product"><input value={details.vendor || ''} onChange={event => detail('vendor', event.target.value)} /></Field><Field label="License reference"><input value={details.reference || ''} onChange={event => detail('reference', event.target.value)} /></Field><Owner snapshot={snapshot} value={details.owner_id} onChange={id => detail('owner_id', id)} /><Field label="Expiry date" hint="Leave empty for a perpetual license."><input type="date" value={details.expiry_date || ''} onChange={event => detail('expiry_date', event.target.value)} /></Field><Field label="Time zone"><input required value={details.time_zone || ''} onChange={event => detail('time_zone', event.target.value)} /></Field><CheckList label="Covered environments" options={environments} selected={details.environment_ids || []} onChange={ids => detail('environment_ids', ids)} /><CheckList label="Linked services" options={(snapshot.items || []).filter(record => record.kind === 'service')} selected={details.service_ids || []} onChange={ids => detail('service_ids', ids)} /><CheckList label="Remind project members" unavailableLabel="Unavailable member" options={snapshot.members || []} selected={details.recipient_ids || []} onChange={ids => detail('recipient_ids', ids)} /><Field label="Remind days before expiry" hint="Comma-separated days, for example 30, 7, 1."><input value={reminders} onChange={event => setReminders(event.target.value)} /></Field><Field label="Renewal URL"><input type="url" value={details.renewal_url || ''} onChange={event => detail('renewal_url', event.target.value)} /></Field><Field label="License notes"><textarea rows={3} value={details.notes || ''} onChange={event => detail('notes', event.target.value)} /></Field><Field label={item ? 'Replace license key' : 'License key'} hint="Optional. Stored keys are never revealed."><input type="password" autoComplete="new-password" disabled={!canEncrypt} value={secretValue} onChange={event => { setSecretValue(event.target.value); setClearLicense(false); }} /></Field>{item?.license_key_configured && <label className="ops-check"><input type="checkbox" checked={clearLicense} onChange={event => { setClearLicense(event.target.checked); setSecretValue(''); }} />Remove stored license key</label>}</>}
      <Field label="Reason for change"><input value={reason} onChange={event => setReason(event.target.value)} placeholder="Optional context for your team" /></Field>
    </fieldset>{error && <p role="alert" className="ops-error">{error}</p>}{confirmDelete && <div className="ops-danger-confirm"><p>Delete {item.name} and its environment entries?</p><button type="button" disabled={busy} onClick={remove}>Confirm delete</button><button type="button" onClick={() => setConfirmDelete(false)}>Keep record</button></div>}</div><footer className="ops-drawer-footer">{item && writable && <button type="button" className="ops-danger" disabled={busy} onClick={() => setConfirmDelete(true)}>Delete</button>}<span /><button type="button" disabled={busy} onClick={onClose}>Cancel</button>{writable && <button className="ops-primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>}</footer></form>}
  </OperationsDrawer>;
}

export function Owner({ snapshot, value, onChange }) {
  const members = snapshot.members || [];
  return <Field label="Owner"><select value={value || ''} onChange={event => onChange(event.target.value ? Number(event.target.value) : null)}><option value="">Unassigned</option>{value && !members.some(member => String(member.id) === String(value)) && <option value={value}>Unavailable member #{value}</option>}{members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></Field>;
}

export function History({ events = [] }) {
  return events.length ? <ol className="ops-history">{events.map(event => <li key={event.id}><strong>{event.item_name || 'Environment'} · {String(event.action || 'updated').replaceAll('_', ' ')}</strong><p>{event.environment_name ? `${event.environment_name} · ` : ''}{event.actor?.name || 'Project member'} · {formatDate(event.created_at)}</p>{event.reason && <p>{event.reason}</p>}{event.metadata?.fields?.length > 0 && <small>Changed: {event.metadata.fields.join(', ')}</small>}</li>)}</ol> : <p className="ops-empty">No changes recorded yet.</p>;
}
