import React, { useContext, useEffect, useMemo, useState } from "react";
import {
  FiAlertTriangle,
  FiCalendar,
  FiClock,
  FiRefreshCcw,
  FiCheckCircle,
  FiTag,
  FiBookOpen,
  FiChevronRight,
  FiTarget,
  FiZap,
  FiPlay,
  FiArrowRightCircle
} from "react-icons/fi";
import { motion } from "framer-motion";
import api, { fetchDailyMomentum } from "../components/api";
import { AuthContext } from "../context/AuthContext";
import nexusProductPoster from "../images/nexus/nexus-product-poster.webp";

const statusColors = {
  blocked: "bg-rose-100 text-rose-700 border border-rose-200",
  in_progress: "bg-amber-100 text-amber-700 border border-amber-200",
  doing: "bg-amber-100 text-amber-700 border border-amber-200",
  todo: "bg-slate-100 text-slate-700 border border-slate-200",
  reviewing: "bg-sky-100 text-sky-700 border border-sky-200",
  qa: "bg-sky-100 text-sky-700 border border-sky-200",
  backlog: "bg-slate-100 text-slate-700 border border-slate-200",
  done: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  completed: "bg-emerald-100 text-emerald-700 border border-emerald-200"
};

const relativeDueText = (value) => {
  if (!value) return "No due date";
  const today = new Date();
  const due = new Date(value);
  if (Number.isNaN(due.getTime())) return "No due date";

  const diffDays = Math.floor((due.setHours(0, 0, 0, 0) - today.setHours(0, 0, 0, 0)) / 86_400_000);

  if (diffDays === 0) return "Due today";
  if (diffDays === 1) return "Due tomorrow";
  if (diffDays === -1) return "Overdue by 1 day";
  if (diffDays < -1) return `Overdue by ${Math.abs(diffDays)} days`;
  return `Due in ${diffDays} days`;
};

const formatTime = (value) => {
  if (!value) return "--";
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return "--";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(time);
};

const SectionCard = ({ icon: Icon, title, description, action, children }) => (
  <motion.section
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
    className="shell-panel shell-panel-strong overflow-hidden rounded-[32px]"
  >
    <div className="border-b border-white/60 bg-[linear-gradient(135deg,rgba(255,255,255,0.86),rgba(236,244,255,0.72))] px-6 py-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          {Icon ? (
            <span className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-white/70 bg-white/82 text-[var(--theme-color)] shadow-[0_16px_34px_rgb(15_23_42_/_0.08)]">
              <Icon className="h-5 w-5" />
            </span>
          ) : null}
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-slate-400">Focus lane</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-slate-950">{title}</h2>
            {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{description}</p> : null}
          </div>
        </div>
        {action}
      </div>
    </div>
    <div className="space-y-4 px-6 py-5">{children}</div>
  </motion.section>
);

const TaskBadge = ({ status }) => {
  if (!status) return null;
  const key = status.toLowerCase();
  const color = statusColors[key] || statusColors.todo;
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${color}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
};

const TaskList = ({ icon: Icon, title, subtitle, tasks = [], emptyMessage, highlight }) => (
  <div className="rounded-[26px] border border-white/70 bg-white/72 p-4 shadow-[0_18px_38px_rgb(15_23_42_/_0.06)]">
    <div className="flex items-center gap-3">
      {Icon && (
        <span className="flex h-10 w-10 items-center justify-center rounded-[16px] border border-white/70 bg-slate-950 text-white shadow-[0_14px_28px_rgb(15_23_42_/_0.12)]">
          <Icon className="h-4 w-4" />
        </span>
      )}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-700">{title}</h3>
        {subtitle ? <p className="text-sm text-slate-500">{subtitle}</p> : null}
      </div>
    </div>

    <div className="mt-4 space-y-3">
      {tasks.length === 0 && (
        <p className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-sm text-slate-500">
          {emptyMessage}
        </p>
      )}
      {tasks.map((task) => (
        <div
          key={task.id || task.title}
          className="group relative overflow-hidden rounded-[22px] border border-white/70 bg-white/92 px-4 py-3 shadow-[0_14px_28px_rgb(15_23_42_/_0.06)]"
        >
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-200 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-950">{task.title || "Untitled task"}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                {task.project_name && (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-[0.7rem] text-slate-700">
                    {task.project_name}
                  </span>
                )}
                {task.sprint_name && (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-[0.7rem] text-slate-700">
                    Sprint: {task.sprint_name}
                  </span>
                )}
                {task.end_date && (
                  <span className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-[0.7rem] text-slate-700">
                    <FiCalendar className="h-3 w-3" />
                    {relativeDueText(task.end_date)}
                  </span>
                )}
              </div>
            </div>
            <TaskBadge status={task.status} />
          </div>
          {highlight && (
            <div className="mt-3 rounded-[16px] bg-amber-100 px-3 py-2 text-xs text-amber-700">
              {highlight}
            </div>
          )}
        </div>
      ))}
    </div>
  </div>
);

const QuickMetric = ({ label, value, caption, icon: Icon }) => (
  <div className="rounded-[24px] border border-white/70 bg-white/78 p-4 shadow-[0_18px_38px_rgb(15_23_42_/_0.06)]">
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{label}</span>
      {Icon ? <Icon className="h-4 w-4 text-[var(--theme-color)]" /> : null}
    </div>
    <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">{value}</p>
    {caption ? <p className="mt-2 text-xs leading-5 text-slate-500">{caption}</p> : null}
  </div>
);

const SpotlightStat = ({ label, value, caption }) => (
  <div className="rounded-[24px] border border-white/12 bg-white/[0.08] p-4 shadow-inner shadow-white/5 backdrop-blur-md">
    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-slate-300">{label}</p>
    <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">{value}</p>
    <p className="mt-2 text-sm text-slate-300">{caption}</p>
  </div>
);

const DailyMomentumHub = () => {
  const { user } = useContext(AuthContext);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadMomentum = async (opts = { refreshing: false }) => {
    try {
      if (opts.refreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      const response = await fetchDailyMomentum();
      setData(response.data);
      setError(null);
    } catch (err) {
      setError("We couldn't refresh your momentum data. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadMomentum();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const headerDate = useMemo(() => {
    if (!data?.date) return new Intl.DateTimeFormat("en-US", { dateStyle: "full" }).format(new Date());
    const parsed = new Date(data.date);
    if (Number.isNaN(parsed.getTime())) return new Intl.DateTimeFormat("en-US", { dateStyle: "full" }).format(new Date());
    return new Intl.DateTimeFormat("en-US", { dateStyle: "full" }).format(parsed);
  }, [data?.date]);

  const reflection = data?.reflection;
  const totalMinutes = reflection?.yesterday?.total_minutes || 0;
  const hours = Math.floor(totalMinutes / 60);
  const minutesRemainder = totalMinutes % 60;
  const focusCount = data?.morning_briefing?.focus_tasks?.length || 0;
  const blockerCount = reflection?.blockers?.length || 0;
  const dueReviewCount = data?.learning_nudge?.total_due || 0;
  const meetingCount = data?.morning_briefing?.meetings?.length || 0;

  const handleMarkReviewed = async (bookmarkId) => {
    if (!bookmarkId) return;
    try {
      await api.post(`/knowledge_bookmarks/${bookmarkId}/mark_reviewed`);
      await loadMomentum({ refreshing: true });
    } catch (err) {
      setError("Unable to mark this card as reviewed. Please retry.");
    }
  };

  return (
    <div className="min-h-screen pb-16 text-slate-900">
      <div className="mx-auto max-w-[98%] px-4 pt-6 sm:px-6 lg:px-8">
        <header className="relative overflow-hidden rounded-[36px] border border-slate-900/10 bg-slate-950 px-6 py-6 text-white shadow-[0_32px_90px_rgb(15_23_42_/_0.24)] sm:px-7">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(103,232,249,0.22),transparent_24%),radial-gradient(circle_at_82%_20%,rgba(167,139,250,0.2),transparent_24%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(15,23,42,0.82))]" />
          <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent" />
          <div className="absolute -left-20 bottom-0 h-56 w-56 rounded-full bg-cyan-400/12 blur-3xl" />
          <div className="absolute right-0 top-8 h-48 w-48 rounded-full bg-indigo-500/18 blur-3xl" />

          <div className="relative grid gap-6 xl:grid-cols-[minmax(0,_1fr)_24rem] xl:items-end">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-100">
                <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_16px_rgba(110,231,183,0.9)]" />
                Daily Momentum Hub
              </div>

              <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.05em] text-white sm:text-5xl">
                {user?.first_name ? `${user.first_name}, steer the day before the day steers you.` : "Steer the day before the day steers you."}
              </h1>
              <p className="mt-3 text-sm text-slate-300 sm:text-base">{headerDate}</p>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
                Review yesterday, focus today, and keep your learning loop active. This is the high-depth command layer above your work log and calendar, built for fast orientation.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <SpotlightStat
                  label="Focus tasks"
                  value={focusCount}
                  caption="Active commitments currently in motion."
                />
                <SpotlightStat
                  label="Blockers"
                  value={blockerCount}
                  caption={blockerCount > 0 ? "Escalate or remove friction early." : "The runway is currently clear."}
                />
                <SpotlightStat
                  label="Due reviews"
                  value={dueReviewCount}
                  caption="Knowledge cards waiting for spaced repetition."
                />
                <SpotlightStat
                  label="Meetings"
                  value={meetingCount}
                  caption="Scheduled collaboration blocks for today."
                />
              </div>
            </div>

            <div className="rounded-[30px] border border-white/12 bg-white/[0.08] p-5 shadow-inner shadow-white/5 backdrop-blur-md">
              <div className="mb-5 overflow-hidden rounded-[22px] border border-white/12 bg-slate-950/60">
                <img
                  src={nexusProductPoster}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  className="aspect-video w-full object-cover opacity-90"
                />
              </div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-slate-300">Snapshot</p>
              <p className="mt-3 flex items-center gap-3 text-3xl font-semibold tracking-[-0.04em] text-white">
                <FiTarget className="h-7 w-7 text-cyan-300" />
                {blockerCount > 0 ? `${blockerCount} blocker${blockerCount > 1 ? "s" : ""}` : "Clear runway"}
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                {totalMinutes > 0
                  ? `Yesterday closed with ${hours > 0 ? `${hours}h` : ""}${hours > 0 && minutesRemainder > 0 ? " " : ""}${minutesRemainder > 0 ? `${minutesRemainder}m` : ""} logged across ${reflection?.yesterday?.logs_count || 0} entries.`
                  : "No time logged yesterday yet. Use today’s plan to set a cleaner baseline."}
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <span className="shell-chip bg-white/12 text-white">
                  <span className="shell-chip-dot" />
                  Generated {data?.generated_at ? formatTime(data.generated_at) : "--"}
                </span>
                <button
                  type="button"
                  onClick={() => loadMomentum({ refreshing: true })}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-3 text-sm font-semibold text-slate-950 shadow-[0_18px_34px_rgb(255_255_255_/_0.18)] transition hover:brightness-105"
                >
                  <FiRefreshCcw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                  Refresh snapshot
                </button>
              </div>
            </div>
          </div>

          {error ? (
            <div className="relative mt-5 flex items-center gap-2 rounded-[20px] border border-rose-300/30 bg-rose-500/12 px-4 py-3 text-sm text-rose-100">
              <FiAlertTriangle className="h-4 w-4" />
              {error}
            </div>
          ) : null}
        </header>

        {loading ? (
          <div className="grid gap-6 py-12 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={idx}
                className="h-64 animate-pulse rounded-[30px] border border-white/70 bg-white/76 shadow-[0_20px_44px_rgb(15_23_42_/_0.08)]"
              />
            ))}
          </div>
        ) : (
          <div className="grid gap-8 py-12 lg:grid-cols-[minmax(0,_1.8fr)_minmax(0,_1fr)]">
            <div className="space-y-8">
              <SectionCard
                icon={FiTarget}
                title="Morning Briefing"
                description="Clear the decks, rally your focus, and spot meetings at a glance."
              >
                <div className="grid gap-5 lg:grid-cols-2">
                  <TaskList
                    icon={FiAlertTriangle}
                    title="Overdue"
                    subtitle="Resolve blockers or renegotiate commitments."
                    tasks={data?.morning_briefing?.overdue_tasks}
                    emptyMessage="Nothing overdue—keep the streak going!"
                  />
                  <TaskList
                    icon={FiPlay}
                    title="Today's Focus"
                    subtitle="Your active commitments across sprints."
                    tasks={data?.morning_briefing?.focus_tasks}
                    emptyMessage="No active work today. Consider planning or learning time."
                  />
                </div>
                <div className="grid gap-5 lg:grid-cols-2">
                  <TaskList
                    icon={FiChevronRight}
                    title="Needs Triage"
                    subtitle="Assign owners or slot into a sprint before they stall."
                    tasks={data?.morning_briefing?.needs_triage}
                    emptyMessage="Every task is assigned and scheduled."
                  />
                  <div className="rounded-[26px] border border-white/70 bg-white/78 p-4 shadow-[0_18px_38px_rgb(15_23_42_/_0.06)]">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-[16px] border border-white/70 bg-slate-950 text-white shadow-[0_14px_28px_rgb(15_23_42_/_0.12)]">
                        <FiClock className="h-4 w-4" />
                      </span>
                      <div>
                        <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-700">Today's Meetings</h3>
                        <p className="text-sm text-slate-500">Auto-sourced from your work logs tagged as meetings.</p>
                      </div>
                    </div>
                    <div className="mt-4 space-y-3">
                      {(data?.morning_briefing?.meetings || []).length === 0 ? (
                        <p className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-sm text-slate-500">
                          No meetings logged for today—enjoy the deep work window.
                        </p>
                      ) : (
                        data.morning_briefing.meetings.map((meeting) => (
                          <div
                            key={meeting.id}
                            className="flex items-center justify-between rounded-[20px] border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700"
                          >
                            <div>
                              <p className="font-semibold text-slate-950">{meeting.title}</p>
                              {meeting.category && (
                                <p className="text-xs text-slate-500">{meeting.category}</p>
                              )}
                            </div>
                            <div className="text-right text-xs text-slate-500">
                              <p>{formatTime(meeting.start_time)} – {formatTime(meeting.end_time)}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </SectionCard>

              <SectionCard
                icon={FiZap}
                title="Rapid Work Logging"
                description="Spin up a new entry in seconds with your most used categories and tags."
                action={data?.rapid_logging?.quick_log_template && (
                  <div className="flex flex-col gap-2 text-xs text-gray-500">
                    <span className="font-semibold uppercase tracking-widest text-gray-700">Smart defaults</span>
                    <div className="flex flex-wrap items-center gap-3 text-gray-600">
                      {data.rapid_logging.quick_log_template.default_start_time && (
                        <span className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-1 text-blue-700">
                          <FiClock className="h-3.5 w-3.5" />
                          {formatTime(data.rapid_logging.quick_log_template.default_start_time)}
                        </span>
                      )}
                      {data.rapid_logging.quick_log_template.default_category_id && (
                        <span className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-1 text-blue-700">
                          <FiTag className="h-3.5 w-3.5" />
                          Favorite category ready
                        </span>
                      )}
                    </div>
                  </div>
                )}
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-[26px] border border-white/70 bg-white/78 p-4 shadow-[0_18px_38px_rgb(15_23_42_/_0.06)]">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-700">Top Categories</h3>
                    <div className="mt-4 space-y-3">
                      {(data?.rapid_logging?.top_categories || []).length === 0 ? (
                        <p className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-sm text-slate-500">
                          Start logging work to see your go-to categories.
                        </p>
                      ) : (
                        data.rapid_logging.top_categories.map((category) => (
                          <div
                            key={category.id || category.name}
                            className="flex items-center justify-between rounded-[20px] border border-slate-200 bg-slate-50/80 px-4 py-3"
                          >
                            <div>
                              <p className="text-sm font-semibold text-slate-950">{category.name}</p>
                              <p className="text-xs text-slate-500">{category.count} logs in the last 30 days</p>
                            </div>
                            <span className="text-lg font-semibold text-slate-700">#{category.count}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="rounded-[26px] border border-white/70 bg-white/78 p-4 shadow-[0_18px_38px_rgb(15_23_42_/_0.06)]">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-700">Top Tags</h3>
                    <div className="mt-4 space-y-3">
                      {(data?.rapid_logging?.top_tags || []).length === 0 ? (
                        <p className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-sm text-slate-500">
                          Tag your work to unlock quick filters.
                        </p>
                      ) : (
                        data.rapid_logging.top_tags.map((tag) => (
                          <div
                            key={tag.id || tag.name}
                            className="flex items-center justify-between rounded-[20px] border border-slate-200 bg-slate-50/80 px-4 py-3"
                          >
                            <div className="flex items-center gap-2 text-sm text-slate-700">
                              <FiTag className="h-4 w-4 text-[var(--theme-color)]" />
                              {tag.name}
                            </div>
                            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">{tag.count} uses</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
                {data?.rapid_logging?.suggestions?.recent_log_titles?.length > 0 && (
                  <div className="rounded-[26px] border border-slate-200 bg-slate-50/80 p-4">
                    <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-600">Recent sessions</span>
                    <ul className="mt-3 space-y-2 text-sm text-slate-700">
                      {data.rapid_logging.suggestions.recent_log_titles.map((title) => (
                        <li key={title} className="flex items-center gap-2">
                          <FiArrowRightCircle className="h-4 w-4 text-[var(--theme-color)]" />
                          {title}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </SectionCard>
            </div>

            <div className="space-y-8">
              <SectionCard
                icon={FiBookOpen}
                title="Learning Nudge"
                description="Keep your spaced repetition alive with a single click."
                action={data?.learning_nudge?.total_due ? (
                  <div className="rounded-full border border-white/70 bg-white/76 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-slate-700">
                    {data.learning_nudge.total_due} due today
                  </div>
                ) : null}
              >
                {data?.learning_nudge?.due_card ? (
                  <div className="space-y-4">
                    <div className="rounded-[26px] border border-white/70 bg-white/78 p-5 shadow-[0_18px_38px_rgb(15_23_42_/_0.06)]">
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{data.learning_nudge.due_card.collection_name || data.learning_nudge.due_card.card_type}</p>
                      <h3 className="mt-3 text-lg font-semibold text-slate-950">
                        {data.learning_nudge.due_card.title || "Review this card"}
                      </h3>
                      {data.learning_nudge.due_card.prompt && (
                        <p className="mt-3 text-sm text-slate-600">{data.learning_nudge.due_card.prompt}</p>
                      )}
                      {data.learning_nudge.due_card.answer && (
                        <p className="mt-4 rounded-[18px] bg-sky-50 px-4 py-3 text-sm text-sky-900">
                          {data.learning_nudge.due_card.answer}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleMarkReviewed(data.learning_nudge.due_card.id)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400"
                    >
                      <FiCheckCircle className="h-4 w-4" />
                      Mark reviewed and reschedule
                    </button>
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                    You're all caught up! Add new knowledge bookmarks to keep the streak going.
                  </p>
                )}
              </SectionCard>

              <SectionCard
                icon={FiCalendar}
                title="End-of-Day Reflection"
                description="Close the loop on yesterday so tomorrow starts crisp."
              >
                <div className="grid gap-4">
                  <QuickMetric
                    label="Yesterday's entries"
                    value={reflection?.yesterday?.logs_count || 0}
                    caption="Work logs captured"
                    icon={FiClock}
                  />
                  <QuickMetric
                    label="Time logged"
                    value={totalMinutes > 0 ? `${hours}h ${minutesRemainder}m` : "0m"}
                    caption="Based on your work logs"
                    icon={FiZap}
                  />
                </div>

                {reflection?.yesterday?.note && (
                  <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-700">
                    <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-600">Yesterday's note</span>
                    <p className="mt-2 whitespace-pre-line leading-relaxed">{reflection.yesterday.note}</p>
                  </div>
                )}

                <div className="space-y-4">
                  <TaskList
                    icon={FiAlertTriangle}
                    title="Blockers"
                    subtitle="Resolve or escalate before tomorrow's standup."
                    tasks={reflection?.blockers}
                    emptyMessage="No blockers flagged—keep pushing forward."
                  />
                  <div className="rounded-[26px] border border-white/70 bg-white/78 p-4 shadow-[0_18px_38px_rgb(15_23_42_/_0.06)]">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-[16px] border border-white/70 bg-slate-950 text-white shadow-[0_14px_28px_rgb(15_23_42_/_0.12)]">
                        <FiRefreshCcw className="h-4 w-4" />
                      </span>
                      <div>
                        <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-700">Open Logs</h3>
                        <p className="text-sm text-slate-500">Finish these entries by adding outcomes or time spent.</p>
                      </div>
                    </div>
                    <div className="mt-4 space-y-3">
                      {(reflection?.unfinished_logs || []).length === 0 ? (
                        <p className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-sm text-slate-500">
                          All caught up—no unfinished logs for today.
                        </p>
                      ) : (
                        reflection.unfinished_logs.map((log) => (
                          <div
                            key={log.id || log.title}
                            className="flex items-center justify-between rounded-[20px] border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700"
                          >
                            <div>
                              <p className="font-semibold text-slate-950">{log.title}</p>
                              <p className="text-xs text-slate-500">{formatTime(log.start_time)} – {formatTime(log.end_time)}</p>
                            </div>
                            <span className="text-xs uppercase tracking-[0.18em] text-amber-600">Needs wrap-up</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </SectionCard>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DailyMomentumHub;
