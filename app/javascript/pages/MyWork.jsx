import React from "react";
import { Link } from "react-router-dom";
import { FiArrowUpRight, FiBell, FiCalendar, FiCheckSquare, FiClock, FiRefreshCw } from "react-icons/fi";
import { useWorkspaceData } from "../context/WorkspaceDataContext";

const summaryCards = [
  ["open_assignments", "Open assignments", FiCheckSquare],
  ["overdue_assignments", "Overdue", FiClock],
  ["upcoming_events", "Next 7 days", FiCalendar],
  ["unread_notifications", "Unread signals", FiBell],
];

const MyWork = () => {
  const { activity: data, error, loading, refreshWorkspaceData } = useWorkspaceData();

  return (
    <div className="nexus-my-work w-full">
      <header className="nexus-page-heading">
        <div>
          <span className="nexus-page-eyebrow">Workspace overview</span>
          <h1>My Work</h1>
          <p>Assignments, deadlines, meetings, and signals in one place.</p>
        </div>
        <div className="nexus-heading-actions">
          <button type="button" onClick={refreshWorkspaceData} className="nexus-secondary-action" disabled={loading}><FiRefreshCw />Refresh</button>
          <Link to="/momentum" className="nexus-primary-action">Open Momentum</Link>
        </div>
      </header>

      {error ? <div className="nexus-inline-error flex items-center justify-between gap-3"><span>{error}</span><button type="button" onClick={refreshWorkspaceData}>Try again</button></div> : null}

      <section className="nexus-my-work-stats">
        {summaryCards.map(([key, label, Icon]) => (
          <div key={key}>
            <span><Icon /></span>
            <strong>{loading && !data?.items?.length ? "—" : data.summary?.[key] ?? 0}</strong>
            <p>{label}</p>
          </div>
        ))}
      </section>

      <section className="nexus-work-list-panel">
        <div className="nexus-work-list-heading">
          <div>
            <span>Activity</span>
            <h2>Recent and upcoming work</h2>
          </div>
          <button type="button" onClick={() => window.dispatchEvent(new Event("nexus:open-search"))}>Search workspace</button>
        </div>
        <div className="nexus-work-list">
          {(data.items || []).map((item) => (
            <Link key={`${item.kind}-${item.id}`} to={item.path}>
              <span className="nexus-work-kind">{item.kind.slice(0, 2)}</span>
              <span className="nexus-work-copy">
                <strong>{item.title}</strong>
                <small>{item.subtitle || item.kind.replaceAll("_", " ")}</small>
              </span>
              <FiArrowUpRight />
            </Link>
          ))}
          {!data.items?.length && !error && !loading ? <p className="nexus-inspector-empty">No activity yet.</p> : null}
          {loading && !data.items?.length ? <p className="nexus-inspector-empty" role="status">Loading workspace activity…</p> : null}
        </div>
      </section>
    </div>
  );
};

export default MyWork;
