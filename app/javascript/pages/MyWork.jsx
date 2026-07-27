import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiArrowUpRight, FiBell, FiCalendar, FiCheckSquare, FiClock } from "react-icons/fi";
import { fetchActivity } from "../components/api";

const summaryCards = [
  ["open_assignments", "Open assignments", FiCheckSquare],
  ["overdue_assignments", "Overdue", FiClock],
  ["upcoming_events", "Next 7 days", FiCalendar],
  ["unread_notifications", "Unread signals", FiBell],
];

const MyWork = () => {
  const [data, setData] = useState({ summary: {}, items: [] });
  const [error, setError] = useState("");

  useEffect(() => {
    fetchActivity()
      .then(({ data: payload }) => setData(payload))
      .catch(() => setError("Your work overview could not be loaded."));
  }, []);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-8">
      <section className="rounded-[24px] bg-slate-950 p-5 text-white sm:rounded-[34px] sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-300">My Work</p>
        <h1 className="mt-3 text-[clamp(2rem,8vw,3rem)] font-semibold tracking-[-0.05em] sm:text-5xl">Assignments, deadlines, meetings, and signals in one place.</h1>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link to="/momentum" className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-white px-4 py-2.5 font-semibold text-slate-950 sm:w-auto">Open Momentum</Link>
          <Link to="/calendar" className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-white/15 px-4 py-2.5 font-semibold sm:w-auto">Calendar</Link>
          <Link to="/worklog" className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-white/15 px-4 py-2.5 font-semibold sm:w-auto">Work Log</Link>
        </div>
      </section>

      {error ? <p className="mt-6 rounded-2xl bg-rose-50 p-4 text-rose-700">{error}</p> : null}

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map(([key, label, Icon]) => (
          <div key={key} className="rounded-[26px] border border-slate-200 bg-white p-6 shadow-sm">
            <Icon className="text-xl text-blue-700" />
            <p className="mt-5 text-3xl font-semibold text-slate-950">{data.summary?.[key] ?? 0}</p>
            <p className="mt-1 text-sm font-medium text-slate-500">{label}</p>
          </div>
        ))}
      </section>

      <section className="mt-6 rounded-[24px] border border-slate-200 bg-white p-5 sm:rounded-[30px] sm:p-7">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-blue-700">Activity</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">Recent and upcoming work</h2>
          </div>
          <button onClick={() => window.dispatchEvent(new Event("nexus:open-search"))} className="inline-flex min-h-11 items-center text-sm font-semibold text-blue-700">Search workspace</button>
        </div>
        <div className="mt-6 divide-y divide-slate-100">
          {(data.items || []).map((item) => (
            <Link key={`${item.kind}-${item.id}`} to={item.path} className="group flex items-center gap-4 py-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-xs font-bold uppercase text-slate-600">{item.kind.slice(0, 2)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-slate-900">{item.title}</span>
                <span className="mt-1 block truncate text-sm text-slate-500">{item.subtitle || item.kind.replaceAll("_", " ")}</span>
              </span>
              <FiArrowUpRight className="text-slate-400 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-blue-700" />
            </Link>
          ))}
          {!data.items?.length && !error ? <p className="py-10 text-center text-slate-500">No activity yet.</p> : null}
        </div>
      </section>
    </div>
  );
};

export default MyWork;
