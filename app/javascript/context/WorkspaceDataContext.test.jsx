// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { workspaceAutoResourcesForPath } from "./workspaceDataPolicy";

describe("workspaceAutoResourcesForPath", () => {
  it("hydrates activity for My Work, where the route consumes it", () => {
    expect(workspaceAutoResourcesForPath("/my-work")).toEqual(["activity"]);
  });

  it("defers drawer-only data on operational and immersive routes", () => {
    expect(workspaceAutoResourcesForPath("/projects")).toEqual([]);
    expect(workspaceAutoResourcesForPath("/projects/7/dashboard")).toEqual([]);
    expect(workspaceAutoResourcesForPath("/calendar")).toEqual([]);
    expect(workspaceAutoResourcesForPath("/chat/11")).toEqual([]);
  });
});
