import React, { useEffect, useState } from 'react';
import { fetchWorkspaceInvitations, resendWorkspaceInvitation, revokeWorkspaceInvitation } from './api';
export default function WorkspaceInvitationsPanel({ revision = 0 }) {
  const [invitations, setInvitations] = useState([]), [loading, setLoading] = useState(true), [busy, setBusy] = useState(null), [error, setError] = useState('');
  const load = async () => { try { const { data } = await fetchWorkspaceInvitations(); setInvitations(data); } catch { setError('Invitations could not be loaded.'); } finally { setLoading(false); } };
  useEffect(() => { let active = true; fetchWorkspaceInvitations().then(({ data }) => { if (active) setInvitations(data); }).catch(() => { if (active) setError('Invitations could not be loaded.'); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [revision]);
  const change = async (invitation, revoke) => { setBusy(invitation.id); setError(''); try { await (revoke ? revokeWorkspaceInvitation(invitation.id) : resendWorkspaceInvitation(invitation.id)); await load(); } catch (failure) { setError(failure.response?.data?.errors?.join(', ') || 'Invitation could not be updated.'); } finally { setBusy(null); } };
  const pending = invitations.filter((item) => ['pending', 'expired'].includes(item.status));
  return <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5 text-gray-900" aria-label="Workspace invitations"><h2 className="text-lg font-semibold">Invitations</h2>
    {loading ? <p role="status" className="mt-2 text-sm">Loading invitations…</p> : !pending.length ? <p className="mt-2 text-sm text-gray-500">No pending invitations.</p> : <ul className="mt-3 divide-y">{pending.map((item) => <li className="flex flex-wrap items-center justify-between gap-3 py-3" key={item.id}><div className="min-w-0"><p className="break-all text-sm font-semibold">{item.email}</p><p className="text-xs text-gray-500">{item.roles.join(', ')} · {item.status} · Email {item.delivery_status} · Expires {new Date(item.expires_at).toLocaleDateString()}</p></div><div className="flex gap-3"><button type="button" disabled={busy === item.id} onClick={() => change(item, false)} className="text-sm font-semibold text-emerald-700">Resend</button><button type="button" disabled={busy === item.id} onClick={() => change(item, true)} className="text-sm font-semibold text-red-700">Revoke</button></div></li>)}</ul>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  </section>;
}
