import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { addDays, format, startOfWeek } from "date-fns";
import { FiChevronLeft, FiChevronRight, FiPlus, FiRefreshCw, FiEdit2, FiTrash2, FiX } from "react-icons/fi";
import { fetchCalendarEvents, fetchDailyMomentum, getWorkLogs, createCalendarEvent, updateCalendarEvent, deleteCalendarEvent, createWorkLog, updateWorkLog, deleteWorkLog } from "../components/api";
import "./Planning.css";

const today = () => format(new Date(), "yyyy-MM-dd");
const clock = (value) => value ? format(new Date(value), "HH:mm") : "—";
const blankEntry = (kind) => ({ kind, title: "", start: "09:00", end: "10:00", description: "", event_type: "meeting" });
const errorMessage = (error) => error?.response?.data?.errors?.join(", ") || error?.response?.data?.error || "Unable to save changes. Please try again.";

export default function Planning() {
  const [params, setParams] = useSearchParams();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") || "") && !Number.isNaN(new Date(`${params.get("date")}T12:00:00`).getTime()) ? params.get("date") : today();
  const selected = new Date(`${date}T12:00:00`);
  const [events, setEvents] = useState([]);
  const [logs, setLogs] = useState([]);
  const [briefing, setBriefing] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [entry, setEntry] = useState(null);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.allSettled([
      fetchCalendarEvents({ start: new Date(`${date}T00:00:00`).toISOString(), end: addDays(new Date(`${date}T00:00:00`), 1).toISOString() }),
      getWorkLogs({ date, per_page: 100 }), fetchDailyMomentum(),
    ]).then(([schedule, work, momentum]) => {
      if (!active) return;
      setEvents(schedule.status === "fulfilled" ? schedule.value.data : []);
      setLogs(work.status === "fulfilled" ? work.value.data : []);
      setBriefing(momentum.status === "fulfilled" ? momentum.value.data.morning_briefing || {} : {});
      if ([schedule, work, momentum].some(result => result.status === "rejected")) setError("Some planning data could not load. Refresh to try again.");
      setLoading(false);
    });
    return () => { active = false; };
  }, [date, revision]);
  const chooseDate = (value) => { const next = new URLSearchParams(params); next.set("date", value); setParams(next); };
  const refresh = () => setRevision(value => value + 1);
  const rows = [
    ...events.map(event => ({ ...event, kind: "event", start: clock(event.start_at), end: clock(event.end_at), sort: new Date(event.start_at).getTime() })),
    ...logs.map(log => ({ ...log, kind: "log", start: log.start_time, end: log.end_time, sort: new Date(`${date}T${log.start_time}`).getTime() })),
  ].sort((a, b) => a.sort - b.sort);
  const minutes = logs.reduce((sum, log) => {
    const [sh, sm] = (log.start_time || "0:0").split(":").map(Number);
    const [eh, em] = (log.end_time || "0:0").split(":").map(Number);
    return sum + (log.actual_minutes ?? Math.max(0, eh * 60 + em - sh * 60 - sm));
  }, 0);
  const tasks = [...(briefing.overdue_tasks || []), ...(briefing.focus_tasks || [])].filter((task, index, list) => list.findIndex(item => item.id === task.id) === index);
  async function save(event) {
    event.preventDefault();
    setSaving(true); setError("");
    try {
      if (entry.kind === "log") {
        const payload = { title: entry.title, description: entry.description, log_date: date, start_time: entry.start, end_time: entry.end, tags: entry.tags?.map(tag => tag.name) || [] };
        if (entry.id) await updateWorkLog(entry.id, payload); else await createWorkLog(payload);
      } else {
        const payload = { title: entry.title, description: entry.description, start_at: new Date(`${entry.start_at ? format(new Date(entry.start_at), "yyyy-MM-dd") : date}T${entry.start}`).toISOString(), end_at: new Date(`${entry.end_at ? format(new Date(entry.end_at), "yyyy-MM-dd") : date}T${entry.end}`).toISOString(), event_type: entry.event_type, visibility: entry.visibility || "personal" };
        if (entry.id) await updateCalendarEvent(entry.id, payload); else await createCalendarEvent(payload);
      }
      setEntry(null); refresh();
    } catch (error) { setError(errorMessage(error)); } finally { setSaving(false); }
  }
  async function remove(row) {
    if (!window.confirm(`Delete “${row.title}”?`)) return;
    setSaving(true);
    try { await (row.kind === "log" ? deleteWorkLog(row.id) : deleteCalendarEvent(row.id)); refresh(); }
    catch (error) { setError(errorMessage(error)); } finally { setSaving(false); }
  }
  return <main className="planning-page">
    <header className="planning-toolbar">
      <div><h1>Planning</h1><p>Schedule your day and keep a record of your work.</p></div>
      <div className="planning-actions"><button onClick={refresh} disabled={loading} aria-label="Refresh planning"><FiRefreshCw /></button><button onClick={() => setEntry(blankEntry("event"))}><FiPlus /> Event</button><button className="planning-primary" onClick={() => setEntry(blankEntry("log"))}><FiPlus /> Log work</button></div>
    </header>
    <div className="planning-datebar"><div className="planning-actions"><button aria-label="Previous week" onClick={() => chooseDate(format(addDays(selected, -7), "yyyy-MM-dd"))}><FiChevronLeft /></button><strong>{format(selected, "MMMM yyyy")}</strong><button aria-label="Next week" onClick={() => chooseDate(format(addDays(selected, 7), "yyyy-MM-dd"))}><FiChevronRight /></button><button onClick={() => chooseDate(today())}>Today</button></div><label>Go to date <input type="date" value={date} onChange={event => event.target.value && chooseDate(event.target.value)} /></label></div>
    <nav className="planning-week" aria-label="Choose day">{Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(selected, { weekStartsOn: 1 }), index)).map(day => <button key={day.toISOString()} aria-pressed={format(day, "yyyy-MM-dd") === date} onClick={() => chooseDate(format(day, "yyyy-MM-dd"))}><span>{format(day, "EEE")}</span><strong>{format(day, "d")}</strong>{format(day, "yyyy-MM-dd") === today() && <small>Today</small>}</button>)}</nav>
    {error && <p role="alert" className="planning-error">{error}</p>}
    <div className="planning-content"><section aria-label="Daily agenda">
      <div className="planning-section-title"><h2>{format(selected, "EEEE, d MMMM")}</h2><span>{events.length} events · {Math.floor(minutes / 60)}h {minutes % 60}m logged</span></div>
      {loading ? <p className="planning-empty" role="status">Loading your day…</p> : rows.length === 0 ? <div className="planning-empty"><p>No events or work entries for this day.</p><button onClick={() => setEntry(blankEntry("event"))}>Add an event</button><button onClick={() => setEntry(blankEntry("log"))}>Log work</button></div> : <div className="planning-table-wrap"><table><thead><tr><th>Time</th><th>Activity</th><th>Type</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{rows.map(row => <tr key={`${row.kind}-${row.id}`} className={params.get(row.kind === "log" ? "log_id" : "event_id") === String(row.id) ? "planning-selected" : ""}><td className="planning-time">{row.all_day ? "All day" : `${row.start}–${row.end}`}</td><td><strong>{row.title}</strong>{row.description && <p>{row.description}</p>}{row.status === "cancelled" && <small>Cancelled</small>}</td><td><span className={`planning-type ${row.kind}`}>{row.kind === "log" ? "Work log" : row.event_type?.replace(/_/g, " ")}</span></td><td><div className="planning-actions">{row.managed_operation ? <Link to={row.operation_path || "/projects"} aria-label={`Open ${row.title}`}>Open record</Link> : <><button aria-label={`Edit ${row.title}`} onClick={() => setEntry({ ...row, description: row.description || "" })}><FiEdit2 /></button><button disabled={saving} aria-label={`Delete ${row.title}`} onClick={() => remove(row)}><FiTrash2 /></button></>}</div></td></tr>)}</tbody></table></div>}
    </section><aside><div className="planning-section-title"><h2>Current focus</h2><span>Today</span></div>{loading ? <p className="planning-empty">Loading tasks…</p> : tasks.length ? <ul className="planning-focus">{tasks.map(task => <li key={task.id}><Link to={task.project_id ? `/projects/${task.project_id}/dashboard?task_id=${task.id}` : `/my-work?task_id=${task.id}`}>{task.title}</Link><p>{task.project_name || "Personal"} · {task.status?.replace(/_/g, " ")}</p>{task.end_date && <small className={task.end_date.slice(0, 10) < today() ? "planning-overdue" : ""}>Due {format(new Date(task.end_date), "d MMM")}</small>}</li>)}</ul> : <p className="planning-empty">No tasks need your attention today.</p>}</aside></div>
    {entry && <div className="planning-overlay" onClick={() => !saving && setEntry(null)}><section role="dialog" aria-modal="true" aria-labelledby="planning-form-title" className="planning-dialog" onClick={event => event.stopPropagation()}><header><h2 id="planning-form-title">{entry.id ? "Edit" : "Add"} {entry.kind === "log" ? "work entry" : "event"}</h2><button disabled={saving} aria-label="Close" onClick={() => setEntry(null)}><FiX /></button></header><form onSubmit={save}><label>Title<input autoFocus required value={entry.title} onChange={event => setEntry({ ...entry, title: event.target.value })} /></label><div className="planning-form-times"><label>Start<input type="time" required value={entry.start} onChange={event => setEntry({ ...entry, start: event.target.value })} /></label><label>End<input type="time" required min={entry.start} value={entry.end} onChange={event => setEntry({ ...entry, end: event.target.value })} /></label></div>{entry.kind === "event" && <label>Type<select value={entry.event_type} onChange={event => setEntry({ ...entry, event_type: event.target.value })}>{["meeting", "deadline", "reminder", "focus", "sprint_ceremony"].map(type => <option key={type} value={type}>{type.replace(/_/g, " ")}</option>)}</select></label>}<label>Notes<textarea rows={3} value={entry.description} onChange={event => setEntry({ ...entry, description: event.target.value })} /></label>{error && <p role="alert" className="planning-error">{error}</p>}<footer><span>{format(selected, "d MMM yyyy")}</span><button type="button" disabled={saving} onClick={() => setEntry(null)}>Cancel</button><button className="planning-primary" disabled={saving}>{saving ? "Saving…" : "Save"}</button></footer></form></section></div>}
  </main>;
}
