import React, { createContext, useContext, useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { fetchProjects } from "./api";
import PageLoader from "./ui/PageLoader";
import AccessDeniedRedirect from "./AccessDeniedRedirect";

export const ProjectRouteContext = createContext(null);

const ProjectMemberRoute = ({ children }) => {
  const { projectId } = useParams();
  const { isAuthenticated, initializing, user } = useContext(AuthContext);
  const [isMember, setIsMember] = useState(null);
  const [project, setProject] = useState(null);

  useEffect(() => {
    if (!isAuthenticated || !projectId) return;
    let mounted = true;
    fetchProjects()
      .then(({ data }) => {
        const projects = Array.isArray(data) ? data : [];
        const project = projects.find((p) => p.id === Number(projectId));
        const member = project?.users?.some((u) => u.id === user?.id);
        if (mounted) {
          setProject(member ? project : null);
          setIsMember(!!member);
        }
      })
      .catch(() => {
        if (mounted) {
          setProject(null);
          setIsMember(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [projectId, isAuthenticated, user]);

  if (initializing) return <PageLoader title="Project access" message="Verifying project permissions…" />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (isMember === null) return <PageLoader title="Project access" message="Verifying project permissions…" />;
  if (!isMember) return <AccessDeniedRedirect />;
  return <ProjectRouteContext.Provider value={{ project }}>{children}</ProjectRouteContext.Provider>;
};

export default ProjectMemberRoute;
