import React, { useState } from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { createWorkspaceInvitation } from './api';

export default function WorkspaceInviteDialog({ roles, departments = [], projects = [], initialEmail = '', onClose, onCreated }) {
  const [form, setForm] = useState({ email: initialEmail, role_names: ['member'], department_id: '', project_ids: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toggle = (key, value) => setForm((current) => ({ ...current, [key]: current[key].includes(value) ? current[key].filter((item) => item !== value) : [...current[key], value] }));
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try { const { data } = await createWorkspaceInvitation({ ...form, department_id: form.department_id || null }); onCreated(data); }
    catch (failure) { setError(failure.response?.data?.errors?.join(', ') || 'Invitation could not be created.'); }
    finally { setBusy(false); }
  };
  const input = 'mt-2 w-full rounded-lg border border-gray-300 bg-white p-3 text-gray-900';
  return <Dialog open onClose={() => !busy && onClose()} className="relative z-50">
    <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
    <div className="fixed inset-0 flex items-center justify-center p-3">
      <DialogPanel className="max-h-[calc(100dvh-24px)] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-6 text-gray-900 shadow-xl">
        <DialogTitle className="text-xl font-semibold">Invite teammate</DialogTitle>
        <p className="mt-2 text-sm text-gray-600">They receive a private, seven-day link and choose their own password. The invitation reserves one seat until accepted, revoked or expired.</p>
        <form onSubmit={submit} className="mt-5 space-y-5">
          <label className="block text-sm font-semibold">Email address<input type="email" required maxLength={254} autoComplete="email" className={input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <fieldset><legend className="text-sm font-semibold">Workspace roles</legend><div className="mt-2 grid gap-3 sm:grid-cols-2">{roles.map((role) => <label key={role} className="flex items-center gap-2 text-sm capitalize"><input type="checkbox" checked={form.role_names.includes(role)} onChange={() => toggle('role_names', role)} />{role.replaceAll('_', ' ')}</label>)}</div></fieldset>
          <label className="block text-sm font-semibold">Department<select className={input} value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}><option value="">No department</option>{departments.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          {projects.length > 0 && <fieldset><legend className="text-sm font-semibold">Initial projects</legend><div className="mt-2 space-y-2">{projects.map((item) => <label className="flex items-center gap-2 text-sm" key={item.id}><input type="checkbox" checked={form.project_ids.includes(item.id)} onChange={() => toggle('project_ids', item.id)} />{item.name}</label>)}</div></fieldset>}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-3"><button type="button" disabled={busy} onClick={onClose} className="rounded-lg border px-4 py-3">Cancel</button><button disabled={busy} type="submit" className="rounded-lg bg-emerald-700 px-4 py-3 font-semibold text-white">{busy ? 'Creating invitation…' : 'Send invitation'}</button></div>
        </form>
      </DialogPanel>
    </div>
  </Dialog>;
}
