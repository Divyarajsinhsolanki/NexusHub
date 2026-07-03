import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  Briefcase,
  Calendar,
  Check,
  CheckCheck,
  Clock,
  FileText,
  Heart,
  MessageSquare,
  Search,
  Sparkles,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../components/api";

const ACTION_META = {
  commented: {
    label: "Comment",
    icon: MessageSquare,
    rail: "bg-sky-400",
    surface: "bg-sky-50 text-sky-700",
    tint: "from-sky-400/30 via-cyan-300/20 to-transparent",
  },
  chat_message: {
    label: "Chat",
    icon: MessageSquare,
    rail: "bg-indigo-400",
    surface: "bg-indigo-50 text-indigo-700",
    tint: "from-indigo-400/30 via-violet-300/20 to-transparent",
  },
  chat_ping: {
    label: "Mention",
    icon: MessageSquare,
    rail: "bg-fuchsia-400",
    surface: "bg-fuchsia-50 text-fuchsia-700",
    tint: "from-fuchsia-400/30 via-pink-300/20 to-transparent",
  },
  reacted: {
    label: "Reaction",
    icon: Heart,
    rail: "bg-rose-400",
    surface: "bg-rose-50 text-rose-700",
    tint: "from-rose-400/30 via-pink-300/20 to-transparent",
  },
  calendar_reminder: {
    label: "Reminder",
    icon: Calendar,
    rail: "bg-violet-400",
    surface: "bg-violet-50 text-violet-700",
    tint: "from-violet-400/30 via-purple-300/20 to-transparent",
  },
  assigned: {
    label: "Assignment",
    icon: Briefcase,
    rail: "bg-emerald-400",
    surface: "bg-emerald-50 text-emerald-700",
    tint: "from-emerald-400/30 via-teal-300/20 to-transparent",
  },
  update: {
    label: "Update",
    icon: FileText,
    rail: "bg-amber-400",
    surface: "bg-amber-50 text-amber-700",
    tint: "from-amber-400/30 via-orange-300/20 to-transparent",
  },
  default: {
    label: "Alert",
    icon: Bell,
    rail: "bg-slate-400",
    surface: "bg-slate-100 text-slate-700",
    tint: "from-slate-300/30 via-slate-200/20 to-transparent",
  },
};

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "read", label: "Read" },
];

const ACTION_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "assigned", label: "Assignments" },
  { value: "commented", label: "Comments" },
  { value: "update", label: "Updates" },
  { value: "chat_message", label: "Chat" },
  { value: "chat_ping", label: "Mentions" },
  { value: "reacted", label: "Reactions" },
  { value: "calendar_reminder", label: "Reminders" },
];

const getActionMeta = (action) => ACTION_META[action] || ACTION_META.default;

const getGroupLabel = (value) => {
  const notificationDate = value ? new Date(value) : new Date();
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  if (notificationDate >= startOfToday) return "Today";
  if (notificationDate >= startOfYesterday) return "Yesterday";
  return "Earlier";
};

const formatGroupCaption = (group, value) => {
  if (!value) return group;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return group;
  if (group === "Today" || group === "Yesterday") return format(date, "EEE, MMM d");
  return format(date, "MMMM d, yyyy");
};

const MetricCard = ({ label, value, caption }) => (
  <div className="rounded-[24px] border border-white/14 bg-white/[0.08] p-4 shadow-inner shadow-white/5 backdrop-blur-md">
    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-slate-300">{label}</p>
    <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">{value}</p>
    <p className="mt-2 text-sm text-slate-300">{caption}</p>
  </div>
);

const Notifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    loadNotifications();
  }, [statusFilter, actionFilter]);

  const loadNotifications = async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const response = await fetchNotifications({
        page: 1,
        status: statusFilter,
        action_type: actionFilter === "all" ? undefined : actionFilter,
      });

      setNotifications(response.data.notifications || []);
      setUnreadCount(response.data.meta?.unread_count || 0);
    } catch (error) {
      console.error("Failed to load notifications", error);
      setLoadError("Unable to load notifications right now. Please refresh and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleMarkRead = async (id) => {
    try {
      await markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((notification) =>
          notification.id === id ? { ...notification, read_at: new Date().toISOString() } : notification
        )
      );

      const justMarkedUnread = notifications.find((notification) => notification.id === id && !notification.read_at);
      if (justMarkedUnread) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error("Failed to mark read", error);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((notification) => ({ ...notification, read_at: new Date().toISOString() })));
      setUnreadCount(0);
    } catch (error) {
      console.error("Failed to mark all read", error);
    }
  };

  const filteredNotifications = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return notifications.filter((notification) => {
      if (!normalizedQuery) return true;

      const meta = getActionMeta(notification.action);
      return (
        notification.message?.toLowerCase().includes(normalizedQuery) ||
        meta.label.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [notifications, query]);

  const groupedNotifications = useMemo(() => {
    return filteredNotifications.reduce((accumulator, notification) => {
      const group = getGroupLabel(notification.created_at);
      if (!accumulator[group]) accumulator[group] = [];
      accumulator[group].push(notification);
      return accumulator;
    }, {});
  }, [filteredNotifications]);

  const groupOrder = ["Today", "Yesterday", "Earlier"];
  const todayCount = notifications.filter((notification) => getGroupLabel(notification.created_at) === "Today").length;
  const mentionsCount = notifications.filter((notification) => notification.action === "chat_ping").length;
  const assignmentCount = notifications.filter((notification) => notification.action === "assigned").length;

  return (
    <div className="min-h-screen pb-16 text-slate-900">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-[36px] border border-slate-900/10 bg-slate-950 px-6 py-6 text-white shadow-[0_32px_90px_rgb(15_23_42_/_0.24)] sm:px-7">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(103,232,249,0.22),transparent_24%),radial-gradient(circle_at_82%_20%,rgba(167,139,250,0.22),transparent_24%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(15,23,42,0.82))]" />
          <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent" />
          <div className="absolute -right-16 top-10 h-48 w-48 rounded-full bg-cyan-400/15 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-40 w-40 rounded-full bg-indigo-500/20 blur-3xl" />

          <div className="relative grid gap-6 xl:grid-cols-[minmax(0,_1fr)_24rem] xl:items-end">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-100">
                <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_16px_rgba(110,231,183,0.9)]" />
                Signal Feed
              </div>

              <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.05em] text-white sm:text-5xl">
                Command-center notifications with real priority and depth.
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
                Scan activity by lane, isolate unread pressure, and clear the queue without losing context. This feed is tuned for fast decisions rather than a flat inbox list.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Unread" value={unreadCount} caption="Signals still waiting for action." />
                <MetricCard label="Today" value={todayCount} caption="Items created in the current lane." />
                <MetricCard label="Mentions" value={mentionsCount} caption="Direct pings that need attention." />
                <MetricCard label="Assignments" value={assignmentCount} caption="Tasks and ownership changes." />
              </div>
            </div>

            <div className="rounded-[30px] border border-white/12 bg-white/[0.08] p-5 shadow-inner shadow-white/5 backdrop-blur-md">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-slate-300">Queue Health</p>
              <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">
                {filteredNotifications.length}
                <span className="ml-2 text-base font-medium text-slate-300">visible signal{filteredNotifications.length === 1 ? "" : "s"}</span>
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                {unreadCount > 0
                  ? `${unreadCount} unread notifications are still live in the feed.`
                  : "The unread queue is clear right now."}
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  disabled={unreadCount === 0}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-3 text-sm font-semibold text-slate-950 shadow-[0_18px_34px_rgb(255_255_255_/_0.18)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <CheckCheck className="h-4 w-4" />
                  Mark all as read
                </button>
                <button
                  type="button"
                  onClick={loadNotifications}
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/16"
                >
                  <Sparkles className="h-4 w-4" />
                  Refresh feed
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="shell-panel shell-panel-strong overflow-hidden rounded-[32px]">
          <div className="space-y-5 p-5 sm:p-6">
            <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Filter deck</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-slate-950">Shape the feed by urgency and type.</h2>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:items-center">
                {STATUS_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setStatusFilter(option.value)}
                    className={`rounded-full border px-3 py-2.5 text-center text-sm font-semibold transition sm:px-4 ${
                      statusFilter === option.value
                        ? "border-slate-950 bg-slate-950 text-white shadow-[0_18px_34px_rgb(15_23_42_/_0.16)]"
                        : "border-white/70 bg-white/72 text-slate-600 hover:bg-white hover:text-slate-950"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,_1fr)_auto]">
              <div className="relative min-w-0">
                <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search messages or signal type..."
                  className="w-full rounded-[22px] border border-white/70 bg-white/80 py-3 pl-12 pr-12 text-sm text-slate-700 outline-none transition focus:border-sky-200 focus:bg-white focus:shadow-[0_18px_34px_rgb(15_23_42_/_0.08)]"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-xs font-semibold text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    aria-label="Clear notification search"
                  >
                    Clear
                  </button>
                ) : null}
              </div>

              <div className="scrollbar-hide -mx-1 flex min-w-0 gap-2 overflow-x-auto px-1 pb-1 xl:mx-0 xl:px-0">
                {ACTION_OPTIONS.map((option) => {
                  const isActive = actionFilter === option.value;
                  const meta = getActionMeta(option.value);
                  const Icon = option.value === "all" ? Sparkles : meta.icon;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setActionFilter(option.value)}
                      className={`inline-flex items-center gap-2 rounded-[18px] border px-4 py-3 text-sm font-semibold whitespace-nowrap transition ${
                        isActive
                          ? "border-slate-950 bg-slate-950 text-white shadow-[0_18px_34px_rgb(15_23_42_/_0.16)]"
                          : "border-white/70 bg-white/72 text-slate-600 hover:bg-white hover:text-slate-950"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {loading ? (
          <div className="grid gap-5">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="overflow-hidden rounded-[30px] border border-white/70 bg-white/76 p-5 shadow-[0_20px_44px_rgb(15_23_42_/_0.08)]"
              >
                <div className="mb-4 h-6 w-48 animate-pulse rounded-xl bg-slate-100" />
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((__, rowIndex) => (
                    <div key={rowIndex} className="h-24 animate-pulse rounded-[22px] bg-slate-100" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div className="shell-panel shell-panel-strong rounded-[30px] px-6 py-16 text-center">
            <p className="text-lg font-semibold text-rose-600">{loadError}</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="shell-panel shell-panel-strong rounded-[30px] px-6 py-16 text-center">
            <p className="text-xl font-semibold text-slate-950">No notifications yet</p>
            <p className="mt-2 text-sm text-slate-500">This feed will fill as assignments, comments, chats, and reminders start flowing.</p>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="shell-panel shell-panel-strong rounded-[30px] px-6 py-16 text-center">
            <p className="text-xl font-semibold text-slate-950">No notifications match your filters</p>
            <p className="mt-2 text-sm text-slate-500">Broaden the query or switch lanes to see more signals.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {groupOrder.map((group) => {
              const entries = groupedNotifications[group];
              if (!entries?.length) return null;

              return (
                <section
                  key={group}
                  className="shell-panel shell-panel-strong overflow-hidden rounded-[30px]"
                >
                  <div className="flex flex-col gap-3 border-b border-white/60 bg-white/46 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">{group}</p>
                      <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-slate-950">
                        {entries.length} signal{entries.length === 1 ? "" : "s"}
                      </h2>
                    </div>
                    <span className="shell-chip">
                      <span className="shell-chip-dot" />
                      {formatGroupCaption(group, entries[0]?.created_at)}
                    </span>
                  </div>

                  <ul className="space-y-4 p-4 sm:p-5">
                    {entries.map((notification, index) => {
                      const meta = getActionMeta(notification.action);
                      const Icon = meta.icon;
                      const isUnread = !notification.read_at;

                      return (
                        <motion.li
                          key={notification.id}
                          initial={{ opacity: 0, y: 18 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.28, delay: index * 0.04 }}
                          whileHover={{ y: -4, scale: 1.006 }}
                          className={`group relative overflow-hidden rounded-[26px] border bg-white/88 p-4 shadow-[0_18px_38px_rgb(15_23_42_/_0.08)] transition-shadow hover:shadow-[0_24px_54px_rgb(15_23_42_/_0.12)] ${
                            isUnread ? "border-sky-100" : "border-white/70"
                          }`}
                        >
                          <div className={`absolute inset-y-4 left-0 w-1 rounded-r-full ${meta.rail}`} />
                          <div className={`absolute inset-0 bg-gradient-to-r ${meta.tint} opacity-70`} />

                          <div className="relative flex gap-4">
                            <div className="mt-0.5 shrink-0">
                              {notification.actor_avatar ? (
                                <img
                                  src={notification.actor_avatar}
                                  alt=""
                                  className="h-12 w-12 rounded-[18px] border border-white/70 object-cover shadow-[0_12px_26px_rgb(15_23_42_/_0.08)]"
                                loading="lazy" />
                              ) : (
                                <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-white/70 bg-white/90 shadow-[0_12px_26px_rgb(15_23_42_/_0.08)]">
                                  <Icon className="h-5 w-5 text-slate-700" />
                                </div>
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                  <div className="mb-2 flex flex-wrap items-center gap-2">
                                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] ${meta.surface}`}>
                                      {meta.label}
                                    </span>
                                    {isUnread ? (
                                      <span className="inline-flex items-center rounded-full bg-slate-950 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-white">
                                        Unread
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        Read
                                      </span>
                                    )}
                                  </div>
                                  <p className={`text-sm leading-6 ${isUnread ? "font-semibold text-slate-950" : "text-slate-600"}`}>
                                    {notification.message}
                                  </p>
                                </div>

                                <div className="flex shrink-0 items-center gap-3">
                                  <p className="flex items-center gap-1 text-xs text-slate-500">
                                    <Clock className="h-3.5 w-3.5" />
                                    {notification.created_at
                                      ? formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })
                                      : "Just now"}
                                  </p>
                                  {isUnread ? (
                                    <button
                                      type="button"
                                      onClick={() => handleMarkRead(notification.id)}
                                      className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-100"
                                      title="Mark as read"
                                    >
                                      <Check className="h-3.5 w-3.5" />
                                      Mark read
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          </div>
                        </motion.li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Notifications;
