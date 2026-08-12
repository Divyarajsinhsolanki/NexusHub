import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../components/api", () => ({
  fetchActivity: vi.fn(() => new Promise(() => {})),
}));

vi.mock("../context/WorkspaceDataContext", () => ({
  useWorkspaceData: () => ({
    activity: { summary: {}, items: [] },
    error: "",
    loading: false,
    refreshWorkspaceData: vi.fn(),
  }),
}));

import MyWork from "./MyWork";

describe("MyWork", () => {
  it("renders the unified work summary and workspace search action", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <MyWork />
      </MemoryRouter>
    );

    expect(markup).toContain("Assignments, deadlines, meetings, and signals in one place.");
    expect(markup).toContain("Open assignments");
    expect(markup).toContain("Search workspace");
  });
});
