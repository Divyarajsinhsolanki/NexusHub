import React, { useMemo, useRef, useState } from 'react';
import api from '../api';

export default function DepartmentDashboard({ department, onUpdated, readOnly }) {
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const flight = useRef(false);
  const dashboard = department.dashboard;
  const rows = useMemo(() => (dashboard?.workload || []).filter(row => row.name.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>b.allocation_percentage-a.allocation_percentage || b.open_tasks-a.open_tasks), [dashboard, search]);
  if (!dashboard) return null;
  const changeRole = async (userId, role) => {
    if (flight.current) return;
    flight.current = true; setBusy(true); setError('');
    try { const response=await api.patch(`/departments/${department.id}/update_role`,{user_id:userId,role}); onUpdated(response.data); }
    catch (failure) { const value=failure.response?.data?.error; setError(typeof value==='string'?value:value?.message || 'Unable to save role. Try again.'); }
    finally { flight.current=false;setBusy(false); }
  };
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900" aria-labelledby="department-dashboard">
    <h2 id="department-dashboard" className="mb-4 text-xl font-semibold">Department dashboard</h2>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{[['Members',dashboard.members_count],['Active projects',dashboard.active_projects],['Open tasks',dashboard.open_tasks],['Overdue',dashboard.overdue_tasks],['Due in 7 days',dashboard.due_this_week]].map(([label,count])=><div key={label} className="rounded-xl bg-slate-50 p-3 dark:bg-zinc-800"><p className="text-xs text-slate-500">{label}</p><p className="text-2xl font-bold">{count}</p></div>)}</div>
    <h3 className="mt-6 text-lg font-semibold">Workload and roles</h3>
    <p className="my-2 text-sm text-slate-500">{dashboard.scope} Head and managers can manage membership; only the head or workspace administrators can assign roles. Department roles do not change project permissions.</p>
    {error ? <p role="alert" className="text-red-600">{error}</p>:null}
    <input aria-label="Search department workload" className="app-input my-3" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search members" />
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Member','Role','Open / overdue','Estimated hours','Allocation','Availability'].map(label=><th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.user_id} className="border-t dark:border-zinc-700"><td className="p-2">{row.name}</td><td className="p-2">{!readOnly && department.capabilities?.manage_roles && row.role !== 'head' ? <select aria-label={`Role for ${row.name}`} className="app-input" disabled={busy} value={row.role} onChange={event=>changeRole(row.user_id,event.target.value)}><option value="member">Member</option><option value="manager">Manager</option></select>:row.role}</td><td className="p-2">{row.open_tasks} / {row.overdue_tasks}</td><td className="p-2">{row.estimated_hours}</td><td className="p-2">{row.allocation_percentage}%</td><td className="p-2">{row.availability}</td></tr>)}</tbody></table></div>
    {!rows.length?<p className="py-4 text-slate-500">No members match your search.</p>:null}
  </section>;
}
