import React, { useContext, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import AuthLayout from '../components/ui/AuthLayout';
import { previewWorkspaceInvitation, acceptWorkspaceInvitation } from '../components/api';
export default function AcceptWorkspaceInvitation() {
  const { user, handleLogout } = useContext(AuthContext);
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') || '');
  const [preview, setPreview] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [accepted, setAccepted] = useState(false);
  const [account, setAccount] = useState({ first_name: '', last_name: '', job_title: 'Team Member', password: '', password_confirmation: '', current_password: '' });
  useEffect(() => { let active = true; if (!token) { setError('This invitation link is missing its token. Ask your company to resend it.'); return; } previewWorkspaceInvitation(token).then(({ data }) => { if (active) setPreview(data); }).catch((failure) => { if (active) setError(failure.response?.data?.errors?.join(', ') || 'This invitation is unavailable.'); }); return () => { active = false; }; }, [token]);
  const submit = async (event) => { event.preventDefault(); if (!preview.existing_account && account.password !== account.password_confirmation) { setError('Passwords do not match.'); return; } setBusy(true); setError(''); try { await acceptWorkspaceInvitation(token, account); window.history.replaceState(null, '', window.location.pathname); setAccepted(true); } catch (failure) { setError(failure.response?.data?.errors?.join(', ') || 'Invitation could not be accepted.'); } finally { setBusy(false); } };
  const wrongUser = user && preview && user.email.toLowerCase() !== preview.email.toLowerCase();
  return <AuthLayout><Helmet><title>Accept invitation | Nexus Hub</title><meta name="robots" content="noindex,nofollow" /><meta name="referrer" content="no-referrer" /></Helmet>
    <h1 className="text-2xl font-semibold">{accepted ? 'You’re ready to join' : 'Join your company workspace'}</h1>
    {accepted ? <p className="mt-4">Your invitation has been accepted. <Link to="/login" className="font-semibold text-theme">Sign in to continue</Link>.</p> : <>
      {!preview && !error && <p role="status" className="mt-4">Checking your invitation…</p>}
      {preview && <><p className="mt-3 text-sm">Join <strong>{preview.workspace_name}</strong> as {preview.email}.</p><p className="mt-2 text-sm">Approved roles: {preview.roles.join(', ')}</p>
        {preview.other_workspace ? <p role="alert" className="mt-4">This email already belongs to another company workspace. Ask your inviter to use a different email address.</p> : wrongUser ? <div className="mt-4"><p>Sign out of your current account before accepting this invitation.</p><button className="mt-3 rounded-lg border p-3" type="button" onClick={async () => { await handleLogout(); window.location.assign(`/invitations/accept#token=${encodeURIComponent(token)}`); }}>Sign out</button></div> : <form onSubmit={submit} className="mt-5 space-y-4">
          {(preview.existing_account ? [['current_password', 'Existing account password']] : [['first_name', 'First name'], ['last_name', 'Last name'], ['job_title', 'Job title'], ['password', 'Choose password'], ['password_confirmation', 'Confirm password']]).map(([key, label]) => <label key={key} className="block text-sm font-semibold">{label}<input className="mt-2 w-full rounded-lg border border-shell-border bg-surface-card p-3 text-shell-text" required value={account[key]} type={key.includes('password') ? 'password' : 'text'} minLength={key.includes('password') && key !== 'current_password' ? 8 : undefined} autoComplete={key === 'current_password' ? 'current-password' : key.includes('password') ? 'new-password' : undefined} onChange={(e) => setAccount({ ...account, [key]: e.target.value })} /></label>)}
          <button type="submit" disabled={busy} className="w-full rounded-lg bg-theme p-3 font-semibold text-white disabled:opacity-50">{busy ? 'Joining…' : 'Accept invitation'}</button>
        </form>}</>}
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    </>}
  </AuthLayout>;
}
