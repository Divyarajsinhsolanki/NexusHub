import React from "react";
import { Helmet } from "react-helmet-async";
import pageMetadata from "../config/pageMetadata.json";
import { useLocation } from "react-router-dom";
import { portfolioEnabled } from "../config/features";

const APP_NAME = portfolioEnabled ? "Divyarajsinh Solanki" : "Nexus Hub";

const routeTitles = Object.fromEntries(Object.entries(pageMetadata).map(([path, meta]) => [path, meta.title]));
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

  const path = location.pathname.replace(/\/+$/, "") || "/";
  const page = pageTitleForPath(path) || "Page Not Found";
  const publicPage = portfolioEnabled && ["/", "/contact", "/legal"].includes(path);
  const title = path === "/" && !portfolioEnabled ? "Workspace Login | Nexus Hub" : `${page} | ${APP_NAME}`;
  const description = pageMetadata[path]?.description || `${page} in Nexus Hub. Manage your workspace and collaborate with your team.`;
  const origin = document.querySelector('meta[name="nexus-site-url"]')?.content || window.location.origin;
  const url = `${origin}${path}`;

  return <Helmet>
    <title>{title}</title>
    <meta name="description" content={description} />
    <meta name="robots" content={publicPage ? "index, follow" : "noindex, nofollow"} />
    <link rel="canonical" href={url} />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    <meta property="og:type" content="website" />
    <meta property="og:url" content={url} />
    <meta property="og:site_name" content={APP_NAME} />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content={title} />
    <meta name="twitter:description" content={description} />
  </Helmet>;
};

export default PageTitle;
