import React, { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { portfolioEnabled } from "../config/features";

const APP_NAME = portfolioEnabled ? "Divyarajsinh Solanki" : "Nexus Hub";

const routeTitles = {
  "/": portfolioEnabled ? "Full-stack Rails and React Engineer" : "Workspace Login",
  "/login": "Workspace Login",
  "/signup": "Create Workspace",
  "/demo": "Nexus Hub Guided Demo",
  "/calendar": "Calendar",
  "/contact": "Contact",
  "/legal": "Legal",
  "/metaverse-landing": "Metaverse Landing",
  "/pdf": "PDF Master",
  "/pdf-master": "PDF Master",
  "/momentum": "Daily Momentum Hub",
  "/posts": "Posts",
  "/vault": "Vault",
  "/profile": "Profile",
  "/knowledge": "Knowledge Dashboard",
  "/worklog": "Work Log",
  "/projects": "Projects",
  "/teams": "Teams",
  "/users": "Users",
  "/departments": "Departments",
  "/admin": "Admin",
  "/admin/portfolio": "Portfolio Editor",
  "/my-work": "My Work",
  "/admin/login-as-user": "Admin Impersonation",
  "/settings": "Settings",
  "/chat": "Chat",
  "/meet": "Meeting",
  "/notifications": "Notifications",
  "/forgot-password": "Forgot Password",
  "/reset-password": "Reset Password",
};

const pageTitleForPath = (pathname) => {
  if (routeTitles[pathname]) return routeTitles[pathname];

  if (/^\/projects\/[^/]+\/dashboard$/.test(pathname)) return "Sprint Dashboard";
  if (/^\/projects\/[^/]+\/metaverse$/.test(pathname)) return "Project Metaverse";
  if (/^\/projects\/[^/]+\/issues$/.test(pathname)) return "Issue Tracker";
  if (/^\/departments\/[^/]+$/.test(pathname)) return "Department Details";
  if (/^\/profile\/[^/]+$/.test(pathname)) return "Profile";
  if (/^\/chat\/[^/]+$/.test(pathname)) return "Chat";
  if (/^\/meet\/[^/]+$/.test(pathname)) return "Meeting";

  return null;
};

const PageTitle = () => {
  const location = useLocation();

  useEffect(() => {
    const title = pageTitleForPath(location.pathname);
    document.title = title ? `${title} | ${APP_NAME}` : APP_NAME;
  }, [location.pathname]);

  return null;
};

export default PageTitle;
