import { portfolioEnabled } from "../config/features";

export const hasWorkspaceRole = (user, names) => user?.roles?.some((role) => names.includes(typeof role === "string" ? role : role.name)) || false;
export const canAccessWorkspacePath = (user, path) => {
  if (!user) return false;
  if (path === "/admin/portfolio") return portfolioEnabled && Boolean(user.site_admin);
  if (path === "/admin/login-as-user") return hasWorkspaceRole(user, ["owner"]);
  if (path === "/admin") return Boolean(user.site_admin) || hasWorkspaceRole(user, ["owner", "admin"]);
  return true;
};

const landingPaths = {
  calendar: "/planning", momentum: "/planning", worklog: "/planning", posts: "/home",
  home: "/home", profile: "/profile", vault: "/vault", knowledge: "/knowledge",
  projects: "/projects", teams: "/teams", pdf: "/pdf-master", users: "/users",
  departments: "/departments", chat: "/chat", notifications: "/notifications",
};
export const workspaceLandingPath = (user) => user?.landing_page === "demo" && portfolioEnabled ? "/demo" : landingPaths[user?.landing_page] || "/home";
