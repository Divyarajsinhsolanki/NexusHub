import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FiPlus, FiRefreshCw, FiUpload, FiClock, FiSettings, FiLayers, FiAlertTriangle, FiCheckCircle, FiCalendar } from 'react-icons/fi';
import { operationsApi } from '../lib/operationsApi';
import ItemEditor, { History } from '../components/operations/ItemEditor';
import DeploymentEditor from '../components/operations/DeploymentEditor';
import ImportDrawer from '../components/operations/ImportDrawer';
import EnvironmentManager from '../components/operations/EnvironmentManager';
import OperationsDrawer from '../components/operations/OperationsDrawer';
import { SECTIONS, entryFor, entryStatus, comparisonLabel, errorMessage, formatDate } from '../components/operations/operationsModel';
import './ProjectOperations.css';

const KINDS = { configuration: 'configuration', software: 'software', services: 'service', licenses: 'license' };
const LABELS = { configuration: 'variable or setting', software: 'software', service: 'service', license: 'license' };
const attention = status => ['missing', 'mismatch', 'expired', 'expiring', 'unavailable'].includes(status);
const humanStatus = status => ({ missing: 'Missing required', mismatch: 'Needs attention', expected_differences: 'Environment-specific', no_expiry: 'No expiry', unconfigured: 'Not configured', unverified: 'Not verified', expiring: 'Expiring soon', match: 'Recorded', in_progress: 'In progress' })[status] || status;

export default function ProjectOperations({ projectId }) {
  const [params, setParams] = useSearchParams();
  const section = SECTIONS.some(([id]) => id === params.get('section')) ? params.get('section') : 'configuration';
  const recordId = params.get('record');
  const seriesId = params.get('series');
  const environmentId = params.get('environment') || '';
  const filter = params.get('filter') || 'all';
  const query = params.get('q') || '';
  const compare = params.get('compare') === 'true';
  const [snapshot, setSnapshot] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [drawer, setDrawer] = useState(null);
  const [extraHistory, setExtraHistory] = useState([]);
  const [historyMore, setHistoryMore] = useState(true);
  const [historyBusy, setHistoryBusy] = useState(false);
  const revision = useRef(null);
  const requestId = useRef(0);
  const mounted = useRef(true);
  const load = useCallback(async ({ quiet = false } = {}) => {
    const id = ++requestId.current;
    if (!quiet) setBusy(true);
    try {
      const { data } = await operationsApi.snapshot(projectId);
      if (!mounted.current || id !== requestId.current) return;
      revision.current = data.revision;
      setSnapshot(data); setError('');
      return data;
    } catch (failure) { if (mounted.current && id === requestId.current) setError(failure?.response?.status === 403 ? 'You need active project membership to open environment operations.' : 'Unable to load environment operations. Refresh to try again.'); }
    finally { if (mounted.current && id === requestId.current) setBusy(false); }
  }, [projectId]);
  useEffect(() => { mounted.current = true; setSnapshot(null); setExtraHistory([]); setHistoryMore(true); load(); const refresh = () => load({ quiet: true }); window.addEventListener('focus', refresh); return () => { mounted.current = false; requestId.current += 1; window.removeEventListener('focus', refresh); }; }, [load]);
  const navigate = patch => setParams(previous => {
    const next = new URLSearchParams(previous); next.set('tab', 'environments');
    Object.entries(patch).forEach(([key, value]) => value === null || value === '' || value === false ? next.delete(key) : next.set(key, String(value)));
    return next;
  });
  const changeSection = next => { setDrawer(null); navigate({ section: next, record: null, series: null, filter: null, q: null }); };
  const close = () => { setDrawer(null); navigate({ record: null, series: null }); };
  const openItem = (item, envId) => { setDrawer(null); navigate({ record: item.id, series: null, ...(envId ? { environment: envId } : {}) }); };
  const mutate = async (call, message = 'Changes saved.', expectedRevision = revision.current) => {
    const { data } = await call(expectedRevision);
    if (data?.revision !== undefined) revision.current = data.revision;
    setNotice(message);
    const refreshed = await load({ quiet: true });
    // The shared environment endpoints retain their existing raw/empty response
    // shape. Editors still need a revision for their next independent change.
    return { ...data, revision: data?.revision ?? refreshed?.revision ?? revision.current };
  };
  const saveItem = (id, item, entry, reason, expectedRevision) => {
    const payload = { item: { ...item, ...(entry ? { entries: [{ environment_id: Number(entry.environmentId), ...entry.payload }] } : {}) }, reason };
    return mutate(current => id ? operationsApi.updateItem(projectId, id, { ...payload, revision: current }) : operationsApi.createItem(projectId, { ...payload, revision: current }), 'Changes saved.', expectedRevision);
  };
  const saveDeployment = (id, payload, isSeries, expectedRevision) => mutate(current => isSeries ? operationsApi.saveSeries(projectId, id, { series: payload, revision: current }) : operationsApi.saveDeployment(projectId, id, { deployment: payload, revision: current }), 'Deployment saved.', expectedRevision);
  const deploymentAction = (id, type, payload) => mutate(current => operationsApi[type](projectId, id, { revision: current, ...payload }), type === 'verify' ? 'Release verified. The environment baseline is updated.' : 'Deployment updated.');
  const history = [...(snapshot?.history || []), ...extraHistory].filter((event, index, events) => events.findIndex(other => other.id === event.id) === index);
  const loadHistory = async () => {
    setHistoryBusy(true);
    try { const { data } = await operationsApi.history(projectId, history.at(-1)?.id); setExtraHistory(previous => [...previous, ...data.history]); setHistoryMore(data.history.length === 50); }
    catch { setError('Unable to load more history. Try again.'); }
    finally { setHistoryBusy(false); }
  };
  if (!snapshot) return <section className="ops-workspace ops-panel"><div className="ops-empty" role={error ? 'alert' : 'status'}>{error || 'Loading project environments…'}</div>{error && <button type="button" onClick={() => load()}>Retry</button>}</section>;

  const { environments = [], items = [], deployments = [], series = [], summary = {} } = snapshot;
  const writable = !!snapshot.can_edit;
  const leftId = params.get('left') || String(environments[0]?.id || '');
  const rightId = params.get('right') || String(environments.find(environment => String(environment.id) !== leftId)?.id || '');
  const shownEnvironments = compare ? [environments.find(environment => String(environment.id) === leftId), environments.find(environment => String(environment.id) === rightId)].filter(Boolean) : environments.filter(environment => !environmentId || String(environment.id) === environmentId);
  const matchesQuery = item => `${item.name} ${item.description || ''} ${item.category || ''}`.toLowerCase().includes(query.toLowerCase());
  const shownItems = items.filter(item => item.kind === KINDS[section] && matchesQuery(item)).filter(item => item.kind !== 'license' || !environmentId || !item.details?.environment_ids?.length || item.details.environment_ids.map(String).includes(environmentId)).filter(item => {
    if (filter === 'missing') return item.entries.some(entry => entry.required && !entry.configured && (!environmentId || String(entry.environment_id) === environmentId));
    if (filter === 'warnings') return attention(item.status);
    if (filter === 'differences') return compare ? comparisonLabel(item, shownEnvironments) === 'Different' : item.comparisons?.some(pair => pair.equal === false);
    if (filter === 'secrets') return item.secret;
    if (filter === 'expiring') return ['expired', 'expiring'].includes(item.status);
    return true;
  });
  const shownDeployments = deployments.filter(matchesQuery).filter(record => !environmentId || String(record.project_environment_id) === environmentId).filter(record => filter !== 'upcoming' || ['planned', 'in_progress'].includes(record.status));
  const shownSeries = series.filter(record => record.active && matchesQuery(record) && (!environmentId || String(record.project_environment_id) === environmentId));
  const upcoming = deployments.filter(record => ['planned', 'in_progress'].includes(record.status)).length;
  const selectedItem = KINDS[section] && items.find(item => String(item.id) === recordId && item.kind === KINDS[section]);
  const selectedDeployment = section === 'deployments' && deployments.find(record => String(record.id) === recordId);
  const selectedSeries = section === 'deployments' && series.find(record => String(record.id) === seriesId);
  const showEditor = drawer?.type === 'item' || selectedItem;
  const showDeployment = drawer?.type === 'deployment' || selectedDeployment || selectedSeries;
  return <section className="ops-workspace" aria-label="Project Environments and Operations">
    <header className="ops-panel ops-heading"><div><span className="ops-eyebrow">PROJECT OPERATIONS</span><h2>Every environment. One place.</h2><p>Keep configuration, installed versions, services, and release dates in sync.</p></div><div className="ops-actions"><button type="button" aria-label="Refresh operations" disabled={busy} onClick={() => load()}><FiRefreshCw />{busy ? 'Refreshing…' : 'Refresh'}</button><button type="button" onClick={() => setDrawer({ type: 'history' })}><FiClock />History</button><button type="button" onClick={() => setDrawer({ type: 'environments' })}><FiSettings />Environments</button></div></header>
    {error && <div className="ops-error" role="alert">{error}</div>}{notice && <div className="ops-notice" role="status"><FiCheckCircle />{notice}<button type="button" aria-label="Dismiss notification" onClick={() => setNotice('')}>×</button></div>}
    <div className="ops-summary"><Summary icon={FiAlertTriangle} value={summary.missing_required || 0} label="Missing configuration" onClick={() => { setDrawer(null); navigate({ section: 'configuration', filter: 'missing', q: null, record: null, series: null }); }} /><Summary icon={FiLayers} value={items.filter(item => item.kind === 'software' && item.status === 'mismatch').length} label="Version mismatches" onClick={() => { setDrawer(null); navigate({ section: 'software', filter: 'warnings', q: null, record: null, series: null }); }} /><Summary icon={FiClock} value={summary.expiring_licenses || 0} label="Expiring licenses" onClick={() => { setDrawer(null); navigate({ section: 'licenses', filter: 'expiring', q: null, record: null, series: null }); }} /><Summary icon={FiCalendar} value={upcoming} label="Upcoming deployments" onClick={() => { setDrawer(null); navigate({ section: 'deployments', filter: 'upcoming', q: null, record: null, series: null }); }} /></div>
    <div className="ops-panel"><nav className="ops-tabs" aria-label="Operations sections">{SECTIONS.map(([id, name]) => <button key={id} type="button" aria-current={section === id ? 'page' : undefined} className={section === id ? 'active' : ''} onClick={() => changeSection(id)}>{name}</button>)}</nav>
      <div className="ops-toolbar"><label><span className="sr-only">Environment scope</span><select aria-label="Environment scope" value={environmentId} onChange={event => navigate({ environment: event.target.value, compare: false, record: null, series: null })}><option value="">All environments</option>{environments.map(env => <option key={env.id} value={env.id}>{env.name}</option>)}</select></label><label className="ops-search"><span className="sr-only">Search operations</span><input type="search" placeholder="Search by name, description, or category" value={query} onChange={event => navigate({ q: event.target.value, record: null })} /></label><label><span className="sr-only">Filter records</span><select value={filter} onChange={event => navigate({ filter: event.target.value })}><option value="all">All records</option>{section === 'licenses' ? <option value="expiring">Expiring / expired</option> : section === 'deployments' ? <option value="upcoming">Upcoming</option> : <><option value="missing">Missing required</option><option value="warnings">Needs attention</option><option value="differences">Environment differences</option>{section === 'configuration' && <option value="secrets">Secrets</option>}</>}</select></label>{writable && <div className="ops-actions">{['configuration', 'software'].includes(section) && <button type="button" onClick={() => setDrawer({ type: 'import' })}><FiUpload />Import</button>}<button type="button" className="ops-primary" onClick={() => { navigate({ record: null, series: null }); setDrawer({ type: section === 'deployments' ? 'deployment' : 'item', kind: KINDS[section] }); }}><FiPlus />{section === 'deployments' ? 'Schedule deployment' : `Add ${LABELS[KINDS[section]]}`}</button></div>}</div>
      {!environments.length && <div className="ops-onboarding"><FiLayers /><h3>Start with your environments</h3><p>Add Development, QA, Staging, or Production to organize this project.</p>{writable && <button type="button" className="ops-primary" onClick={() => setDrawer({ type: 'environments' })}>Add environments</button>}</div>}
      {['configuration', 'software', 'services'].includes(section) && <><div className="ops-compare-toolbar"><label className="ops-check"><input type="checkbox" checked={compare} disabled={environments.length < 2} onChange={event => navigate({ compare: event.target.checked })} />Compare two environments</label>{compare && <><select aria-label="First comparison environment" value={leftId} onChange={event => navigate({ left: event.target.value, right: event.target.value === rightId ? leftId : rightId })}>{environments.map(env => <option key={env.id} value={env.id}>{env.name}</option>)}</select><span>with</span><select aria-label="Second comparison environment" value={rightId} onChange={event => navigate({ right: event.target.value })}>{environments.filter(env => String(env.id) !== leftId).map(env => <option key={env.id} value={env.id}>{env.name}</option>)}</select></>}{section === 'software' && <span className="ops-muted">Expected → recorded installed version</span>}</div><div className="ops-table-scroll"><table className="ops-matrix"><thead><tr><th scope="col">{section === 'software' ? 'Software' : section === 'services' ? 'Service' : 'Variable / setting'}</th>{shownEnvironments.map(env => { const requirements = items.filter(item => item.kind === 'configuration').map(item => entryFor(item, env.id)).filter(entry => entry?.required); return <th scope="col" key={env.id}>{env.name}<small>{requirements.length ? `${requirements.filter(entry => entry.configured).length}/${requirements.length} required configured` : 'No requirements defined'}</small></th>; })}{compare && <th scope="col">Comparison</th>}</tr></thead><tbody>{shownItems.map(item => <tr key={item.id}><th scope="row"><button className="ops-record-button" type="button" onClick={() => openItem(item)}><strong>{item.name}</strong><small>{item.description || item.category || (item.secret ? 'Secret' : item.kind)}</small></button>{attention(item.status) && <span className="ops-badge ops-badge-warning">{humanStatus(item.status)}</span>}</th>{shownEnvironments.map(env => <td key={env.id}><button type="button" className="ops-cell" aria-label={`${item.name} in ${env.name}`} onClick={() => openItem(item, env.id)}><MatrixCell item={item} entry={entryFor(item, env.id)} /></button></td>)}{compare && <td><span className={`ops-badge ${item.comparison === 'must_match' && comparisonLabel(item, shownEnvironments) === 'Different' ? 'ops-badge-warning' : ''}`}>{comparisonLabel(item, shownEnvironments)}</span>{item.comparison === 'must_match' && <small>Must match</small>}</td>}</tr>)}</tbody></table></div>{!shownItems.length && <Empty section={section} filtered={!!query || filter !== 'all'} />}</>}
      {section === 'licenses' && <div className="ops-record-grid">{shownItems.map(item => <button key={item.id} type="button" className="ops-record-card" onClick={() => openItem(item)}><span className={`ops-badge ${attention(item.status) ? 'ops-badge-warning' : ''}`}>{humanStatus(item.status)}</span><h3>{item.name}</h3><p>{item.details.vendor || item.description || 'License'}</p><dl><dt>Expires</dt><dd>{item.details.expiry_date || 'No expiry'}</dd><dt>Owner</dt><dd>{(snapshot.members || []).find(member => String(member.id) === String(item.details.owner_id))?.name || 'Unassigned'}</dd><dt>Reminders</dt><dd>{(item.details.reminder_days || [30, 7, 1]).length ? `${(item.details.reminder_days || [30, 7, 1]).join(', ')} days before` : 'Disabled'}</dd></dl></button>)}{!shownItems.length && <Empty section={section} filtered={!!query || filter !== 'all'} />}</div>}
      {section === 'deployments' && <div className="ops-deployments"><div className="ops-compare-toolbar"><label>Environment <select aria-label="Deployment environment" value={environmentId} onChange={event => navigate({ environment: event.target.value })}><option value="">All environments</option>{environments.map(env => <option key={env.id} value={env.id}>{env.name}</option>)}</select></label><span className="ops-muted">Schedules also appear in Planning.</span></div>{shownSeries.length > 0 && <section className="ops-series"><h3>Recurring schedules</h3>{shownSeries.map(record => <button type="button" key={record.id} onClick={() => navigate({ series: record.id, record: null })}><FiCalendar /><span><strong>{record.name}</strong><small>{record.frequency} · {record.local_time} · {record.time_zone}</small></span><span>Edit future dates →</span></button>)}</section>}<div className="ops-record-grid">{shownDeployments.map(record => <button type="button" key={record.id} className="ops-record-card" onClick={() => navigate({ record: record.id, series: null })}><span className={`ops-badge ${record.status === 'failed' ? 'ops-badge-warning' : ''}`}>{humanStatus(record.status)}</span><h3>{record.name}</h3><p>{record.environment_name} · {record.owner_name}</p><time>{formatDate(record.scheduled_at, record.time_zone)}</time><small>{record.time_zone}</small><p>{record.verification_status === 'verified' ? '✓ Versions verified' : `${record.targets?.length || 0} version targets · Not verified`}</p></button>)}{!shownDeployments.length && <Empty section={section} filtered={!!query || filter !== 'all'} />}</div></div>}
      <footer className="ops-workspace-footer">Recorded configuration · Updated by project members · Refresh after external changes</footer>
    </div>
    {recordId && !selectedItem && !selectedDeployment && <div className="ops-error" role="status">This record is unavailable in the selected section. <button type="button" onClick={close}>Clear selection</button></div>}
    {showEditor && <ItemEditor key={selectedItem?.id || `new-${drawer.kind}`} item={selectedItem} kind={selectedItem?.kind || drawer.kind} environmentId={environmentId} snapshot={{ ...snapshot, history }} onClose={close} onSave={saveItem} onVerifyEntry={(id, envId, expectedRevision) => mutate(current => operationsApi.saveEntry(projectId, id, envId, { revision: current, entry: { verify_observation: true } }), "Installed version verified.", expectedRevision)} onDelete={(id, reason, expectedRevision) => mutate(current => operationsApi.deleteItem(projectId, id, { revision: current, reason }), 'Record deleted.', expectedRevision)} />}
    {showDeployment && <DeploymentEditor key={selectedDeployment?.id || (selectedSeries ? `series-${selectedSeries.id}` : 'new-deployment')} record={selectedDeployment || selectedSeries} isSeries={!!selectedSeries} snapshot={snapshot} environmentId={environmentId} onClose={close} onSave={saveDeployment} onAction={deploymentAction} projectId={projectId} onCancelSeries={(id, expectedRevision) => mutate(current => operationsApi.deleteSeries(projectId, id, { revision: current }), 'Recurring schedule cancelled.', expectedRevision)} />}
    {drawer?.type === 'import' && <ImportDrawer projectId={projectId} snapshot={snapshot} environmentId={environmentId} format={section === 'software' ? 'versions' : 'env'} onClose={close} onCommit={payload => mutate(() => operationsApi.commitImport(projectId, payload), 'Selected records imported.')} />}
    {drawer?.type === 'environments' && <EnvironmentManager revision={snapshot.revision} environments={environments} writable={writable} onClose={close} onSave={(record, expectedRevision) => mutate(current => operationsApi.saveEnvironment(projectId, record.id, { project_environment: record, revision: current }), 'Environment saved.', expectedRevision)} onDelete={(id, expectedRevision) => mutate(current => operationsApi.deleteEnvironment(projectId, id, { revision: current }), 'Environment deleted.', expectedRevision)} />}
    {drawer?.type === 'history' && <OperationsDrawer title="Project change history" subtitle="Who changed what, when, and why" onClose={close}><div className="ops-drawer-body"><History events={history} />{historyMore && history.length >= 50 && <button type="button" disabled={historyBusy} onClick={loadHistory}>{historyBusy ? 'Loading…' : 'Load older changes'}</button>}</div></OperationsDrawer>}
  </section>;
}

function Summary({ icon: Icon, value, label, onClick }) { return <button type="button" className="ops-summary-card" onClick={onClick}><Icon /><strong>{value}</strong><span>{label}</span></button>; }
function Empty({ section, filtered }) { return <div className="ops-empty"><FiLayers /><h3>{filtered ? 'No matching records' : `No ${SECTIONS.find(([id]) => id === section)?.[1].toLowerCase()} yet`}</h3><p>{filtered ? 'Change the search or filter to see more records.' : 'Add your first record using the action above.'}</p></div>; }
function MatrixCell({ item, entry }) {
  if (entry?.value_unavailable) return <span className="ops-badge ops-badge-warning">Value unavailable</span>;
  const status = entryStatus(item, entry);
  return <><span className={`ops-badge ${['Mismatch', 'Missing required'].includes(status) ? 'ops-badge-warning' : status === 'Match' || status === 'Configured' ? 'ops-badge-success' : ''}`}>{status}</span>{item.kind === 'software' ? <span className="ops-version">{entry?.expected_version || 'No target'} → <strong>{entry?.observed_version || 'Unknown'}</strong></span> : item.kind === 'service' ? <span className="ops-endpoint">{(entry?.details?.endpoints || (entry?.details?.endpoint ? [{ url: entry.details.endpoint, label: 'API' }] : [])).map(endpoint => <span key={endpoint.label}>{endpoint.label}: {endpoint.url}</span>)}</span> : !item.secret && entry?.configured && <span className="ops-value">{entry.value}</span>}{entry?.updated_at && <small>{entry.updated_by?.name ? `${entry.updated_by.name} · ` : ''}{formatDate(item.kind === 'software' ? entry.observed_at : entry.updated_at)}</small>}</>;
}
