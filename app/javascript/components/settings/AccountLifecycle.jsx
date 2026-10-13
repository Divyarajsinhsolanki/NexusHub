import React, { useEffect, useState } from 'react';
import api from '../api';

export default function AccountLifecycle() {
  const [status, setStatus] = useState(null);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [successor, setSuccessor] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = async () => {
    try { const response = await api.get('/account'); setStatus(response.data.data); setError(''); }
    catch (e) { setError(e.response?.data?.error || 'Could not load account controls. Please retry.'); }
  };
  useEffect(() => {
    void load();
    const refresh = () => { if (document.visibilityState !== 'hidden') void load(); };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);
  const perform = async (operation) => {
    setBusy(true); setError('');
    try { const response = await operation(); setStatus(response.data.data); setCode(''); setConfirmation(''); }
    catch (e) { setError(e.response?.data?.error || 'The request failed. Please try again.'); }
    finally { setBusy(false); }
  };
  const exportData = async () => {
    setBusy(true); setError('');
    try {
      const response = await api.get('/account/export', { timeout: 60000 });
      const url = URL.createObjectURL(new Blob([JSON.stringify(response.data.data, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'nexus-account-export.json';
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e.response?.data?.error || 'Export failed. Please try again.'); }
    finally { setBusy(false); }
  };
  const scheduled = status?.status === 'scheduled';
  return <section className="border-t border-default pt-6" aria-label="Account data and deletion">
    <h4 className="text-sm font-semibold text-danger">Account data and deletion</h4>
    <p className="mt-2 max-w-xl text-sm text-muted">Export your data before deleting your account. Confirm by email, then cancel anytime during the seven-day waiting period.</p>
    {status && <p className="mt-2 max-w-xl text-sm text-muted">{status.retention}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
    <div className="mt-4 flex flex-wrap gap-3">
      <button type="button" className="app-secondary-button" disabled={busy} onClick={exportData}>Export my data</button>
      {!scheduled && <button type="button" className="app-secondary-button app-danger-button" disabled={busy || !status?.can_delete} onClick={() => setOpen(!open)}>Delete Account</button>}
      {!status && <button type="button" className="app-secondary-button" onClick={load}>Retry account controls</button>}
    </div>
    {scheduled ? <div className="mt-4 rounded-xl border border-default p-4">
      <p>Deletion scheduled for {new Date(status.delete_after).toLocaleString()}.</p>
      <p className="text-sm text-muted">Reference: {status.receipt_id}</p>
      <button type="button" className="app-secondary-button mt-3" disabled={busy} onClick={() => perform(() => api.delete('/account/deletion'))}>Cancel account deletion</button>
    </div> : open && <div className="mt-4 max-w-xl space-y-3 rounded-xl border border-default p-4">
      {status?.failure_reason && <p role="alert">{status.failure_reason}</p>}
      <p className="text-sm text-muted">Ownership transfers happen immediately. Cancelling deletion does not undo them.</p>
      {status?.needs_transfer && <label className="block text-sm">Transfer shared ownership to
        <select className="mt-1 block w-full rounded-lg border border-default bg-surface-elevated p-2" value={successor} onChange={e => setSuccessor(e.target.value)}>
          <option value="">Choose an active workspace member</option>
          {status.successors.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
        </select>
        {!status.successors.length && <span className="text-danger">Add another active workspace member before deleting your account.</span>}
      </label>}
      <button type="button" className="app-secondary-button" disabled={busy} onClick={() => perform(() => api.post('/account/deletion/code'))}>Send verification code</button>
      {status?.status === 'verification_pending' && <form className="space-y-3" onSubmit={e => { e.preventDefault(); void perform(() => api.post('/account/deletion', { verification_code: code, successor_id: successor || null, confirmation })); }}>
        <label className="block text-sm">Email verification code<input className="mt-1 block w-full rounded-lg border border-default bg-surface-elevated p-2" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value)} /></label>
        <label className="block text-sm">Type DELETE to confirm<input className="mt-1 block w-full rounded-lg border border-default bg-surface-elevated p-2" autoComplete="off" value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>
        <button type="submit" className="app-secondary-button app-danger-button" disabled={busy || !/^\d{6}$/.test(code) || confirmation !== 'DELETE' || (status.needs_transfer && !successor)}>Confirm account deletion</button>
      </form>}
    </div>}
  </section>;
}
