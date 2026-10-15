import { portfolioEnabled } from "../config/features";

export const hasWorkspaceRole = (user, names) => (!user?.workspace_membership || user.workspace_membership.status === "active") && user?.roles?.some((role) => names.includes(typeof role === "string" ? role : role.name)) || false;
const legacyPermissions = {
  "invitations.manage": ["owner", "admin"], "offboarding.manage": ["owner"],
  "users.create": ["owner", "admin"], "users.manage": ["owner"],
  "memberships.manage": ["owner"], "support.manage": ["owner"],
  "admin.manage": ["owner", "admin"],
};
export const hasWorkspacePermission = (user, permission) => {
  if (!user || (user.workspace_membership && user.workspace_membership.status !== "active")) return false;
  if (Array.isArray(user.permissions)) return user.permissions.includes(permission);
  return hasWorkspaceRole(user, legacyPermissions[permission] || []);
};
export const canAccessWorkspacePath = (user, path) => {
  if (!user || (user.workspace_membership && user.workspace_membership.status !== "active")) return false;
  if (path === "/admin/portfolio") return portfolioEnabled && (Array.isArray(user.permissions) ? user.permissions.includes("portfolio.manage") : Boolean(user.site_admin));
  if (path === "/admin/login-as-user") return hasWorkspacePermission(user, "support.manage") || hasWorkspacePermission(user, "support.inspect") || Boolean(user.site_admin && !Array.isArray(user.permissions));
  if (path === "/admin") return hasWorkspacePermission(user, "admin.manage") || (!Array.isArray(user.permissions) && Boolean(user.site_admin));
  return true;
};

const landingPaths = {
  calendar: "/planning", momentum: "/planning", worklog: "/planning", posts: "/home",
  home: "/home", profile: "/profile", vault: "/vault", knowledge: "/knowledge",
  projects: "/projects", teams: "/teams", pdf: "/pdf-master", users: "/users",
  departments: "/departments", chat: "/chat", notifications: "/notifications",
};
export const workspaceLandingPath = (user) => user?.landing_page === "demo" && portfolioEnabled ? "/demo" : landingPaths[user?.landing_page] || "/home";
