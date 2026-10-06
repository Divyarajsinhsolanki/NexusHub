import React, { useState } from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { Check, X, UserPlus, ShieldCheck } from 'lucide-react';
import Avatar from './ui/Avatar';

const labels = { first_name: 'First name', last_name: 'Last name', email: 'Email address', job_title: 'Job title', phone_number: 'Phone number', date_of_birth: 'Birth date', password: 'Password', password_confirmation: 'Confirm password' };
const landingPages = ['home', 'demo', 'calendar', 'posts', 'profile', 'vault', 'knowledge', 'worklog', 'projects', 'teams', 'pdf', 'users', 'departments', 'chat', 'notifications'];
const roleLabel = (role) => role.replaceAll('_', ' ');

export default function UserEditorDialog({ mode, value, roles, departments, projects = [], onChange, onRoleToggle, onProjectToggle, onClose, onSubmit, busy }) {
  const [tab, setTab] = useState('details');
  const creating = mode === 'create';
  const selectedRoles = creating ? value.role_names : value.roles;
  const fields = creating ? ['first_name', 'last_name', 'email', 'job_title', 'password', 'password_confirmation'] : ['first_name', 'last_name', 'email', 'job_title', 'phone_number', 'date_of_birth'];
  const inputClass = 'mt-1.5 min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100';
  return <Dialog open onClose={() => { if (!busy) onClose(); }} className="relative z-50">
    <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
    <div className="fixed inset-0 flex items-center justify-center p-3 sm:p-6">
      <DialogPanel className="flex max-h-[calc(100dvh-24px)] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <form onSubmit={onSubmit} className="flex min-h-0 flex-col">
          <header className="flex shrink-0 items-center gap-3 border-b px-5 py-4">
            <Avatar name={`${value.first_name} ${value.last_name}`} className="h-11 w-11 shrink-0" />
            <div className="min-w-0 flex-1"><DialogTitle className="text-lg font-semibold text-gray-900">{creating ? 'Add user' : 'Edit user'}</DialogTitle><p className="truncate text-sm text-gray-500">{creating ? 'New workspace member' : value.email}</p></div>
            <button type="button" aria-label="Close user editor" title="Close" disabled={busy} onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-md hover:bg-gray-100"><X size={18} /></button>
          </header>
          <nav className="flex shrink-0 gap-5 border-b px-5" aria-label="User settings">
            {[['details', 'Details'], ['access', 'Access']].map(([key, label]) => <button key={key} type="button" onClick={() => setTab(key)} aria-current={tab === key ? 'page' : undefined} className={`border-b-2 py-3 text-sm font-medium ${tab === key ? 'border-emerald-600 text-emerald-800' : 'border-transparent text-gray-500'}`}>{label}</button>)}
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <section hidden={tab !== 'details'} className={tab === 'details' ? 'grid grid-cols-1 gap-4 sm:grid-cols-2' : 'hidden'}>
              {fields.map((name) => <label key={name} className="text-sm font-medium text-gray-700">{labels[name]}<input name={name} value={value[name] || ''} onChange={onChange} type={name.includes('password') ? 'password' : name === 'email' ? 'email' : name === 'date_of_birth' ? 'date' : name === 'phone_number' ? 'tel' : 'text'} required={['first_name', 'last_name', 'email', 'job_title'].includes(name) || name.includes('password')} minLength={name.includes('password') ? 6 : undefined} autoComplete={name.includes('password') ? 'new-password' : undefined} className={inputClass} /></label>)}
              <label className="text-sm font-medium text-gray-700">Department<select name="department_id" value={value.department_id} onChange={onChange} className={inputClass}><option value="">No department</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
              {!creating && <>
                <label className="text-sm font-medium text-gray-700">Landing page<select name="landing_page" value={value.landing_page || 'profile'} onChange={onChange} className={inputClass}>{landingPages.map((page) => <option key={page} value={page}>{page}</option>)}</select></label>
                <label className="text-sm font-medium text-gray-700 sm:col-span-2">Bio<textarea name="bio" value={value.bio} onChange={onChange} rows={3} className={inputClass} /></label>
                {['profile_picture', 'cover_photo'].map((name) => <label key={name} className="min-w-0 text-sm font-medium text-gray-700">{name === 'profile_picture' ? 'Profile picture' : 'Cover photo'}<input name={name} type="file" accept="image/*" onChange={onChange} className="mt-2 block w-full min-w-0 text-xs file:mr-2 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-2" /></label>)}
              </>}
            </section>
            <section hidden={tab !== 'access'}>
              <fieldset><legend className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900"><ShieldCheck size={17} />Workspace roles</legend><div className="grid gap-2 sm:grid-cols-2">{roles.map((role) => <label key={role} className="flex min-h-11 cursor-pointer items-center gap-3 border-b border-gray-100 py-2 text-sm capitalize"><input type="checkbox" checked={selectedRoles.includes(role)} onChange={() => onRoleToggle(role)} className="h-4 w-4 rounded border-gray-300 accent-emerald-700" />{roleLabel(role)}</label>)}</div></fieldset>
              {creating && <fieldset className="mt-6"><legend className="mb-3 text-sm font-semibold text-gray-900">Projects <span className="ml-2 font-normal text-gray-500">{value.project_ids.length} selected</span></legend>{projects.length ? projects.map((project) => <label key={project.id} className="flex cursor-pointer items-start gap-3 border-b border-gray-100 py-3 text-sm"><input type="checkbox" checked={value.project_ids.includes(project.id)} onChange={() => onProjectToggle(project.id)} className="mt-1 h-4 w-4 accent-emerald-700" /><span className="min-w-0 break-words">{project.name}</span></label>) : <p className="text-sm text-gray-500">No projects available</p>}</fieldset>}
            </section>
          </div>
          <footer className="flex shrink-0 justify-end gap-3 border-t bg-gray-50 px-5 py-4"><button type="button" disabled={busy} onClick={onClose} className="min-h-11 rounded-md border border-gray-300 bg-white px-4 text-sm font-medium">Cancel</button><button type="submit" disabled={busy} onClick={() => setTab('details')} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50">{creating ? <UserPlus size={16} /> : <Check size={16} />}{busy ? 'Saving...' : creating ? 'Add user' : 'Save changes'}</button></footer>
        </form>
      </DialogPanel>
    </div>
  </Dialog>;
}
