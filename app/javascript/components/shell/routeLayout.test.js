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

  it("enables selection inspectors for project and calendar deep links", () => {
    expect(getRouteLayout("/calendar").inspector).toBe("selection");
    expect(getRouteLayout("/projects/9/issues").inspector).toBe("selection");
  });

  it("describes drawers and preserves unrelated query state when a selection closes", () => {
    expect(getRouteLayout("/projects/9/dashboard")).toMatchObject({ panelMode: "drawer", mobileChrome: "default" });
    expect(getRouteLayout("/chat/7")).toMatchObject({ panelMode: "drawer", mobileChrome: "thread" });
    expect(getSelectionFromSearch("?tab=todo&task_id=42&custom=yes")).toEqual({ key: "task_id", id: "42" });
    expect(clearSelectionFromSearch("?tab=todo&task_id=42&custom=yes")).toBe("?tab=todo&custom=yes");
  });

  it("builds route-aware breadcrumbs with project names", () => {
    expect(getBreadcrumbs("/projects/3/dashboard", [{ id: 3, name: "Apollo" }])).toEqual([
      { label: "Projects", to: "/projects" },
      { label: "Apollo", to: "/projects/3/dashboard" },
      { label: "Project command center" },
    ]);
  });
});
