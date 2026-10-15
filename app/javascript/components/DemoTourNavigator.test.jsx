// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import DemoTourNavigator from "./DemoTourNavigator";
vi.mock("./api", () => ({ fetchDemoManifest: async () => ({ data: {
  total_steps: 7,
  groups: [
    { route: "/projects/7/dashboard", title: "Project Delivery", step: 1, previous_route: "/demo", next_route: "/planning" },
    { route: "/posts", title: "Team Collaboration", step: 3, previous_route: "/momentum", next_route: "/knowledge" },
    { route: "/projects/7/dashboard?tab=environments", title: "Operations", step: 6, previous_route: "/pdf-master", next_route: "/demo#architecture" },
  ],
} }) }));
afterEach(cleanup);
describe("demo tour screen matching", () => {
  it("keeps collaboration navigation after the posts redirect and opens the next step", async () => {
    const Location = () => <span data-testid="location">{useLocation().pathname}</span>;
    render(<MemoryRouter initialEntries={["/posts"]}>
      <DemoTourNavigator />
      <Location />
      <Routes>
        <Route path="/posts" element={<Navigate to="/home" replace />} />
        <Route path="*" element={null} />
      </Routes>
    </MemoryRouter>);
    expect(await screen.findByText("Step 3 of 7: Team Collaboration")).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toBe("/home");
    expect(screen.getByRole("link", { name: /Previous/ }).getAttribute("href")).toBe("/momentum");
    await userEvent.click(screen.getByRole("link", { name: /Next/ }));
    expect(screen.getByTestId("location").textContent).toBe("/knowledge");
  });
  it("matches Operations before its parent project route", async () => {
    render(<MemoryRouter initialEntries={["/projects/7/dashboard?mode=dev&tab=environments"]}><DemoTourNavigator /></MemoryRouter>);
    expect(await screen.findByText("Step 6 of 7: Operations")).toBeTruthy();
  });
  it("keeps the regular project dashboard in the delivery step", async () => {
    render(<MemoryRouter initialEntries={["/projects/7/dashboard?mode=dev"]}><DemoTourNavigator /></MemoryRouter>);
    expect(await screen.findByText("Step 1 of 7: Project Delivery")).toBeTruthy();
  });
});
