import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { AuthContext } from "./AuthContext";
import { fetchActivity, fetchCalendarEvents, fetchProjects } from "../components/api";
import { workspaceAutoResourcesForPath } from "./workspaceDataPolicy";

export { workspaceAutoResourcesForPath } from "./workspaceDataPolicy";

const initialState = {
  projects: [],
  activity: { summary: {}, items: [] },
  events: [],
  loading: false,
  error: "",
  loadedAt: null,
  loadedResources: { projects: false, activity: false, events: false },
};

export const WorkspaceDataContext = createContext({
  ...initialState,
  refreshWorkspaceData: async () => {},
});

export const notifyWorkspaceMutation = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("nexus:workspace-mutated"));
};

const eventCollection = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.events)) return payload.events;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const allWorkspaceResources = ["projects", "activity", "events"];

export const WorkspaceDataProvider = ({ children }) => {
  const { user } = useContext(AuthContext);
  const location = useLocation();
  const [state, setState] = useState(initialState);
  const stateRef = useRef(initialState);
  const inflightRef = useRef(new Map());

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const load = useCallback(async ({ force = false, resources = allWorkspaceResources } = {}) => {
    if (!user) {
      setState(initialState);
      return;
    }

    const requestedResources = [...new Set(resources)].filter((resource) => allWorkspaceResources.includes(resource));
    if (!requestedResources.length) return;

    const start = new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    setState((current) => ({ ...current, loading: force || !current.loadedAt, error: "" }));

    const requestFor = (resource) => {
      const existing = inflightRef.current.get(resource);
      if (existing) return existing;

      const request = (resource === "projects"
        ? fetchProjects()
        : resource === "activity"
          ? fetchActivity()
          : fetchCalendarEvents({ start: start.toISOString(), end: end.toISOString() })
      ).finally(() => inflightRef.current.delete(resource));

      inflightRef.current.set(resource, request);
      return request;
    };

    const results = await Promise.allSettled(requestedResources.map(requestFor));
    const failures = results.filter((result) => result.status === "rejected");

    setState((current) => {
      const next = {
        ...current,
        loading: inflightRef.current.size > 0,
        error: failures.length === requestedResources.length
          ? "Workspace context could not be loaded."
          : failures.length
            ? "Some workspace context is temporarily unavailable."
            : "",
        loadedAt: Date.now(),
        loadedResources: { ...current.loadedResources },
      };

      requestedResources.forEach((resource, index) => {
        const result = results[index];
        if (result.status !== "fulfilled") return;
        next.loadedResources[resource] = true;
        if (resource === "projects") next.projects = result.value.data || [];
        if (resource === "activity") next.activity = result.value.data || initialState.activity;
        if (resource === "events") next.events = eventCollection(result.value.data);
      });

      return next;
    });
  }, [user?.id]);

  useEffect(() => {
    const resources = workspaceAutoResourcesForPath(location.pathname);
    if (resources.length) load({ resources });
  }, [load, location.pathname]);

  useEffect(() => {
    if (!user || typeof window === "undefined") return undefined;
    const refreshAfterMutation = () => {
      const resources = allWorkspaceResources.filter((resource) => stateRef.current.loadedResources[resource]);
      if (resources.length) load({ force: true, resources });
    };
    window.addEventListener("nexus:workspace-mutated", refreshAfterMutation);
    return () => window.removeEventListener("nexus:workspace-mutated", refreshAfterMutation);
  }, [load, user?.id]);

  const value = useMemo(() => ({
    ...state,
    refreshWorkspaceData: (resources = allWorkspaceResources) => load({ force: true, resources }),
  }), [load, state]);

  return <WorkspaceDataContext.Provider value={value}>{children}</WorkspaceDataContext.Provider>;
};

export const useWorkspaceData = () => useContext(WorkspaceDataContext);
