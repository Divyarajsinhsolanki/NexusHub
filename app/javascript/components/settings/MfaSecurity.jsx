import React, { useContext, useState } from 'react';
import api from '../api';
import { AuthContext } from '../../context/AuthContext';

export default function MfaSecurity({ gate = false }) {
  const { user, setUser, handleLogout, completeMfa } = useContext(AuthContext);
  const [setup, setSetup] = useState(null), [codes, setCodes] = useState(null), [code, setCode] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const run = async (action) => { setBusy(true); setError(''); setMessage(''); try { await action(); } catch (failure) { setError(failure.response?.data?.message || failure.response?.data?.error || 'Security action failed. Try again.'); } finally { setBusy(false); } };
  const reload = async () => { const { data } = await api.get('/session'); setUser(data.user); completeMfa?.(); };
  const verified = async () => { await api.post('/mfa/verify', { otp_code: code }); setCode(''); await reload(); setMessage('Authenticator verified. Sensitive actions are unlocked for 10 minutes.'); };
  const field = 'mt-2 w-full rounded-lg border border-default bg-card p-3 text-primary';
  return <section className={gate ? 'min-h-screen bg-app px-4 py-10 text-primary' : 'text-primary'}><div className="mx-auto w-full max-w-xl space-y-5 rounded-xl border border-default bg-card p-6">
    <h2 className="text-xl font-semibold">Authenticator security</h2>
    <p className="text-sm text-muted">Owners, admins and platform administrators must use MFA. Use a six-digit authenticator code or a single-use recovery code. Sensitive actions require verification within 10 minutes.</p>
    {codes ? <><h3 className="font-semibold">Save your recovery codes</h3><p className="text-sm">These codes appear once. Store them securely outside this account; each code works once.</p><pre className="overflow-x-auto rounded-lg bg-app p-3 text-sm">{codes.join('\n')}</pre><button onClick={() => run(async () => { setCodes(null); setSetup(null); await reload(); })} disabled={busy} className="rounded-lg bg-emerald-700 px-4 py-3 text-white">I saved my recovery codes</button></> : <>
      {!user?.mfa?.enabled && !setup && <><label className="block text-sm">Current password (required if you signed in more than 10 minutes ago)<input type="password" autoComplete="current-password" className={field} value={password} onChange={e => setPassword(e.target.value)} /></label><button disabled={busy} className="rounded-lg bg-emerald-700 px-4 py-3 text-white" onClick={() => run(async () => { const {data} = await api.post('/mfa/setup', {password}); setPassword(''); setSetup(data); })}>Set up authenticator</button></>}
      {setup && <><p>Add this setup key manually to your authenticator as a time-based account named Nexus Hub. The key expires in 10 minutes.</p><code className="block break-all rounded-lg bg-app p-3 select-all">{setup.secret}</code></>}
      {(setup || user?.mfa?.enabled) && <form onSubmit={e => {e.preventDefault();run(async () => { if(setup){ const {data}=await api.post('/mfa/confirm',{otp_code:code});setCodes(data.recovery_codes);setCode(''); } else await verified(); });}} className="space-y-4"><label className="block text-sm">{setup ? 'Authenticator code' : 'Authenticator or recovery code'}<input required autoComplete="one-time-code" className={field} value={code} onChange={e => setCode(e.target.value)} /></label><button disabled={busy} className="rounded-lg bg-emerald-700 px-4 py-3 text-white">{busy?'Checking…':setup?'Enable MFA':'Verify MFA'}</button></form>}
      {!gate && user?.mfa?.enabled && <><label className="block text-sm">Current password<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className={field}/></label><button disabled={busy} className="rounded-lg border border-default px-4 py-3" onClick={() => run(async()=>{const {data}=await api.post('/mfa/recovery',{password});setPassword('');setCodes(data.recovery_codes);})}>Replace recovery codes</button>{!user.mfa.required && <button disabled={busy} className="ml-3 rounded-lg border px-4 py-3" onClick={()=>run(async()=>{await api.delete('/mfa',{data:{password}});setPassword('');await reload();})}>Disable MFA</button>}</>}
    </>}
    {error && <p role="alert" className="text-red-600">{error}</p>}{message && <p role="status">{message}</p>}
    {gate && <button disabled={busy} onClick={handleLogout} className="rounded-lg border border-default px-4 py-3">Sign out</button>}
  </div></section>;
}
