import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  FiActivity,
  FiArchive,
  FiBell,
  FiBook,
  FiCalendar,
  FiCheckCircle,
  FiChevronLeft,
  FiChevronRight,
  FiClock,
  FiFileText,
  FiFolder,
  FiGrid,
  FiHome,
  FiLayers,
  FiLogOut,
  FiMenu,
  FiMessageSquare,
  FiMoreHorizontal,
  FiRefreshCw,
  FiSearch,
  FiSettings,
  FiSliders,
  FiUsers,
  FiX,
  FiZap,
} from "react-icons/fi";

import { AuthContext } from "../context/AuthContext";
import { useWorkspaceData } from "../context/WorkspaceDataContext";
import { fetchCalendarEvents, getIssues, SchedulerAPI } from "./api";
import NotificationCenter from "./NotificationCenter";
import logo from "../images/logo.webp";
import { buildAvatarStyle, getAvatarInitial, normalizeAvatarColor } from "../utils/avatar";
import { clearSelectionFromSearch, getBreadcrumbs, getRouteLayout, getSelectionFromSearch } from "./shell/routeLayout";

const navigationGroups = [
  {
    label: "Workspace",
    items: [
      { to: "/my-work", label: "My Work", icon: FiHome },
      { to: "/projects", label: "Projects", icon: FiFolder },
    ],
  },
  {
    label: "Planning",
    items: [
      { to: "/calendar", label: "Calendar", icon: FiCalendar },
      { to: "/momentum", label: "Momentum", icon: FiZap },
      { to: "/worklog", label: "Work Log", icon: FiClock },
    ],
  },
  {
    label: "Collaboration",
    items: [
      { to: "/posts", label: "Posts", icon: FiActivity },
      { to: "/teams", label: "Teams", icon: FiUsers },
      { to: "/chat", label: "Chat", icon: FiMessageSquare },
      { to: "/departments", label: "Departments", icon: FiGrid },
    ],
  },
  {
    label: "Knowledge",
    items: [
      { to: "/knowledge", label: "Knowledge", icon: FiBook },
      { to: "/vault", label: "Vault", icon: FiArchive },
      { to: "/pdf-master", label: "Documents", icon: FiFileText },
    ],
  },
];

const contextLinks = {
  planning: [
    ["/calendar", "Calendar", FiCalendar],
    ["/momentum", "Momentum Hub", FiZap],
    ["/worklog", "Work Log", FiClock],
    ["/vault", "Personal Vault", FiArchive],
  ],
  collaboration: [
    ["/posts", "Posts and updates", FiActivity],
    ["/teams", "Teams", FiUsers],
    ["/users", "People", FiUsers],
    ["/departments", "Departments", FiGrid],
    ["/chat", "Chat", FiMessageSquare],
    ["/notifications", "Notifications", FiBell],
  ],
  knowledge: [
    ["/knowledge", "Knowledge grid", FiBook],
    ["/vault", "Asset vault", FiArchive],
    ["/pdf-master", "PDF Master", FiFileText],
  ],
  admin: [
    ["/settings", "Preferences", FiSettings],
    ["/admin", "System admin", FiSliders],
    ["/users", "User management", FiUsers],
    ["/departments", "Departments", FiGrid],
  ],
};

const labelForContext = {
  planning: ["Planning", "Schedule, focus, and work records"],
  collaboration: ["Collaboration", "People, updates, and communication"],
  knowledge: ["Knowledge", "Reference material and documents"],
  admin: ["Administration", "Workspace access and preferences"],
};

const normalizeCollection = (value) => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  return [];
};

const formatDate = (value, options = {}) => {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", ...options }).format(date);
};

const useMobileViewport = () => {
  const [isMobile, setIsMobile] = useState(() => (
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(max-width: 767px)").matches
      : false
  ));

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  return isMobile;
};

const UserAvatar = ({ user, size = "md" }) => {
  const [failed, setFailed] = useState(false);
  const displayName = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.name || user?.email || "User";
  const dimension = size === "sm" ? "nexus-avatar-sm" : "nexus-avatar";

  if (user?.profile_picture && user.profile_picture !== "null" && !failed) {
    return <img src={user.profile_picture} alt="" className={dimension} onError={() => setFailed(true)} />;
  }

  return (
    <span className={dimension} style={buildAvatarStyle(normalizeAvatarColor(user?.avatar_color))} aria-label={`${displayName}'s initials`}>
      {getAvatarInitial(displayName)}
    </span>
  );
};

const RailLink = ({ item, collapsed, onNavigate }) => {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) => `nexus-rail-link ${isActive ? "nexus-rail-link-active" : ""}`}
    >
      <Icon aria-hidden="true" />
      <span>{item.label}</span>
    </NavLink>
  );
};

const GlobalRail = ({ collapsed, onToggle, onOpenMobile, mobileOpen }) => (
  <aside className={`nexus-global-rail ${collapsed ? "nexus-global-rail-collapsed" : ""}`} aria-label="Primary navigation">
    <div className="nexus-rail-brand-row">
      <Link to="/my-work" className="nexus-rail-brand" aria-label="NexusHub home">
        <img src={logo} alt="" />
        <span>NexusHub</span>
      </Link>
      <button type="button" onClick={onToggle} className="nexus-icon-button nexus-desktop-only" aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}>
        {collapsed ? <FiChevronRight /> : <FiChevronLeft />}
      </button>
      <button type="button" onClick={onOpenMobile} className="nexus-icon-button nexus-mobile-only" aria-label="Open navigation menu" aria-expanded={mobileOpen} aria-controls="mobile-navigation">
        <FiMenu />
      </button>
    </div>

    <nav className="nexus-rail-navigation">
      {navigationGroups.map((group) => (
        <div className="nexus-rail-group" key={group.label}>
          <p>{group.label}</p>
          {group.items.map((item) => <RailLink key={item.to} item={item} collapsed={collapsed} />)}
        </div>
      ))}
    </nav>

  </aside>
);

const OverlayDrawer = ({ open, onClose, side = "left", label, id, className = "", children }) => {
  const drawerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const drawer = drawerRef.current;
    const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const getFocusable = () => Array.from(drawer?.querySelectorAll(focusableSelector) || []);
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => (getFocusable()[0] || drawer)?.focus?.());

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = getFocusable();
      if (!focusable.length) {
        event.preventDefault();
        drawer?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [onClose, open]);

  if (!open) return null;
  return (
    <div className="nexus-drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside
        ref={drawerRef}
        id={id}
        tabIndex={-1}
        className={`nexus-overlay-drawer nexus-overlay-drawer-${side} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </aside>
    </div>
  );
};

const ProjectContext = ({ projects, activeProjectId, onNavigate }) => {
  const location = useLocation();
  const activeProject = projects.find((project) => String(project.id) === String(activeProjectId));
  const currentTab = new URLSearchParams(location.search).get("tab") || (location.pathname.endsWith("/issues") ? "issues" : "overview");
  const dashboardTabs = activeProject ? [
    ["overview", "Overview", FiHome],
    ["scheduler", "Scheduler", FiCalendar],
    ["todo", "Todo", FiCheckCircle],
    ["statistics", "Statistics", FiActivity],
    ["issues", "Issue Tracker", FiLayers],
    ["vault", "Vault", FiArchive],
    ["settings", "Settings", FiSettings],
  ] : [];

  const projectTabPath = (tab) => {
    const next = new URLSearchParams(location.search);
    next.set("tab", tab);
    return `/projects/${activeProject.id}/dashboard?${next.toString()}`;
  };

  return (
    <>
      <div className="nexus-context-heading">
        <span>{activeProject ? "Project" : "Portfolio"}</span>
        <h2>{activeProject?.name || "Projects"}</h2>
        <p>{activeProject?.description || "Manage delivery plans, members, schedules, and project health."}</p>
      </div>

      {activeProject ? (
        <nav className="nexus-context-links" aria-label="Project navigation">
          {dashboardTabs.map(([tab, label, Icon]) => (
            <Link key={tab} to={projectTabPath(tab)} onClick={onNavigate} className={currentTab === tab ? "active" : ""}>
              <Icon />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      ) : null}

      <div className="nexus-context-section-title">
        <span>{activeProject ? "Switch project" : "Your projects"}</span>
        <Link to="/projects">View all</Link>
      </div>
      <div className="nexus-project-switcher">
        {projects.slice(0, 12).map((project) => (
          <Link
            key={project.id}
            to={`/projects/${project.id}/dashboard`}
            onClick={onNavigate}
            className={String(project.id) === String(activeProjectId) ? "active" : ""}
          >
            <span className="nexus-project-mark">{project.name?.slice(0, 2).toUpperCase()}</span>
            <span><strong>{project.name}</strong><small>{project.status || "Running"}</small></span>
          </Link>
        ))}
        {!projects.length ? <p className="nexus-context-empty">No projects available.</p> : null}
      </div>
    </>
  );
};

const StandardContext = ({ type, onNavigate }) => {
  const [title, description] = labelForContext[type] || ["Workspace", "Navigate your NexusHub workspace"];
  return (
    <>
      <div className="nexus-context-heading">
        <span>NexusHub</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <nav className="nexus-context-links" aria-label={`${title} navigation`}>
        {(contextLinks[type] || []).map(([to, label, Icon]) => (
          <NavLink key={to} to={to} onClick={onNavigate} className={({ isActive }) => isActive ? "active" : ""}>
            <Icon />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="nexus-context-tip">
        <FiSearch />
        <div><strong>Find anything</strong><p>Use Ctrl K to search projects, tasks, people, posts, and documents.</p></div>
      </div>
    </>
  );
};

const ContextPanel = ({ layout, projects, open, onClose }) => {
  if (!layout.context) return null;
  return (
    <OverlayDrawer open={open} onClose={onClose} id="workspace-context-drawer" label="Context navigation" className="nexus-context-panel">
      <button type="button" className="nexus-context-close" onClick={onClose} aria-label="Close context panel"><FiX /></button>
      {layout.context === "projects" || layout.context === "project" ? (
        <ProjectContext projects={projects} activeProjectId={layout.projectId} onNavigate={onClose} />
      ) : (
        <StandardContext type={layout.context} onNavigate={onClose} />
      )}
    </OverlayDrawer>
  );
};

const ActivityInspector = ({ activity, events, error, onRefresh, projectId, title = "Workspace pulse" }) => {
  const items = (activity?.items || []).filter((item) => !projectId || item.path?.includes(`/projects/${projectId}/`)).slice(0, 6);
  const eventItems = events.filter((event) => !projectId || String(event.project_id) === String(projectId)).slice(0, 4);
  const summary = activity?.summary || {};

  return (
    <div className="nexus-inspector-content">
      <div className="nexus-inspector-heading">
        <div><span>Live context</span><h2>{title}</h2></div>
        <button type="button" onClick={onRefresh} className="nexus-icon-button" aria-label="Refresh workspace context"><FiRefreshCw /></button>
      </div>
      {error ? <p className="nexus-inline-error">{error}</p> : null}
      <div className="nexus-inspector-stats">
        <div><strong>{summary.open_assignments ?? 0}</strong><span>Open</span></div>
        <div><strong>{summary.overdue_assignments ?? 0}</strong><span>Overdue</span></div>
        <div><strong>{summary.upcoming_events ?? 0}</strong><span>Upcoming</span></div>
        <div><strong>{summary.unread_notifications ?? 0}</strong><span>Unread</span></div>
      </div>

      <section className="nexus-inspector-section">
        <div className="nexus-section-row"><h3>Upcoming</h3><Link to="/calendar">Calendar</Link></div>
        {eventItems.map((event) => (
          <Link key={event.id} to={`/calendar?event_id=${event.id}`} className="nexus-upcoming-row">
            <span>{formatDate(event.start_at)}</span>
            <div><strong>{event.title}</strong><small>{formatDate(event.start_at, { hour: "numeric", minute: "2-digit" })}</small></div>
          </Link>
        ))}
        {!eventItems.length ? <p className="nexus-inspector-empty">No upcoming dates.</p> : null}
      </section>

      <section className="nexus-inspector-section">
        <div className="nexus-section-row"><h3>Recent activity</h3><Link to="/notifications">View all</Link></div>
        {items.map((item) => (
          <Link key={`${item.kind}-${item.id}`} to={item.path} className="nexus-activity-row">
            <span className="nexus-activity-icon">{item.kind?.slice(0, 1).toUpperCase()}</span>
            <div><strong>{item.title}</strong><small>{item.subtitle || item.kind}</small></div>
          </Link>
        ))}
        {!items.length ? <p className="nexus-inspector-empty">No recent activity.</p> : null}
      </section>
    </div>
  );
};

const SelectionInspector = ({ layout, search, events, fallback }) => {
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const selection = useMemo(() => {
    if (params.get("log_id")) return ["log", params.get("log_id")];
    if (params.get("task_id")) return ["task", params.get("task_id")];
    if (params.get("issue_id")) return ["issue", params.get("issue_id")];
    if (params.get("event_id")) return ["event", params.get("event_id")];
    return null;
  }, [params]);
  const [state, setState] = useState({ loading: false, item: null, error: "" });

  useEffect(() => {
    let active = true;
    if (!selection) {
      setState({ loading: false, item: null, error: "" });
      return undefined;
    }

    const [type, id] = selection;
    setState({ loading: true, item: null, error: "" });

    const request = async () => {
      if (type === "task") {
        const response = await SchedulerAPI.getTasks({ project_id: layout.projectId });
        return normalizeCollection(response.data).find((item) => String(item.id) === String(id) || String(item.task_id) === String(id));
      }
      if (type === "log") {
        const response = await SchedulerAPI.getTaskLogs({ project_id: layout.projectId });
        return normalizeCollection(response.data).find((item) => String(item.id) === String(id));
      }
      if (type === "issue") {
        const response = await getIssues(layout.projectId);
        return normalizeCollection(response.data).find((item) => String(item.id) === String(id));
      }
      const existing = events.find((event) => String(event.id) === String(id));
      if (existing) return existing;
      const response = await fetchCalendarEvents();
      return normalizeCollection(response.data?.events || response.data).find((event) => String(event.id) === String(id));
    };

    request()
      .then((item) => active && setState({ loading: false, item: item || null, error: item ? "" : "Selected item was not found." }))
      .catch(() => active && setState({ loading: false, item: null, error: "Selected item could not be loaded." }));

    return () => { active = false; };
  }, [events, layout.projectId, selection?.[0], selection?.[1]]);

  if (!selection) return fallback;
  const [type, id] = selection;
  const item = state.item;
  const title = item?.title || item?.task?.title || item?.task_id || item?.issue_key || `${type} ${id}`;

  return (
    <div className="nexus-inspector-content">
      <div className="nexus-inspector-heading">
        <div><span>Selected {type}</span><h2>{title}</h2></div>
        <FiLayers />
      </div>
      {state.loading ? <p className="nexus-inspector-empty">Loading details…</p> : null}
      {state.error ? <p className="nexus-inline-error">{state.error}</p> : null}
      {item ? (
        <div className="nexus-detail-list">
          <div><span>Status</span><strong>{item.status || item.task?.status || "Open"}</strong></div>
          <div><span>Assignee</span><strong>{item.developer?.name || item.assigned_user?.name || item.assignee_name || "Unassigned"}</strong></div>
          <div><span>Date</span><strong>{formatDate(item.log_date || item.start_at || item.start_date || item.end_date)}</strong></div>
          <div><span>Hours</span><strong>{item.hours_logged ?? item.estimated_hours ?? item.total_hours ?? "—"}</strong></div>
          <div><span>Type</span><strong>{item.type || item.event_type || item.priority || "—"}</strong></div>
          {(item.description || item.issue_description || item.task?.description) ? (
            <div className="nexus-detail-description"><span>Description</span><p>{item.description || item.issue_description || item.task?.description}</p></div>
          ) : null}
          {(item.task_url || item.task?.task_url) ? <a className="nexus-primary-action" href={item.task_url || item.task?.task_url} target="_blank" rel="noreferrer">Open linked work</a> : null}
        </div>
      ) : null}
    </div>
  );
};

const InspectorPanel = ({ layout, open, onClose, location }) => {
  const { activity, events, error, refreshWorkspaceData } = useWorkspaceData();
  if (!layout.inspector) return null;
  const activityPanel = (
    <ActivityInspector
      activity={activity}
      events={events}
      error={error}
      onRefresh={refreshWorkspaceData}
      projectId={layout.projectId}
      title={layout.mode === "profile" ? "Personal workspace" : layout.projectId ? "Project pulse" : "Workspace pulse"}
    />
  );

  return (
    <OverlayDrawer open={open} onClose={onClose} side="right" id="workspace-inspector-drawer" label="Workspace inspector" className="nexus-inspector-panel">
      <button type="button" className="nexus-context-close" onClick={onClose} aria-label="Close inspector"><FiX /></button>
      {layout.inspector === "selection" ? (
        <SelectionInspector layout={layout} search={location.search} events={events} fallback={activityPanel} />
      ) : activityPanel}
    </OverlayDrawer>
  );
};

const MobileDrawer = ({ open, onClose, onLogout, user, hasAdminRole }) => {
  return (
    <OverlayDrawer open={open} onClose={onClose} id="mobile-navigation" label="Mobile navigation" className="nexus-mobile-drawer">
        <div className="nexus-mobile-drawer-head">
          <div><UserAvatar user={user} /><span><strong>{user?.first_name || "NexusHub"}</strong><small>{user?.email}</small></span></div>
          <button type="button" className="nexus-icon-button" onClick={onClose} aria-label="Close navigation menu"><FiX /></button>
        </div>
        {navigationGroups.map((group) => (
          <div className="nexus-mobile-group" key={group.label}>
            <p>{group.label}</p>
            {group.items.map((item) => <RailLink key={item.to} item={item} onNavigate={onClose} />)}
          </div>
        ))}
        <div className="nexus-mobile-group">
          <p>Account</p>
          <RailLink item={{ to: "/profile", label: "Profile", icon: FiUsers }} onNavigate={onClose} />
          <RailLink item={{ to: "/settings", label: "Settings", icon: FiSettings }} onNavigate={onClose} />
          {hasAdminRole ? <RailLink item={{ to: "/admin", label: "Admin", icon: FiSliders }} onNavigate={onClose} /> : null}
          <button type="button" className="nexus-mobile-account-action" onClick={onLogout}><FiLogOut />Sign out</button>
        </div>
    </OverlayDrawer>
  );
};

const BottomNavigation = ({ onMore }) => {
  const items = [
    ["/my-work", "My Work", FiHome],
    ["/projects", "Projects", FiFolder],
    ["/calendar", "Calendar", FiCalendar],
    ["/chat", "Chat", FiMessageSquare],
  ];
  return (
    <nav className="nexus-bottom-navigation" aria-label="Mobile primary navigation">
      {items.map(([to, label, Icon]) => (
        <NavLink key={to} to={to} className={({ isActive }) => isActive ? "active" : ""}><Icon /><span>{label}</span></NavLink>
      ))}
      <button type="button" onClick={onMore}><FiMoreHorizontal /><span>More</span></button>
    </nav>
  );
};

const Navbar = () => {
  const { user, handleLogout } = useContext(AuthContext);
  const { projects, refreshWorkspaceData } = useWorkspaceData();
  const location = useLocation();
  const navigate = useNavigate();
  const isMobileViewport = useMobileViewport();
  const layout = useMemo(() => getRouteLayout(location.pathname), [location.pathname]);
  const breadcrumbs = useMemo(() => getBreadcrumbs(location.pathname, projects), [location.pathname, projects]);
  const [collapsed, setCollapsed] = useState(() => {
    try { return window.localStorage.getItem("nexus:shell:nav-collapsed") === "true"; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileTriggerRef = useRef(null);
  const profileMenuRef = useRef(null);
  const selection = useMemo(() => getSelectionFromSearch(location.search), [location.search]);

  const hasAdminRole = user?.roles?.some((role) => ["owner", "admin"].includes(role.name));

  useEffect(() => {
    document.documentElement.dataset.nexusNav = collapsed ? "collapsed" : "expanded";
    try { window.localStorage.setItem("nexus:shell:nav-collapsed", String(collapsed)); } catch { /* storage is optional */ }
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
    setContextOpen(false);
    setInspectorOpen(false);
    setProfileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (layout.inspector === "selection" && selection) setInspectorOpen(true);
  }, [layout.inspector, selection?.key, selection?.id]);

  useEffect(() => {
    if (!profileOpen) return undefined;
    const menu = profileMenuRef.current;
    const getItems = () => Array.from(menu?.querySelectorAll('[role="menuitem"]') || []);
    window.requestAnimationFrame(() => getItems()[0]?.focus());

    const handlePointerDown = (event) => {
      if (!menu?.contains(event.target) && !profileTriggerRef.current?.contains(event.target)) setProfileOpen(false);
    };
    const handleKeyDown = (event) => {
      const items = getItems();
      if (event.key === "Escape") {
        event.preventDefault();
        setProfileOpen(false);
        profileTriggerRef.current?.focus();
      } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) && items.length) {
        event.preventDefault();
        const currentIndex = items.indexOf(document.activeElement);
        const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowDown" ? (currentIndex + 1) % items.length : (currentIndex <= 0 ? items.length : currentIndex) - 1;
        items[nextIndex].focus();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [profileOpen]);

  const closeContext = useCallback(() => setContextOpen(false), []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  const closeInspector = useCallback(() => {
    setInspectorOpen(false);
    if (!selection) return;
    navigate({ pathname: location.pathname, search: clearSelectionFromSearch(location.search) }, { replace: true });
  }, [location.pathname, location.search, navigate, selection]);

  const openContext = useCallback(() => {
    setInspectorOpen(false);
    setMobileOpen(false);
    setProfileOpen(false);
    setContextOpen(true);
    if (["project", "projects"].includes(layout.context)) refreshWorkspaceData(["projects"]);
  }, [layout.context, refreshWorkspaceData]);

  const openInspector = useCallback(() => {
    setContextOpen(false);
    setMobileOpen(false);
    setProfileOpen(false);
    setInspectorOpen(true);
    refreshWorkspaceData();
  }, [refreshWorkspaceData]);

  const openMobile = useCallback(() => {
    setContextOpen(false);
    setInspectorOpen(false);
    setProfileOpen(false);
    setMobileOpen(true);
  }, []);

  const dispatchPrimaryAction = () => {
    if (location.pathname === "/projects") window.dispatchEvent(new Event("nexus:new-project"));
    else window.dispatchEvent(new Event("nexus:open-search"));
  };

  if (isMobileViewport && ["thread", "immersive"].includes(layout.mobileChrome)) return null;

  return (
    <>
      <GlobalRail
        collapsed={collapsed}
        onToggle={() => setCollapsed((value) => !value)}
        onOpenMobile={openMobile}
        mobileOpen={mobileOpen}
      />

      <header className="nexus-top-command-bar">
        <div className="nexus-topbar-left">
          {layout.context ? <button type="button" className="nexus-icon-button nexus-context-trigger" onClick={openContext} aria-label="Open context navigation" aria-haspopup="dialog" aria-expanded={contextOpen} aria-controls="workspace-context-drawer"><FiLayers /></button> : null}
          <nav className="nexus-breadcrumbs" aria-label="Breadcrumb">
            {breadcrumbs.map((crumb, index) => (
              <React.Fragment key={`${crumb.label}-${index}`}>
                {index ? <FiChevronRight /> : null}
                {crumb.to ? <Link to={crumb.to}>{crumb.label}</Link> : <span>{crumb.label}</span>}
              </React.Fragment>
            ))}
          </nav>
        </div>
        <div className="nexus-topbar-actions">
          <button type="button" className="nexus-search-trigger" onClick={() => window.dispatchEvent(new Event("nexus:open-search"))} aria-label="Search workspace">
            <FiSearch /><span>Search projects, tasks, people…</span><kbd>Ctrl K</kbd>
          </button>
          <button type="button" className="nexus-primary-action nexus-topbar-primary" onClick={dispatchPrimaryAction}>
            {location.pathname === "/projects" ? "New project" : "Quick search"}
          </button>
          {layout.inspector ? <button type="button" className="nexus-icon-button nexus-inspector-trigger" onClick={openInspector} aria-label="Open inspector" aria-haspopup="dialog" aria-expanded={inspectorOpen} aria-controls="workspace-inspector-drawer"><FiActivity /></button> : null}
          {!isMobileViewport ? <NotificationCenter /> : null}
          <button ref={profileTriggerRef} type="button" className="nexus-topbar-avatar" onClick={() => setProfileOpen((value) => !value)} aria-label="Open account menu" aria-haspopup="menu" aria-expanded={profileOpen} aria-controls="nexus-account-menu"><UserAvatar user={user} size="sm" /></button>
        </div>
        {profileOpen ? (
          <div ref={profileMenuRef} id="nexus-account-menu" className="nexus-profile-menu" role="menu" aria-label="Account">
            <div><UserAvatar user={user} /><span><strong>{user?.first_name} {user?.last_name}</strong><small>{user?.email}</small></span></div>
            <Link to="/profile" role="menuitem"><FiUsers />Profile</Link>
            <Link to="/settings" role="menuitem"><FiSettings />Settings</Link>
            {hasAdminRole ? <Link to="/admin" role="menuitem"><FiSliders />Admin console</Link> : null}
            <button type="button" onClick={handleLogout} role="menuitem"><FiLogOut />Sign out</button>
          </div>
        ) : null}
      </header>

      <ContextPanel layout={layout} projects={projects} open={contextOpen} onClose={closeContext} />
      <InspectorPanel layout={layout} open={inspectorOpen} onClose={closeInspector} location={location} />
      <MobileDrawer open={mobileOpen} onClose={closeMobile} onLogout={handleLogout} user={user} hasAdminRole={hasAdminRole} />
      <BottomNavigation onMore={openMobile} />
    </>
  );
};

export default Navbar;
