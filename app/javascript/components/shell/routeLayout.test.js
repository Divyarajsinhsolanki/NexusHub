import { describe, expect, it } from "vitest";
import { clearSelectionFromSearch, getBreadcrumbs, getProjectIdFromPath, getRouteLayout, getSelectionFromSearch } from "./routeLayout";

describe("workspace route layout metadata", () => {
  it("selects the project command-center layout and inspector", () => {
    expect(getRouteLayout("/projects/42/dashboard")).toMatchObject({
      section: "projects",
      mode: "project",
      context: "project",
      inspector: "selection",
      density: "compact",
      projectId: "42",
    });
    expect(getProjectIdFromPath("/projects/42/issues")).toBe("42");
  });

  it("keeps immersive tools focused and people pages adaptive", () => {
    expect(getRouteLayout("/chat/7")).toMatchObject({ mode: "immersive", context: null, inspector: null });
    expect(getRouteLayout("/meet/room-1")).toMatchObject({ mode: "immersive", density: "compact" });
    expect(getRouteLayout("/pdf-master")).toMatchObject({ mode: "immersive", mobileChrome: "immersive" });
    expect(getRouteLayout("/teams")).toMatchObject({ mode: "master-detail", context: null, inspector: "activity" });
  });

  it("enables project inspectors and keeps planning compact", () => {
    expect(getRouteLayout("/calendar").inspector).toBeNull();
    expect(getRouteLayout("/planning")).toMatchObject({ section: "planning", context: null, inspector: null, density: "compact" });
    expect(getRouteLayout("/projects/9/issues").inspector).toBe("selection");
  });

  it("describes drawers and preserves unrelated query state when a selection closes", () => {
    expect(getRouteLayout("/projects/9/dashboard")).toMatchObject({ panelMode: "drawer", mobileChrome: "default" });
    expect(getRouteLayout("/chat/7")).toMatchObject({ panelMode: "drawer", mobileChrome: "thread" });
    expect(getSelectionFromSearch("?tab=todo&task_id=42&custom=yes")).toEqual({ key: "task_id", id: "42" });
    expect(clearSelectionFromSearch("?tab=todo&task_id=42&custom=yes")).toBe("?tab=todo&custom=yes");
  });

  it("uses the feed's own sidebar on Home and legacy entry points", () => {
    for (const path of ["/home", "/posts", "/my-work"]) {
      expect(getRouteLayout(path)).toMatchObject({ section: "workspace", context: null, inspector: null, density: "compact" });
      expect(getBreadcrumbs(path)).toEqual([{ label: "Home" }]);
    }
  });

  it("builds route-aware breadcrumbs with project names", () => {
    expect(getBreadcrumbs("/projects/3/dashboard", [{ id: 3, name: "Apollo" }])).toEqual([
      { label: "Projects", to: "/projects" },
      { label: "Apollo", to: "/projects/3/dashboard" },
      { label: "Project command center" },
    ]);
  });
});
