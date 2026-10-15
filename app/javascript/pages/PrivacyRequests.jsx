import React, { useEffect, useState } from 'react';
import api from '../components/api';

const types = ['access', 'correction', 'erasure', 'portability', 'restriction', 'objection', 'consent_withdrawal', 'complaint', 'other'];
export default function PrivacyRequests() {
  const [initial] = useState(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const value = { token: fragment.get('verify') || fragment.get('track') || '', mode: fragment.has('verify') ? 'verify' : 'status' };
    return value;
  });
  useEffect(() => { window.history.replaceState(null, '', window.location.pathname + window.location.search); }, []);
  const [token, setToken] = useState(initial.token);
  const [mode, setMode] = useState(initial.mode);
  const [record, setRecord] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', email: '', request_type: 'access', details: '', country: '' });
  const run = async (operation) => {
    setBusy(true); setError('');
    try { await operation(); } catch (failure) { setError(failure.response?.data?.error || 'Request unavailable. Please try again or use the contact on the legal page.'); }
    finally { setBusy(false); }
  };
  const track = () => run(async () => {
    const { data } = await api.post(`/privacy_requests/${mode}`, { token }, { skipAuthRetry: true });
    if (data.tracking_token) { setToken(data.tracking_token); setMode('status'); }
    setRecord(data.request);
  });
  const field = (name) => ({ value: form[name], onChange: event => setForm({ ...form, [name]: event.target.value }) });
  const inputClass = 'mt-1 block w-full rounded-lg border border-default bg-card p-3';
  return <main className="app-surface mx-auto my-6 max-w-3xl space-y-5 rounded-2xl border p-5 sm:p-8">
    <h1 className="text-3xl font-bold">Privacy rights requests</h1>
    <p>Request access, correction, erasure or another privacy review, including if you cannot sign in. <a className="underline" href="/legal">Read the privacy notice and operator contact</a>.</p>
    <p>For personal exports and account deletion, you can also use <a className="underline" href="/settings?tab=security">Settings</a>. This form starts a review; it does not automatically disclose data or delete an account.</p>
    {token ? <section className="space-y-3" aria-label="Private tracking">
      <h2 className="text-xl font-semibold">Private request tracking</h2>
      <p>Keep the original email. Its private link grants access to the response. Opening this page alone does not verify your email.</p>
      <button className="app-primary-button" disabled={busy} onClick={track}>{busy ? 'Loading…' : mode === 'verify' ? 'Verify email and view request' : 'Refresh request status'}</button>
      {record && <div className="space-y-2" role="status"><p>Reference: {record.reference}</p><p>Status: {record.status.replaceAll('_', ' ')}</p><p>Review target: {new Date(record.target_response_at).toLocaleDateString()} (an operational target; applicable legal deadlines may differ).</p>{record.response && <p className="whitespace-pre-wrap break-words">{record.response}</p>}{record.redacted_at && <p>The retained response has been removed under our retention policy. Contact the operator if you need further help.</p>}</div>}
    </section> : <form className="space-y-4" onSubmit={event => { event.preventDefault(); run(async () => {
      const { data } = await api.post('/privacy_requests', { privacy_request: form }, { skipAuthRetry: true });
      setMessage(`${data.message} Reference: ${data.reference}`); setForm({ name: '', email: '', request_type: 'access', details: '', country: '' });
    }); }}>
      <label className="block">Name (optional)<input className={inputClass} maxLength={120} autoComplete="name" {...field('name')} /></label>
      <label className="block">Email address<input className={inputClass} required type="email" maxLength={254} autoComplete="email" {...field('email')} /></label>
      <label className="block">Request type<select className={inputClass} {...field('request_type')}>{types.map(type => <option key={type} value={type}>{type.replaceAll('_', ' ')}</option>)}</select></label>
      <label className="block">Country or region (optional)<input className={inputClass} maxLength={100} {...field('country')} /></label>
      <label className="block">What would you like us to review?<textarea className={inputClass} required rows={5} maxLength={4000} {...field('details')} /></label>
      <p className="text-sm text-muted">Include enough context to locate your records, such as your workspace name. Do not include passwords, API keys, payment-card details, identity documents, or other people's private information. We may ask for proportionate identity or representative-authority verification through a secure channel.</p>
      <p className="text-sm text-muted">We use these details to verify, review and answer your request. Unverified requests are removed after 7 days; closed request content after 90 days; minimal case history after one year. Open cases remain until resolved. Email verification links expire after 24 hours.</p>
      <button className="app-primary-button" disabled={busy}>{busy ? 'Submitting…' : 'Submit privacy request'}</button>
    </form>}
    {message && <p role="status">{message}</p>}{error && <p role="alert" className="text-red-600">{error}</p>}
  </main>;
}
