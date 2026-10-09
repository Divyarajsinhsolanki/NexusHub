import React, { createContext, useContext, useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { fetchProject } from "./api";
import { canOpenProjectWorkspace } from "../utils/projectAccess";
import PageLoader from "./ui/PageLoader";
import AccessDeniedRedirect from "./AccessDeniedRedirect";

export const ProjectRouteContext = createContext(null);

const ProjectMemberRoute = ({ children }) => {
  const { projectId } = useParams();
  const { isAuthenticated, initializing, user } = useContext(AuthContext);
  const [isMember, setIsMember] = useState(null);
  const [project, setProject] = useState(null);
  const [checkedKey, setCheckedKey] = useState(null);
  const accessKey = `${projectId}:${user?.id}`;

  useEffect(() => {
    if (!isAuthenticated || !projectId) return;
    let mounted = true;
    fetchProject(projectId)
      .then(({ data }) => {
        const project = data;
        const member = canOpenProjectWorkspace(project, user);
        if (mounted) {
          setProject(member ? project : null);
          setIsMember(!!member);
          setCheckedKey(accessKey);
        }
      })
      .catch(() => {
        if (mounted) {
          setProject(null);
          setIsMember(false);
          setCheckedKey(accessKey);
        }
      });
    return () => {
      mounted = false;
    };
  }, [projectId, isAuthenticated, user]);

  if (initializing) return <PageLoader title="Project access" message="Verifying project permissions…" />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (isMember === null || checkedKey !== accessKey) return <PageLoader title="Project access" message="Verifying project permissions…" />;
  if (!isMember) return <AccessDeniedRedirect />;
  return <ProjectRouteContext.Provider value={{ project }}>{children}</ProjectRouteContext.Provider>;
};

export default ProjectMemberRoute;
