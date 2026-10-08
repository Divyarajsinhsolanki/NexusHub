import React, { useState } from 'react';
import { operationsApi } from '../../lib/operationsApi';
import OperationsDrawer, { Field, CheckList } from './OperationsDrawer';
import { Owner } from './ItemEditor';
import { entryFor, errorMessage, formatDate, csvNumbers } from './operationsModel';

export function zonedInput(value, timeZone) {
  if (!value) return '';
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value)).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  } catch { return ''; }
}

export function timeInZone(value, timeZone) {
  try { new Intl.DateTimeFormat('en', { timeZone }).format(); }
  catch { throw new Error('Choose a valid IANA time zone.'); }
  const wallTime = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(wallTime)) throw new Error('Choose a valid deployment date and time.');
  // Check both sides of a zone transition; the earliest match is the first
  // occurrence of an ambiguous local time, consistent with recurring schedules.
  const candidates = new Set();
  for (const hours of [-36, -12, 0, 12, 36]) {
    const probe = wallTime + hours * 3600000;
    const represented = Date.parse(`${zonedInput(probe, timeZone)}:00Z`);
    if (!Number.isFinite(represented)) throw new Error('Choose a valid IANA time zone.');
    const candidate = wallTime - (represented - probe);
    if (zonedInput(candidate, timeZone) === value) candidates.add(candidate);
  }
  if (!candidates.size) throw new Error('That local time does not exist in this time zone. Choose a time after the clock change.');
  return new Date(Math.min(...candidates)).toISOString();
}

export function baselineTargets(items, environmentId) {
  return items.filter(item => item.kind === 'software').flatMap(item => {
    const version = entryFor(item, environmentId)?.expected_version;
    return version ? [{ item_id: item.id, expected_version: version }] : [];
  });
}

export default function DeploymentEditor({ record, snapshot, environmentId, onClose, onSave, onAction, isSeries = false, onCancelSeries, projectId }) {
  const timezone = record?.time_zone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  const initialEnvironment = environmentId || snapshot.environments[0]?.id || '';
  const [draftRevision, setDraftRevision] = useState(snapshot.revision);
  const [form, setForm] = useState({ name: '', project_environment_id: initialEnvironment, time_zone: timezone, owner_id: '', recipient_ids: [], reminder_minutes: [1440, 60], notes: '', targets: baselineTargets(snapshot.items || [], initialEnvironment), ...record, scheduled_local: zonedInput(record?.scheduled_at, timezone) });
  const [repeat, setRepeat] = useState(isSeries);
  const [recurrence, setRecurrence] = useState({ frequency: 'weekly', weekdays: [1], day_of_month: 1, local_time: '10:00', starts_on: new Date().toISOString().slice(0, 10), ends_on: '', ...(isSeries ? Object.fromEntries(['frequency', 'weekdays', 'day_of_month', 'local_time', 'starts_on', 'ends_on'].filter(key => record[key] != null).map(key => [key, record[key]])) : {}) });
  const [reminders, setReminders] = useState((record?.reminder_minutes || [1440, 60]).join(', '));
  const [observed, setObserved] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState('');
  const [showImport, setShowImport] = useState(false);
  const writable = snapshot.can_edit !== false;
  const planned = isSeries || !record || record.status === 'planned' || record.status === 'scheduled';
  const software = (snapshot.items || []).filter(item => item.kind === 'software');
  const set = (key, value) => setForm(previous => ({ ...previous, [key]: value }));
  const targets = form.targets || [];
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const payload = { name: form.name, project_environment_id: Number(form.project_environment_id), time_zone: form.time_zone, owner_id: form.owner_id || null, recipient_ids: form.recipient_ids, reminder_minutes: csvNumbers(reminders), notes: form.notes, targets: targets.map(target => ({ item_id: target.item_id, expected_version: target.expected_version })) };
      if (repeat) Object.assign(payload, recurrence, { ends_on: recurrence.ends_on || null });
      else payload.scheduled_at = timeInZone(form.scheduled_local, form.time_zone);
      await onSave(record?.id, payload, repeat, draftRevision); onClose();
    } catch (failure) { setError(failure.response ? errorMessage(failure) : failure.message || 'Check the date and time zone.'); } finally { setBusy(false); }
  }
  async function action(type, payload) {
    setBusy(true); setError('');
    try { const result = await onAction(record.id, type, { revision: draftRevision, ...payload }); setDraftRevision(result.revision); setConfirmStatus(''); if (type === 'observations') setObserved({}); }
    catch (failure) { setError(errorMessage(failure)); } finally { setBusy(false); }
  }
  const verification = record?.verification || [];
  const verified = !!record?.verified_at;
  const canVerify = verification.length > 0 && verification.every(target => target.status === 'match');
  return <OperationsDrawer title={record ? record.name : 'Schedule deployment'} subtitle={isSeries ? 'Edit future, unstarted occurrences' : record ? `${record.status.replaceAll('_', ' ')} · ${record.verification_status || 'Not verified'}` : 'Plan a release and its required software versions'} onClose={onClose} busy={busy}><form onSubmit={save} className="ops-drawer-form"><div className="ops-drawer-body"><fieldset className="ops-form-fields" disabled={!writable || !planned || busy}>
    <Field label="Deployment name"><input autoFocus required value={form.name} onChange={event => set('name', event.target.value)} placeholder="Release v1.8.2" /></Field>
    <Field label="Target environment"><select required value={form.project_environment_id} onChange={event => { if (targets.length && !window.confirm('Changing environment will replace release targets with its current baseline.')) return; setForm(previous => ({ ...previous, project_environment_id: event.target.value, targets: baselineTargets(snapshot.items || [], event.target.value) })); }}><option value="">Select environment</option>{snapshot.environments.map(env => <option key={env.id} value={env.id}>{env.name}</option>)}</select></Field>
    <Field label="Time zone"><input required value={form.time_zone} onChange={event => set('time_zone', event.target.value)} placeholder="Asia/Kolkata" /></Field>
    {!record && <label className="ops-check"><input type="checkbox" checked={repeat} onChange={event => setRepeat(event.target.checked)} />Recurring deployment</label>}
    {repeat ? <section className="ops-form-section"><Field label="Repeat"><select value={recurrence.frequency} onChange={event => setRecurrence({ ...recurrence, frequency: event.target.value })}><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></Field>{recurrence.frequency === 'weekly' ? <CheckList label="Weekdays" options={['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((name, id) => ({ id, name }))} selected={recurrence.weekdays} onChange={weekdays => setRecurrence({ ...recurrence, weekdays })} /> : <Field label="Day of month"><input type="number" required min="1" max="31" value={recurrence.day_of_month} onChange={event => setRecurrence({ ...recurrence, day_of_month: Number(event.target.value) })} /></Field>}<Field label="Local time"><input type="time" required value={recurrence.local_time} onChange={event => setRecurrence({ ...recurrence, local_time: event.target.value })} /></Field><div className="ops-form-grid"><Field label="Starts on"><input type="date" required value={recurrence.starts_on} onChange={event => setRecurrence({ ...recurrence, starts_on: event.target.value })} /></Field><Field label="Ends on (optional)"><input type="date" min={recurrence.starts_on} value={recurrence.ends_on} onChange={event => setRecurrence({ ...recurrence, ends_on: event.target.value })} /></Field></div></section> : <Field label="Scheduled date and time" hint={`Time in ${form.time_zone}`}><input type="datetime-local" required value={form.scheduled_local} onChange={event => set('scheduled_local', event.target.value)} /></Field>}
    <Owner snapshot={snapshot} value={form.owner_id} onChange={id => set('owner_id', id)} /><CheckList label="Remind project members" unavailableLabel="Unavailable member" options={snapshot.members || []} selected={form.recipient_ids} onChange={ids => set('recipient_ids', ids)} />
    <Field label="Remind minutes before" hint="1440 = one day, 60 = one hour. Leave empty for no reminders."><input value={reminders} onChange={event => setReminders(event.target.value)} /></Field>
    <section className="ops-form-section"><h3>Release version targets</h3><p className="ops-muted">Expected versions are kept with this release. Recording a deployment does not change installed versions.</p>{software.length ? software.map(item => { const target = targets.find(value => String(value.item_id) === String(item.id)); return <div className="ops-target-row" key={item.id}><label className="ops-check"><input type="checkbox" checked={!!target} onChange={event => set('targets', event.target.checked ? [...targets, { item_id: item.id, expected_version: entryFor(item, form.project_environment_id)?.expected_version || '' }] : targets.filter(value => value !== target))} />{item.name}</label>{target && <input aria-label={`${item.name} release target`} required value={target.expected_version} onChange={event => set('targets', targets.map(value => value === target ? { ...value, expected_version: event.target.value } : value))} placeholder="Expected version" />}</div>; }) : <p className="ops-muted">Add software records to set release targets.</p>}</section>
    <Field label="Release notes"><textarea rows={3} value={form.notes || ''} onChange={event => set('notes', event.target.value)} /></Field>
    </fieldset>
    {record && !isSeries && <section className="ops-form-section"><h3>Deployment progress</h3><p className="ops-muted">{record.deployed_at ? `Deployed ${formatDate(record.deployed_at)}` : 'Mark this release deployed after it has actually been deployed.'}</p>{writable && <div className="ops-actions">{(planned ? [['in_progress', 'Start deployment'], ['cancelled', 'Cancel deployment']] : record.status === 'in_progress' ? [['deployed', 'Mark deployed'], ['failed', 'Mark failed'], ['cancelled', 'Cancel deployment']] : []).map(([status, label]) => <button key={status} type="button" disabled={busy} onClick={() => setConfirmStatus(status)}>{label}</button>)}</div>}{confirmStatus && <div className="ops-danger-confirm"><p>Change deployment status to {confirmStatus.replaceAll('_', ' ')}?</p><button type="button" disabled={busy} onClick={() => action('transition', { status: confirmStatus })}>Confirm status</button><button type="button" onClick={() => setConfirmStatus('')}>Keep current status</button></div>}</section>}
    {!isSeries && record?.status === 'deployed' && <section className="ops-form-section"><h3>Post-deployment verification</h3><p className="ops-muted">Record versions checked after this deployment, then verify them against the release targets.</p>{(record.verification || record.targets || []).map(target => <div key={target.item_id} className="ops-verification-row"><div><strong>{target.name || software.find(item => item.id === target.item_id)?.name}</strong><p>Expected {target.expected_version} · Recorded {target.observed_version || 'Unknown'}</p>{target.status && <span className={`ops-badge ${target.status === 'mismatch' ? 'ops-badge-warning' : ''}`}>{target.status}</span>}</div>{writable && !verified && <input aria-label={`${target.name || software.find(item => item.id === target.item_id)?.name} installed version`} placeholder="New observation" value={observed[target.item_id] || ''} onChange={event => setObserved({ ...observed, [target.item_id]: event.target.value })} />}</div>)}{verified && <p className="ops-notice">Release verified {formatDate(record.verified_at, record.time_zone)}. Its version comparison is preserved.</p>}{writable && !verified && <div className="ops-actions"><button type="button" disabled={busy || !Object.values(observed).some(Boolean)} onClick={() => action('observations', { observations: Object.entries(observed).filter(([, value]) => value).map(([id, value]) => ({ item_id: Number(id), observed_version: value, source: 'manual' })) })}>Record checked versions</button><button type="button" disabled={busy} onClick={() => setShowImport(previous => !previous)}>Import checked versions CSV</button><button type="button" disabled={busy || !canVerify || Object.values(observed).some(Boolean)} className="ops-primary" onClick={() => action('verify', {})}>Verify release</button></div>}{showImport && !verified && <ObservationImport projectId={projectId} deployment={record} onCommit={async payload => { const result = await onAction(record.id, 'observations', payload); setDraftRevision(result.revision); return result; }} onClose={() => setShowImport(false)} />}{!verified && !canVerify && <p className="ops-muted">Every release target needs a fresh matching observation before verification.</p>}</section>}
    {isSeries && writable && <section className="ops-form-section"><h3>Recurring schedule</h3><p className="ops-muted">Changes apply to future planned occurrences. Started and historical deployments keep their original details.</p><button type="button" className="ops-danger" disabled={busy} onClick={() => setConfirmStatus('cancel_series')}>Cancel recurring schedule</button>{confirmStatus === 'cancel_series' && <div className="ops-danger-confirm"><p>Cancel this schedule and its future planned occurrences?</p><button type="button" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await onCancelSeries(record.id, draftRevision); onClose(); } catch (failure) { setError(errorMessage(failure)); } finally { setBusy(false); } }}>Confirm cancellation</button><button type="button" onClick={() => setConfirmStatus('')}>Keep schedule</button></div>}</section>}
    {error && <p role="alert" className="ops-error">{error}</p>}
    </div><footer className="ops-drawer-footer"><button type="button" disabled={busy} onClick={onClose}>Close</button><span />{writable && planned && <button className="ops-primary" disabled={busy}>{busy ? 'Saving…' : repeat ? (isSeries ? 'Save future dates' : 'Create deployment schedule') : 'Save deployment'}</button>}</footer></form></OperationsDrawer>;
}


function ObservationImport({ projectId, deployment, onCommit, onClose }) {
  const [content, setContent] = useState('');
  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const template = 'name,observed_version,source\n' + deployment.targets.map(target => [target.name, '', 'manual'].map(value => '"' + String(value).replaceAll('"', '""') + '"').join(',')).join('\n');
  async function readFile(event) {
    setContent(''); setPreview(null); setError('');
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 262144) { setError('Choose a CSV smaller than 256 KB.'); return; }
    try { setContent(await file.text()); } catch { setError('Unable to read this file.'); }
  }
  async function review() {
    setBusy(true); setError('');
    try {
      const { data } = await operationsApi.observations(projectId, deployment.id, { content, preview: true });
      setPreview(data); setSelected(data.rows.map(row => row.item_id));
    } catch (failure) { setError(errorMessage(failure)); } finally { setBusy(false); }
  }
  async function commit() {
    setBusy(true); setError('');
    try { await onCommit({ content, revision: preview.revision, selected_item_ids: selected }); onClose(); }
    catch (failure) { setError(errorMessage(failure)); } finally { setBusy(false); }
  }
  return <section className="ops-import-panel"><h3>Import post-deployment observations</h3><p className="ops-muted">Enter versions checked after this release. Imported rows are recorded as observations when you confirm.</p><a href={`data:text/csv;charset=utf-8,${encodeURIComponent(template)}`} download="deployment-observations.csv">Download CSV template</a><Field label="Checked versions CSV"><input type="file" accept=".csv,text/csv" disabled={busy} onChange={readFile} /></Field>{preview && <div className="ops-import-rows">{preview.rows.map(row => <div key={row.item_id}><label className="ops-check"><input type="checkbox" checked={selected.includes(row.item_id)} disabled={busy} onChange={event => setSelected(event.target.checked ? [...selected, row.item_id] : selected.filter(id => id !== row.item_id))} />{row.name} · {row.observed_version}</label></div>)}</div>}{error && <p role="alert" className="ops-error">{error}</p>}<div className="ops-actions"><button type="button" disabled={busy} onClick={onClose}>Cancel import</button>{preview ? <button type="button" disabled={busy || !selected.length} onClick={commit}>Record {selected.length} selected observations</button> : <button type="button" disabled={busy || !content} onClick={review}>Preview checked versions</button>}</div></section>;
}
