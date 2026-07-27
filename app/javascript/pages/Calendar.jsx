import React, { useEffect, useMemo, useState } from "react";
import {
  FiBell,
  FiCalendar,
  FiClock,
  FiEdit2,
  FiExternalLink,
  FiFilter,
  FiFlag,
  FiLayers,
  FiMapPin,
  FiRefreshCw,
  FiSave,
  FiSearch,
  FiStar,
  FiTarget,
  FiTrash2,
  FiZap,
} from "react-icons/fi";
import {
  createCalendarEvent,
  createEventReminder,
  deleteCalendarEvent,
  exportCalendarIcs,
  fetchCalendarEvents,
  fetchProjects,
  getCalendarGoogleLink,
  importCalendarIcs,
  rescheduleCalendarEvent,
  updateCalendarEvent,
} from "../components/api";

const EVENT_TYPES = [
  { value: "meeting", label: "Meeting" },
  { value: "deadline", label: "Deadline" },
  { value: "reminder", label: "Reminder" },
  { value: "focus", label: "Focus Block" },
  { value: "sprint_ceremony", label: "Sprint Ceremony" },
];

const VISIBILITY_OPTIONS = [
  { value: "personal", label: "Personal" },
  { value: "project", label: "Project" },
];

const STATUS_OPTIONS = ["scheduled", "cancelled", "completed"];

const REMINDER_OPTIONS = [
  { value: "", label: "No reminder" },
  { value: "10", label: "10 min before" },
  { value: "30", label: "30 min before" },
  { value: "1440", label: "1 day before" },
];

const RANGE_OPTIONS = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];

const RECURRENCE_OPTIONS = [
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const asRecordArray = (value) =>
  Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : [];

const normalizeEvent = (event) => ({
  ...event,
  event_reminders: asRecordArray(event.event_reminders),
});

const normalizeProject = (project) => ({
  ...project,
  users: asRecordArray(project.users),
});

const dateTime = (value) => {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
};

const compareDateValues = (a, b) => {
  const timeA = dateTime(a);
  const timeB = dateTime(b);
  if (timeA === null && timeB === null) return 0;
  if (timeA === null) return 1;
  if (timeB === null) return -1;
  return timeA - timeB;
};

const toInputDateTime = (date) => {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const toReadableDate = (isoString) => {
  const date = new Date(isoString);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};

const toReadableTime = (isoString) => {
  const date = new Date(isoString);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const sameDay = (a, b) => {
  const timeA = dateTime(a);
  const timeB = dateTime(b);
  return timeA !== null && timeB !== null && new Date(timeA).toDateString() === new Date(timeB).toDateString();
};

const EVENT_TYPE_META = {
  meeting: {
    label: "Meeting",
    accent: "#38bdf8",
    gradient: "from-sky-400/90 via-blue-500/85 to-cyan-300/90",
    glow: "rgba(56, 189, 248, 0.42)",
  },
  deadline: {
    label: "Deadline",
    accent: "#fb7185",
    gradient: "from-rose-400/95 via-red-500/90 to-orange-300/90",
    glow: "rgba(251, 113, 133, 0.56)",
  },
  reminder: {
    label: "Reminder",
    accent: "#a78bfa",
    gradient: "from-violet-400/90 via-fuchsia-500/85 to-purple-300/90",
    glow: "rgba(167, 139, 250, 0.45)",
  },
  focus: {
    label: "Focus Block",
    accent: "#34d399",
    gradient: "from-emerald-400/90 via-teal-500/85 to-lime-300/90",
    glow: "rgba(52, 211, 153, 0.45)",
  },
  sprint_ceremony: {
    label: "Sprint Ceremony",
    accent: "#fbbf24",
    gradient: "from-amber-300/95 via-orange-400/90 to-yellow-200/90",
    glow: "rgba(251, 191, 36, 0.48)",
  },
};

const eventMeta = (type) => EVENT_TYPE_META[type] || EVENT_TYPE_META.meeting;

const deadlineUrgency = (event) => {
  if (event.event_type !== "deadline") return "normal";
  const hoursUntil = (new Date(event.start_at).getTime() - Date.now()) / 36e5;
  if (hoursUntil <= 24) return "critical";
  if (hoursUntil <= 72) return "hot";
  return "watch";
};

const minutesBetween = (start, end) => {
  const startTime = dateTime(start);
  const endTime = dateTime(end);
  if (startTime === null || endTime === null) return 0;
  return Math.max(0, Math.round((endTime - startTime) / 60000));
};

const Calendar = () => {
  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0);
  const defaultEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 11, 0);

  const [events, setEvents] = useState([]);
  const [projects, setProjects] = useState([]);
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingEventId, setEditingEventId] = useState(null);
  const [draggingEventId, setDraggingEventId] = useState(null);
  const [showAdvancedCreateOptions, setShowAdvancedCreateOptions] = useState(false);

  const [filters, setFilters] = useState({
    visibility: "",
    projectId: "",
    eventType: "",
    search: "",
    range: "30",
    start: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString(),
    end: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30).toISOString(),
  });

  const [form, setForm] = useState({
    title: "",
    description: "",
    start_at: toInputDateTime(defaultStart),
    end_at: toInputDateTime(defaultEnd),
    event_type: "meeting",
    visibility: "personal",
    status: "scheduled",
    project_id: "",
    location_or_meet_link: "",
    reminder_minutes: "10",
    reminder_channel: "in_app",
    recurrence_rule: "none",
    recurrence_count: "0",
  });

  const [editForm, setEditForm] = useState({});
  const [icsInput, setIcsInput] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [eventsRes, projectsRes] = await Promise.all([
        fetchCalendarEvents({
          start: filters.start,
          end: filters.end,
          visibility: filters.visibility || undefined,
          project_id: filters.projectId || undefined,
          include_insights: true,
        }),
        fetchProjects(),
      ]);

      const eventsPayload = eventsRes?.data;
      const rawEvents = Array.isArray(eventsPayload?.data)
        ? eventsPayload.data
        : Array.isArray(eventsPayload)
          ? eventsPayload
          : [];
      setEvents(asRecordArray(rawEvents).map(normalizeEvent));
      setInsights(eventsPayload && typeof eventsPayload === "object" ? eventsPayload.insights || null : null);
      const projectsPayload = projectsRes?.data;
      const rawProjects = Array.isArray(projectsPayload?.data) ? projectsPayload.data : projectsPayload;
      setProjects(asRecordArray(rawProjects).map(normalizeProject));
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to load calendar data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.visibility, filters.projectId, filters.start, filters.end]);

  const filteredEvents = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    return events.filter((event) => {
      const matchesType = !filters.eventType || event.event_type === filters.eventType;
      const searchableText = [
        event.title,
        event.description,
        event.location_or_meet_link,
      ].map((value) => `${value || ""}`.toLowerCase());
      const matchesSearch =
        !query ||
        searchableText.some((text) => text.includes(query));
      return matchesType && matchesSearch;
    });
  }, [events, filters.eventType, filters.search]);

  const grouped = useMemo(() => {
    const byDay = {};
    filteredEvents.forEach((event) => {
      const startTime = dateTime(event.start_at);
      if (startTime === null) return;
      const key = new Date(startTime).toLocaleDateString();
      if (!byDay[key]) byDay[key] = [];
      byDay[key].push(event);
    });

    return Object.entries(byDay)
      .sort((a, b) => compareDateValues(a[1]?.[0]?.start_at, b[1]?.[0]?.start_at))
      .map(([date, dayEvents]) => ({
        date,
        events: [...dayEvents].sort((a, b) => compareDateValues(a.start_at, b.start_at)),
      }));
  }, [filteredEvents]);

  const dragDays = useMemo(() => {
    const days = [];
    const start = new Date();
    for (let i = 0; i < 7; i += 1) {
      const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      days.push(day);
    }
    return days;
  }, []);

  const metrics = useMemo(() => {
    const todayDate = new Date().toDateString();
    return {
      total: filteredEvents.length,
      today: filteredEvents.filter((event) => {
        const startTime = dateTime(event.start_at);
        return startTime !== null && new Date(startTime).toDateString() === todayDate;
      }).length,
      withReminders: filteredEvents.filter((event) => Array.isArray(event.event_reminders) && event.event_reminders.length > 0).length,
      meetings: filteredEvents.filter((event) => event.event_type === "meeting").length,
    };
  }, [filteredEvents]);

  const upcomingEvents = useMemo(() => {
    const current = new Date();
    return filteredEvents
      .filter((event) => {
        const startTime = dateTime(event.start_at);
        return startTime !== null && startTime >= current.getTime();
      })
      .sort((a, b) => compareDateValues(a.start_at, b.start_at));
  }, [filteredEvents]);

  const nextEvent = upcomingEvents[0];

  const timelineEvents = useMemo(() => upcomingEvents.slice(0, 8), [upcomingEvents]);

  const todayEvents = useMemo(() => {
    const todayDate = new Date();
    return filteredEvents
      .filter((event) => sameDay(event.start_at, todayDate))
      .sort((a, b) => compareDateValues(a.start_at, b.start_at));
  }, [filteredEvents]);

  const orbitingReminders = useMemo(() => {
    const reminders = todayEvents.filter((event) => event.event_type === "reminder" || event.event_reminders?.length);
    return (reminders.length ? reminders : upcomingEvents).slice(0, 4);
  }, [todayEvents, upcomingEvents]);

  const focusMinutesToday = useMemo(() => (
    todayEvents
      .filter((event) => event.event_type === "focus")
      .reduce((total, event) => total + minutesBetween(event.start_at, event.end_at), 0)
  ), [todayEvents]);

  const urgentDeadlines = useMemo(() => (
    upcomingEvents
      .filter((event) => event.event_type === "deadline")
      .slice(0, 3)
  ), [upcomingEvents]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    if (new Date(form.end_at) <= new Date(form.start_at)) {
      setSaving(false);
      setError("End time must be after start time.");
      return;
    }

    try {
      const payload = {
        title: form.title,
        description: form.description || undefined,
        start_at: new Date(form.start_at).toISOString(),
        end_at: new Date(form.end_at).toISOString(),
        event_type: form.event_type,
        visibility: form.visibility,
        status: form.status,
        project_id: form.visibility === "project" ? Number(form.project_id) : undefined,
        location_or_meet_link: form.location_or_meet_link || undefined,
        recurrence_rule: form.recurrence_rule,
        recurrence_count: Number(form.recurrence_count || 0),
      };

      const { data } = await createCalendarEvent(payload);
      const created = Array.isArray(data?.events) ? data.events : [];

      if (form.reminder_minutes && created[0]?.id) {
        await createEventReminder(created[0].id, {
          channel: form.reminder_channel,
          minutes_before: Number(form.reminder_minutes),
        });
      }

      setForm((prev) => ({
        ...prev,
        title: "",
        description: "",
        location_or_meet_link: "",
      }));
      await load();
    } catch (err) {
      const apiErrors = err?.response?.data?.errors;
      setError(Array.isArray(apiErrors) ? apiErrors.join(", ") : "Failed to create calendar event.");
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (event) => {
    setEditingEventId(event.id);
    setEditForm({
      title: event.title,
      description: event.description || "",
      start_at: toInputDateTime(new Date(event.start_at)),
      end_at: toInputDateTime(new Date(event.end_at)),
      status: event.status,
      event_type: event.event_type,
      location_or_meet_link: event.location_or_meet_link || "",
    });
  };

  const saveEdit = async (eventId) => {
    try {
      await updateCalendarEvent(eventId, {
        title: editForm.title,
        description: editForm.description,
        start_at: new Date(editForm.start_at).toISOString(),
        end_at: new Date(editForm.end_at).toISOString(),
        status: editForm.status,
        event_type: editForm.event_type,
        location_or_meet_link: editForm.location_or_meet_link,
      });
      setEditingEventId(null);
      await load();
    } catch {
      setError("Failed to update event.");
    }
  };

  const removeEvent = async (eventId) => {
    if (!window.confirm("Delete this event?")) return;
    try {
      await deleteCalendarEvent(eventId);
      await load();
    } catch {
      setError("Failed to delete event.");
    }
  };

  const applyRange = (days) => {
    const rangeDays = Number(days);
    const start = new Date();
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + rangeDays);

    setFilters((prev) => ({
      ...prev,
      range: String(days),
      start: start.toISOString(),
      end: end.toISOString(),
    }));
  };

  const handleDropOnDay = async (targetDay) => {
    if (!draggingEventId) return;
    const event = events.find((item) => item.id === draggingEventId);
    if (!event) return;

    const oldStart = new Date(event.start_at);
    const oldEnd = new Date(event.end_at);
    const durationMs = oldEnd.getTime() - oldStart.getTime();
    if (!Number.isFinite(durationMs)) {
      setDraggingEventId(null);
      setError("Cannot reschedule an event with invalid dates.");
      return;
    }

    const newStart = new Date(targetDay);
    newStart.setHours(oldStart.getHours(), oldStart.getMinutes(), 0, 0);
    const newEnd = new Date(newStart.getTime() + durationMs);

    try {
      await rescheduleCalendarEvent(event.id, {
        start_at: newStart.toISOString(),
        end_at: newEnd.toISOString(),
      });
      await load();
    } catch {
      setError("Failed to reschedule event.");
    } finally {
      setDraggingEventId(null);
    }
  };

  const downloadIcs = async () => {
    const { data } = await exportCalendarIcs();
    const blob = new Blob([data], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "calendar-export.ics";
    a.click();
    URL.revokeObjectURL(url);
  };

  const uploadIcs = async () => {
    if (!icsInput.trim()) return;
    try {
      await importCalendarIcs(icsInput);
      setIcsInput("");
      await load();
    } catch {
      setError("Failed to import ICS data.");
    }
  };

  const openGoogle = async (eventId) => {
    const { data } = await getCalendarGoogleLink(eventId);
    if (data?.google_url) window.open(data.google_url, "_blank", "noopener,noreferrer");
  };

  const statCards = [
    { label: "Events in view", value: metrics.total, icon: FiCalendar },
    { label: "Today", value: metrics.today, icon: FiFlag },
    { label: "Meetings", value: metrics.meetings, icon: FiLayers },
    { label: "With reminders", value: metrics.withReminders, icon: FiBell },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 px-4 py-5 sm:space-y-6 sm:px-6 sm:py-8">

      <style>{`
        @keyframes calendar-orbit-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes calendar-deadline-glow {
          0%, 100% { filter: brightness(1); box-shadow: 0 0 24px rgba(251, 113, 133, 0.24); }
          50% { filter: brightness(1.18); box-shadow: 0 0 42px rgba(251, 113, 133, 0.48); }
        }
        .calendar-orbit { animation: calendar-orbit-spin 18s linear infinite; }
        .calendar-orbit > svg { animation: calendar-orbit-spin 18s linear infinite reverse; }
        .calendar-depth-card { transform-style: preserve-3d; }
        .calendar-depth-card::after {
          content: "";
          position: absolute;
          inset: auto 12% -18px;
          height: 24px;
          border-radius: 999px;
          background: rgba(15, 23, 42, 0.35);
          filter: blur(12px);
          transform: translateZ(-35px);
        }
        .calendar-depth-card:hover { transform: translateY(-18px) rotateX(8deg) rotateY(-8deg) scale(1.04); }
        .calendar-drag-lift { transform: translateY(-32px) rotateX(12deg) rotateY(-10deg) scale(1.08) !important; opacity: 0.88; }
        .calendar-deadline-pulse { animation: calendar-deadline-glow 2.5s ease-in-out infinite; }
        .calendar-rail::-webkit-scrollbar { height: 10px; }
        .calendar-rail::-webkit-scrollbar-thumb { background: rgba(125, 211, 252, 0.35); border-radius: 999px; }
      `}</style>
      <section className="relative overflow-hidden rounded-[1.5rem] border border-white/20 bg-slate-950 p-5 text-white shadow-2xl shadow-blue-950/30 sm:rounded-[2.4rem] sm:p-8 lg:p-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(59,130,246,0.38),transparent_32%),radial-gradient(circle_at_80%_8%,rgba(168,85,247,0.34),transparent_30%),linear-gradient(135deg,rgba(15,23,42,0.95),rgba(30,41,59,0.9))]" />
        <div className="pointer-events-none absolute -right-20 top-8 h-72 w-72 rounded-full border border-cyan-300/20 bg-cyan-300/10 blur-sm" />
        <div className="relative grid gap-6 xl:grid-cols-[1.05fr_1.4fr]">
          <div className="flex flex-col justify-between gap-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-200">Temporal command center</p>
                <h1 className="mt-2 text-[clamp(2rem,8vw,3rem)] font-black tracking-tight sm:text-5xl">Calendar workspace</h1>
                <p className="mt-3 max-w-2xl text-base leading-7 text-slate-300">A dimensional planning surface for meetings, deadlines, reminders, focus blocks, and sprint ceremonies.</p>
              </div>
              <button type="button" onClick={load} disabled={loading} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-cyan-950/30 backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/15 disabled:opacity-60 sm:w-auto">
                <FiRefreshCw className={loading ? "animate-spin" : ""} />
                Refresh
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {statCards.map((card) => (
                <div key={card.label} className="group rounded-3xl border border-white/10 bg-white/[0.08] p-4 shadow-xl shadow-black/10 backdrop-blur transition duration-300 hover:-translate-y-1 hover:bg-white/[0.12]">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{card.label}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-3xl font-black">{card.value}</p>
                    <span className="rounded-2xl bg-cyan-300/15 p-3 text-cyan-200 transition group-hover:rotate-6 group-hover:scale-110"><card.icon /></span>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-3xl border border-white/10 bg-white/[0.08] p-4 backdrop-blur">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-cyan-200">Today focus</p>
                    <p className="mt-1 text-2xl font-black">{todayEvents.length} event{todayEvents.length === 1 ? "" : "s"}</p>
                  </div>
                  <div className="calendar-orbit relative h-20 w-20 rounded-full border border-cyan-200/20 bg-cyan-200/10">
                    {orbitingReminders.map((event, index) => (
                      <span key={event.id} className="absolute left-1/2 top-1/2 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: eventMeta(event.event_type).accent, transform: `rotate(${index * 90}deg) translateX(34px)` }} />
                    ))}
                    <FiTarget className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-cyan-100" />
                  </div>
                </div>
                <p className="mt-3 text-sm text-slate-300">{focusMinutesToday ? `${Math.round(focusMinutesToday / 60 * 10) / 10} hours reserved for deep work today.` : "No focus block today — create one to protect maker time."}</p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.08] p-4 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.25em] text-rose-200">Deadline heat</p>
                <div className="mt-3 space-y-2">
                  {urgentDeadlines.length ? urgentDeadlines.map((event) => (
                    <div key={event.id} className={`rounded-2xl border px-3 py-2 text-sm ${deadlineUrgency(event) === "critical" ? "border-rose-300/50 bg-rose-400/20 shadow-[0_0_28px_rgba(251,113,133,0.35)]" : "border-amber-300/30 bg-amber-300/10"}`}>
                      <div className="flex items-center justify-between gap-3"><span className="font-semibold">{event.title}</span><span className="text-xs text-slate-300">{toReadableDate(event.start_at)}</span></div>
                    </div>
                  )) : <p className="text-sm text-slate-300">No upcoming deadlines in this view.</p>}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.07] p-4 shadow-2xl shadow-black/20 backdrop-blur-xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-cyan-200">3D timeline rail</p>
                <h2 className="mt-1 text-xl font-bold">Upcoming time wheel</h2>
              </div>
              {nextEvent ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs text-slate-200"><FiZap className="text-yellow-200" />Next: {toReadableTime(nextEvent.start_at)}</span>
              ) : null}
            </div>

            <div className="calendar-rail mt-6 overflow-x-auto pb-4">
              <div className="relative flex min-h-[310px] min-w-[760px] items-center gap-5 px-3" style={{ perspective: "1200px" }}>
                <div className="absolute left-4 right-4 top-1/2 h-2 -translate-y-1/2 rounded-full bg-gradient-to-r from-cyan-300/15 via-white/35 to-fuchsia-300/15 shadow-[0_0_34px_rgba(125,211,252,0.25)]" />
                <div className="absolute left-1/2 top-6 bottom-6 w-px bg-cyan-200/30" />
                <span className="absolute left-1/2 top-0 -translate-x-1/2 rounded-full border border-cyan-200/30 bg-cyan-200/15 px-3 py-1 text-xs font-bold text-cyan-100">Today</span>
                {timelineEvents.length ? timelineEvents.map((event, index) => {
                  const meta = eventMeta(event.event_type);
                  const urgency = deadlineUrgency(event);
                  const lift = index % 2 === 0 ? "-translate-y-12 rotate-[-2deg]" : "translate-y-12 rotate-[2deg]";
                  return (
                    <article
                      key={event.id}
                      draggable
                      onDragStart={() => setDraggingEventId(event.id)}
                      onDragEnd={() => setDraggingEventId(null)}
                      className={`calendar-depth-card relative z-10 w-48 shrink-0 rounded-[1.5rem] border border-white/15 bg-gradient-to-br ${meta.gradient} p-4 text-white shadow-2xl transition duration-300 ${lift} ${draggingEventId === event.id ? "calendar-drag-lift" : "hover:-translate-y-4"} ${urgency === "critical" ? "calendar-deadline-pulse" : ""}`}
                      style={{ boxShadow: `0 24px 60px ${meta.glow}` }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide">{meta.label}</span>
                        <FiClock className="mt-1 opacity-80" />
                      </div>
                      <h3 className="mt-5 line-clamp-2 text-lg font-black leading-tight">{event.title}</h3>
                      <p className="mt-3 text-xs font-medium text-white/85">{toReadableDate(event.start_at)} · {toReadableTime(event.start_at)}</p>
                      <div className="mt-4 h-1.5 rounded-full bg-white/25"><div className="h-full rounded-full bg-white/80" style={{ width: `${Math.min(100, 35 + index * 8)}%` }} /></div>
                    </article>
                  );
                }) : (
                  <div className="relative z-10 mx-auto rounded-3xl border border-dashed border-white/20 bg-white/10 p-8 text-center text-sm text-slate-300">No upcoming events on the rail yet.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Create event</h2>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Start with the essentials, then open advanced options only when needed.</p>
            </div>
          </div>

          <form className="mt-4 space-y-3" onSubmit={handleCreate}>
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Event title" required className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm" />

            <div className="grid grid-cols-2 gap-2">
              <input type="datetime-local" value={form.start_at} onChange={(e) => setForm((f) => ({ ...f, start_at: e.target.value }))} className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm" />
              <input type="datetime-local" value={form.end_at} onChange={(e) => setForm((f) => ({ ...f, end_at: e.target.value }))} className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm" />
            </div>

            <select value={form.event_type} onChange={(e) => setForm((f) => ({ ...f, event_type: e.target.value }))} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm">
              {EVENT_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>

            <button
              type="button"
              onClick={() => setShowAdvancedCreateOptions((show) => !show)}
              className="flex w-full items-center justify-between rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2 text-left text-sm font-medium text-zinc-700 transition hover:border-blue-400 hover:bg-blue-50 dark:border-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-200 dark:hover:border-blue-500 dark:hover:bg-blue-950/30"
              aria-expanded={showAdvancedCreateOptions}
              aria-controls="calendar-create-advanced-options"
            >
              <span>Advanced options</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">{showAdvancedCreateOptions ? "Hide" : "Show"}</span>
            </button>

            {showAdvancedCreateOptions ? (
              <div id="calendar-create-advanced-options" className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-700 dark:bg-zinc-800/40">
                <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Description" rows={2} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm" />

                <div className="grid grid-cols-2 gap-2">
                  <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm">
                    {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                  <select value={form.visibility} onChange={(e) => setForm((f) => ({ ...f, visibility: e.target.value }))} className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm">
                    {VISIBILITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>

                {form.visibility === "project" && (
                  <select value={form.project_id} onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value }))} required className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm">
                    <option value="">Select project</option>
                    {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <select value={form.recurrence_rule} onChange={(e) => setForm((f) => ({ ...f, recurrence_rule: e.target.value }))} className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm">
                    {RECURRENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  {form.recurrence_rule !== "none" ? (
                    <input type="number" min="1" max="30" value={form.recurrence_count} onChange={(e) => setForm((f) => ({ ...f, recurrence_count: e.target.value }))} placeholder="Repeat count" className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm" />
                  ) : null}
                </div>

                <input value={form.location_or_meet_link} onChange={(e) => setForm((f) => ({ ...f, location_or_meet_link: e.target.value }))} placeholder="Meet link / location" className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm" />

                <div className="grid grid-cols-2 gap-2">
                  <select value={form.reminder_minutes} onChange={(e) => setForm((f) => ({ ...f, reminder_minutes: e.target.value }))} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm">
                    {REMINDER_OPTIONS.map((o) => <option key={o.value || "none"} value={o.value}>{o.label}</option>)}
                  </select>
                  <select value={form.reminder_channel} onChange={(e) => setForm((f) => ({ ...f, reminder_channel: e.target.value }))} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm">
                    <option value="in_app">In app</option>
                    <option value="email">Email</option>
                    <option value="slack">Slack</option>
                  </select>
                </div>
              </div>
            ) : null}

            <button type="submit" disabled={saving} className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 text-white py-2.5 text-sm font-semibold disabled:opacity-60">{saving ? "Saving..." : "Create event"}</button>
          </form>

          <div className="mt-6 pt-4 border-t border-zinc-200 dark:border-zinc-700 space-y-2">
            <button type="button" onClick={downloadIcs} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 py-2 text-sm">Export ICS</button>
            <textarea value={icsInput} onChange={(e) => setIcsInput(e.target.value)} placeholder="Paste ICS content to import" rows={3} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm" />
            <button type="button" onClick={uploadIcs} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 py-2 text-sm">Import ICS</button>
          </div>
        </section>

        <section className="lg:col-span-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-2 justify-between">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Agenda</h2>
            <div className="flex items-center gap-2 text-xs text-zinc-500"><FiStar />CRUD + Drag + Conflict-ready</div>
          </div>

          <div className="mt-4 space-y-3 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50/70 dark:bg-zinc-800/30">
            <div className="flex items-center gap-2"><FiSearch className="text-zinc-400" /><input value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} placeholder="Search title, notes, or location" className="w-full bg-transparent outline-none text-sm" /></div>
            <div className="flex flex-wrap gap-2">
              {RANGE_OPTIONS.map((option) => (
                <button key={option.value} type="button" onClick={() => applyRange(option.value)} className={`rounded-full px-3 py-1.5 text-xs font-medium border ${filters.range === option.value ? "border-blue-500 bg-blue-500 text-white" : "border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200"}`}>{option.label}</button>
              ))}
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <select value={filters.visibility} onChange={(e) => setFilters((f) => ({ ...f, visibility: e.target.value }))} className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm"><option value="">All visibility</option><option value="personal">Personal</option><option value="project">Project</option></select>
              <select value={filters.projectId} onChange={(e) => setFilters((f) => ({ ...f, projectId: e.target.value }))} className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm"><option value="">All projects</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
              <select value={filters.eventType} onChange={(e) => setFilters((f) => ({ ...f, eventType: e.target.value }))} className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm"><option value="">All event types</option>{EVENT_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
              <button type="button" onClick={() => setFilters((f) => ({ ...f, visibility: "", projectId: "", eventType: "", search: "" }))} className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-200"><FiFilter />Clear</button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {dragDays.map((day) => (
              <div key={day.toDateString()} onDragOver={(e) => e.preventDefault()} onDrop={() => handleDropOnDay(day)} className={`min-h-20 rounded-xl border border-dashed p-2 text-xs transition duration-300 ${draggingEventId ? "border-cyan-400 bg-cyan-50 shadow-lg shadow-cyan-500/10 dark:bg-cyan-950/20" : "border-zinc-300 dark:border-zinc-700"}`}>
                <p className="font-semibold">{day.toLocaleDateString([], { weekday: "short" })}</p>
                <p>{day.toLocaleDateString([], { month: "short", day: "numeric" })}</p>
                <p className="mt-1 text-zinc-500">Drop here</p>
              </div>
            ))}
          </div>

          {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

          {loading ? (
            <div className="mt-4 space-y-3">
              {[0, 1, 2].map((item) => (
                <div key={item} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-800/60">
                  <div className="h-3 w-32 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-700" />
                  <div className="mt-4 h-5 w-2/3 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-700" />
                  <div className="mt-3 h-3 w-1/2 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-700/60" />
                </div>
              ))}
            </div>
          ) : grouped.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-8 text-center"><FiCalendar className="mx-auto text-zinc-400" size={20} /><p className="mt-2 text-sm text-zinc-500">No events in this view.</p></div>
          ) : (
            <div className="mt-4 space-y-5">
              {grouped.map((group) => (
                <div key={group.date}>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{group.date}</h3>
                  <div className="mt-2 space-y-2">
                    {group.events.map((event) => {
                      const isEditing = editingEventId === event.id;
                      const meta = eventMeta(event.event_type);
                      const urgency = deadlineUrgency(event);
                      return (
                        <article
                          key={event.id}
                          draggable
                          onDragStart={() => setDraggingEventId(event.id)}
                          onDragEnd={() => setDraggingEventId(null)}
                          className={`calendar-depth-card relative rounded-2xl border p-4 transition duration-300 hover:-translate-y-1 hover:rotate-[0.4deg] dark:border-zinc-700 ${draggingEventId === event.id ? "calendar-drag-lift border-cyan-300 bg-cyan-50/80 dark:bg-cyan-950/30" : "border-zinc-200 bg-zinc-50/80 dark:bg-zinc-800/60"} ${urgency === "critical" ? "calendar-deadline-pulse shadow-[0_0_30px_rgba(251,113,133,0.35)]" : urgency === "hot" ? "shadow-[0_0_22px_rgba(251,191,36,0.22)]" : ""}`}
                          style={{ borderLeft: `4px solid ${meta.accent}` }}
                        >
                          {isEditing ? (
                            <div className="space-y-2">
                              <input value={editForm.title || ""} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))} className="w-full rounded border px-2 py-1 text-sm" />
                              <textarea value={editForm.description || ""} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} className="w-full rounded border px-2 py-1 text-sm" rows={2} />
                              <div className="grid grid-cols-2 gap-2">
                                <input type="datetime-local" value={editForm.start_at || ""} onChange={(e) => setEditForm((f) => ({ ...f, start_at: e.target.value }))} className="rounded border px-2 py-1 text-sm" />
                                <input type="datetime-local" value={editForm.end_at || ""} onChange={(e) => setEditForm((f) => ({ ...f, end_at: e.target.value }))} className="rounded border px-2 py-1 text-sm" />
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <select value={editForm.status || "scheduled"} onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))} className="rounded border px-2 py-1 text-sm">{STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}</select>
                                <select value={editForm.event_type || "meeting"} onChange={(e) => setEditForm((f) => ({ ...f, event_type: e.target.value }))} className="rounded border px-2 py-1 text-sm">{EVENT_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
                              </div>
                              <div className="flex gap-2">
                                <button type="button" onClick={() => saveEdit(event.id)} className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-xs text-white"><FiSave />Save</button>
                                <button type="button" onClick={() => setEditingEventId(null)} className="rounded border px-3 py-1.5 text-xs">Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex flex-wrap justify-between gap-3">
                                <div>
                                  <p className="font-semibold text-zinc-900 dark:text-zinc-100">{event.title}</p>
                                  <p className="text-xs text-zinc-500 mt-1 flex flex-wrap items-center gap-3">
                                    <span className="inline-flex items-center gap-1"><FiClock />{toReadableTime(event.start_at)} - {toReadableTime(event.end_at)}</span>
                                    <span className="inline-flex items-center gap-1"><FiLayers />{event.visibility}</span>
                                    {event.location_or_meet_link ? <span className="inline-flex items-center gap-1"><FiMapPin />Location set</span> : null}
                                  </p>
                                </div>
                                <div className="flex items-start gap-2">
                                  <span className="text-xs rounded-full px-2 py-1 text-white h-fit" style={{ backgroundColor: meta.accent }}>{event.event_type.replace("_", " ")}</span>
                                  <span className="text-xs rounded-full px-2 py-1 bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-100 h-fit">{event.status}</span>
                                </div>
                              </div>

                              {event.description ? <p className="text-sm mt-2 text-zinc-700 dark:text-zinc-300">{event.description}</p> : null}
                              {event.location_or_meet_link ? <a href={event.location_or_meet_link} target="_blank" rel="noreferrer" className="text-xs text-blue-600 mt-2 inline-block underline break-all">{event.location_or_meet_link}</a> : null}
                              {event.event_reminders?.length ? <p className="text-xs text-zinc-500 mt-2">Reminders: {event.event_reminders.map((r) => `${r.minutes_before}m (${r.channel})`).join(", ")}</p> : null}
                              {event.conflicts_count > 0 ? <p className="text-xs text-amber-600 mt-1">⚠️ {event.conflicts_count} potential overlap(s)</p> : null}

                              <div className="mt-3 flex flex-wrap gap-2">
                                <button type="button" onClick={() => openEdit(event)} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs"><FiEdit2 />Edit</button>
                                <button type="button" onClick={() => removeEvent(event.id)} className="inline-flex items-center gap-1 rounded border border-red-300 text-red-600 px-2 py-1 text-xs"><FiTrash2 />Delete</button>
                                <button type="button" onClick={() => openGoogle(event.id)} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs"><FiExternalLink />Google</button>
                                {dragDays.some((day) => sameDay(day, event.start_at)) ? <span className="text-xs text-zinc-500 self-center">Drag to reschedule</span> : null}
                              </div>
                            </>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default Calendar;
