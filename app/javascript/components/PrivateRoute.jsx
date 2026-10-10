import React, { useContext } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import PageLoader from "./ui/PageLoader";
import { canAccessWorkspacePath, hasWorkspaceRole } from "../utils/workspaceAccess";
import AccessDeniedRedirect from "./AccessDeniedRedirect";

const PrivateRoute = ({ children, ownerOnly = false, siteAdminOnly = false, allowedRoles = [] }) => {
  const { isAuthenticated, initializing, user } = useContext(AuthContext);
  const location = useLocation();
  const mode = location.state?.mode || "login";

  if (initializing) return <PageLoader title="Authenticating" message="Checking your access…" />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ mode, from: `${location.pathname}${location.search}${location.hash}` }} />;
  if (!canAccessWorkspacePath(user, location.pathname)) return <AccessDeniedRedirect />;
  if (siteAdminOnly && !user?.site_admin) {
    return <AccessDeniedRedirect />;
  }
  if (ownerOnly && !hasWorkspaceRole(user, ["owner"])) {
    return <AccessDeniedRedirect />;
  }
  if (allowedRoles.length > 0 && !hasWorkspaceRole(user, allowedRoles) && !(location.pathname === "/admin" && user?.site_admin)) {
    return <AccessDeniedRedirect />;
  }
  return children;
};

export default PrivateRoute;
