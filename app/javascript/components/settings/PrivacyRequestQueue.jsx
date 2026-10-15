import React, { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../../context/AuthContext';
import api from '../api';

export default function PrivacyRequestQueue() {
  const { user } = useContext(AuthContext);
  const [records, setRecords] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('');
  const allowed = user?.site_admin && !user?.demo_account;
  const load = async () => { const { data } = await api.get('/privacy_request_management', { params: filter ? { status: filter } : {} }); setRecords(data); };
  const run = async action => {
    setError(''); setBusy(true);
    try { await action(); } catch (failure) { setError(failure.response?.data?.message || failure.response?.data?.error || 'Privacy queue could not be loaded. Verify MFA and retry.'); }
    finally { setBusy(false); }
  };
  useEffect(() => { setRecords([]); if (allowed) run(load); }, [allowed, user?.id, filter]);
  if (!allowed) return null;
  return <section className="space-y-4 rounded-xl border border-default p-6">
    <h3 className="text-lg font-semibold">Privacy operator queue</h3>
    <p>Operator access requires recent MFA. Email confirmation proves mailbox access only. Independently verify identity and authority before disclosure or destructive action. Explain any refusal and secure next steps for additional information. Completing a case here records a review; it does not run account deletion or export.</p>
    <button className="app-secondary-button" disabled={busy} onClick={() => run(load)}>Refresh privacy queue</button>
    <label className="block">Queue filter<select value={filter} onChange={event => setFilter(event.target.value)} className="block w-full rounded border bg-card p-2"><option value="">Open requests</option>{['pending_verification', 'received', 'in_progress', 'needs_information', 'completed', 'declined'].map(status => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select></label>
    <p className="text-sm text-muted">Showing up to 100 requests, earliest review target first.</p>
    {records.length === 0 && <p>No retained requests to show.</p>}
    {records.map(record => <article key={`${record.reference}:${record.lock_version}`} className="space-y-3 rounded-lg border border-default p-4">
      <h4 className="break-all font-semibold">{record.request_type} · {record.reference}</h4>
      <p>{record.status.replaceAll('_', ' ')} · target {new Date(record.target_response_at).toLocaleDateString()}{new Date(record.target_response_at) < new Date() && !['completed', 'declined'].includes(record.status) ? ' · Review overdue' : ''}</p>
      <p className="break-words">{record.details?.name} · {record.details?.email} · {record.details?.country}</p>
      <p className="whitespace-pre-wrap break-words">{record.details?.details}</p>
      {record.email_verified_at && !record.redacted_at && !['completed', 'declined'].includes(record.status) && <form className="space-y-3" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); run(async () => {
        const result = await api.patch(`/privacy_request_management/${record.reference}`, { privacy_request: { status: data.get('status'), response: data.get('response'), operator_note: data.get('operator_note'), identity_verified: data.has('identity_verified'), lock_version: record.lock_version } });
        await load(); setNotice(result.data?.notification_queued ? 'Request review saved; response notification queued.' : 'Request review saved. No notification was queued; use the agreed contact channel or check email delivery if a response was entered.');
      }); }}>
        <label className="block">Status<select name="status" defaultValue={record.status === 'received' ? 'in_progress' : record.status} className="block w-full rounded border bg-card p-2">{['in_progress', 'needs_information', 'completed', 'declined'].map(status => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select></label>
        <label className="block">Response to requester<textarea name="response" maxLength={4000} rows={3} defaultValue={record.response || ''} className="block w-full rounded border bg-card p-2" /></label>
        <label className="block">Internal review / verification basis<textarea name="operator_note" required maxLength={4000} rows={3} defaultValue={record.details?.operator_note || ''} className="block w-full rounded border bg-card p-2" /></label>
        <label className="flex gap-2"><input name="identity_verified" type="checkbox" defaultChecked={Boolean(record.identity_verified_at)} />Identity and representative authority have been verified proportionately</label>
        <button className="app-primary-button" disabled={busy}>Save review</button>
      </form>}
      {record.response && <p className="whitespace-pre-wrap break-words">Response: {record.response}</p>}
    </article>)}
    {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
  </section>;
}
