const projectDashboardPattern = /^\/projects\/([^/]+)\/(dashboard|issues)$/;
const projectMetaversePattern = /^\/projects\/([^/]+)\/metaverse$/;

const sectionByPath = [
  { match: (path) => path.startsWith("/projects"), section: "projects" },
  { match: (path) => path.startsWith("/profile"), section: "profile" },
  { match: (path) => ["/calendar", "/momentum", "/worklog"].some((route) => path.startsWith(route)), section: "planning" },
  { match: (path) => ["/posts", "/teams", "/users", "/departments", "/notifications"].some((route) => path.startsWith(route)), section: "collaboration" },
  { match: (path) => ["/knowledge", "/vault", "/pdf"].some((route) => path.startsWith(route)), section: "knowledge" },
  { match: (path) => ["/admin", "/settings"].some((route) => path.startsWith(route)), section: "admin" },
  { match: (path) => path.startsWith("/chat"), section: "chat" },
];

export const getProjectIdFromPath = (pathname) => {
  const match = pathname.match(/^\/projects\/([^/]+)/);
  return match?.[1] || null;
};

export const selectionQueryKeys = ["task_id", "log_id", "issue_id", "event_id"];

export const getSelectionFromSearch = (search = "") => {
  const params = new URLSearchParams(search);
  const key = selectionQueryKeys.find((candidate) => params.has(candidate));
  return key ? { key, id: params.get(key) } : null;
};

export const clearSelectionFromSearch = (search = "") => {
  const params = new URLSearchParams(search);
  const key = selectionQueryKeys.find((candidate) => params.has(candidate));
  if (key) params.delete(key);
  const nextSearch = params.toString();
  return nextSearch ? `?${nextSearch}` : "";
};

export const getRouteLayout = (pathname) => {
  const projectMatch = pathname.match(projectDashboardPattern);
  const isMetaverse = projectMetaversePattern.test(pathname);
  const isImmersive =
    isMetaverse ||
    pathname.startsWith("/chat") ||
    pathname.startsWith("/meet/") ||
    pathname.startsWith("/pdf") ||
    pathname.startsWith("/knowledge");

  if (isImmersive) {
    return {
      section: pathname.startsWith("/chat") ? "chat" : "knowledge",
      mode: "immersive",
      context: null,
      inspector: null,
      panelMode: "drawer",
      mobileChrome: pathname.startsWith("/chat/") ? "thread" : "default",
      density: "compact",
      projectId: getProjectIdFromPath(pathname),
    };
  }

  if (projectMatch) {
    return {
      section: "projects",
      mode: "project",
      context: "project",
      inspector: "selection",
      panelMode: "drawer",
      mobileChrome: "default",
      density: "compact",
      projectId: projectMatch[1],
    };
  }

  if (pathname === "/projects") {
    return {
      section: "projects",
      mode: "workspace",
      context: "projects",
      inspector: "activity",
      panelMode: "drawer",
      mobileChrome: "default",
      density: "comfortable",
      projectId: null,
    };
  }

  if (pathname.startsWith("/profile")) {
    return {
      section: "profile",
      mode: "profile",
      context: null,
      inspector: "profile",
      panelMode: "drawer",
      mobileChrome: "default",
      density: "comfortable",
      projectId: null,
    };
  }

  if (pathname === "/teams") {
    return {
      section: "collaboration",
      mode: "master-detail",
      context: null,
      inspector: "activity",
      panelMode: "drawer",
      mobileChrome: "default",
      density: "comfortable",
      projectId: null,
    };
  }

  const section = sectionByPath.find(({ match }) => match(pathname))?.section || "workspace";
  const context = ["planning", "collaboration", "knowledge", "admin"].includes(section) ? section : null;

  return {
    section,
    mode: "workspace",
    context,
    inspector: pathname === "/calendar" ? "selection" : pathname === "/settings" || pathname.startsWith("/admin") ? null : "activity",
    panelMode: "drawer",
    mobileChrome: "default",
    density: ["admin", "chat"].includes(section) ? "compact" : "comfortable",
    projectId: null,
  };
};

export const getBreadcrumbs = (pathname, projects = []) => {
  const projectId = getProjectIdFromPath(pathname);
  const project = projects.find((item) => String(item.id) === String(projectId));

  if (projectId) {
    const tab = pathname.endsWith("/issues") ? "Issue Tracker" : "Project command center";
    return [
      { label: "Projects", to: "/projects" },
      { label: project?.name || "Project", to: `/projects/${projectId}/dashboard` },
      { label: tab },
    ];
  }

  const labels = {
    "/my-work": "My Work",
    "/projects": "Projects",
    "/calendar": "Calendar",
    "/momentum": "Momentum Hub",
    "/worklog": "Work Log",
    "/posts": "Posts",
    "/teams": "Teams",
    "/users": "People",
    "/departments": "Departments",
    "/notifications": "Notifications",
    "/knowledge": "Knowledge",
    "/vault": "Vault",
    "/pdf-master": "PDF Master",
    "/settings": "Settings",
    "/admin": "Admin Console",
    "/profile": "Profile",
    "/chat": "Chat",
  };

  const exact = labels[pathname];
  if (exact) return [{ label: exact }];
  if (/^\/profile\/[^/]+$/.test(pathname)) return [{ label: "People", to: "/users" }, { label: "Profile" }];
  if (/^\/departments\/[^/]+$/.test(pathname)) return [{ label: "Departments", to: "/departments" }, { label: "Department" }];
  if (pathname.startsWith("/admin/")) return [{ label: "Admin", to: "/admin" }, { label: "Tools" }];
  if (pathname.startsWith("/chat/")) return [{ label: "Chat", to: "/chat" }, { label: "Conversation" }];

  return [{ label: "NexusHub" }];
};
