// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../context/AuthContext", async () => {
  const ReactModule = await import("react");
  return { AuthContext: ReactModule.createContext({}) };
});

vi.mock("../components/api", () => ({
  fetchPortfolio: vi.fn(() => new Promise(() => {})),
  sendContact: vi.fn(),
}));

import { AuthContext } from "../context/AuthContext";
import { fetchPortfolio } from "../components/api";
import PublicPortfolio from "./PublicPortfolio";

const projects = [
  {
    id: 1,
    title: "Nexus Hub",
    tagline: "A workspace for connected product delivery.",
    summary: "Nexus Hub case study summary.",
    stack: ["Rails", "React"],
    engineering_highlights: ["Nexus highlight"],
    case_study: { problem: "Nexus problem", role: "Nexus role", constraints: [], decisions: [], trade_offs: [], outcomes: [] },
    repository_url: "https://github.com/example/nexus-hub",
    features: [{ id: 11, category: "Delivery", title: "Nexus delivery feature", summary: "Nexus feature summary", demo_path: "/nexus-demo", position: 1 }],
  },
  {
    id: 2,
    title: "Atlas Console",
    tagline: "A console for distributed operations.",
    summary: "Atlas Console case study summary.",
    stack: ["TypeScript", "PostgreSQL"],
    engineering_highlights: ["Atlas highlight"],
    case_study: { problem: "Atlas problem", role: "Atlas role", constraints: [], decisions: [], trade_offs: [], outcomes: [] },
    repository_url: "https://github.com/example/atlas-console",
    features: [{ id: 21, category: "Operations", title: "Atlas operations feature", summary: "Atlas feature summary", demo_path: "/atlas-demo", position: 1 }],
  },
];

const renderPortfolio = (handleDemoLogin = vi.fn()) => render(
  <MemoryRouter>
    <AuthContext.Provider value={{ handleDemoLogin }}>
      <PublicPortfolio />
    </AuthContext.Provider>
  </MemoryRouter>
);

describe("PublicPortfolio", () => {
  beforeEach(() => {
    vi.mocked(fetchPortfolio).mockReturnValue(new Promise(() => {}));
  });

  it("renders the flagship case study and six guided feature areas", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <AuthContext.Provider value={{ handleDemoLogin: vi.fn() }}>
          <PublicPortfolio />
        </AuthContext.Provider>
      </MemoryRouter>
    );

    expect(html).toContain("Divyarajsinh Solanki");
    expect(html).toContain("Nexus Hub");
    expect(html).toContain("Flagship Case Study");
    expect(html).toContain("Project Delivery");
    expect(html).toContain("Planning and Focus");
    expect(html).toContain("Collaboration");
    expect(html).toContain("Knowledge");
    expect(html).toContain("Documents");
    expect(html).toContain("Platform");
    expect(html).toContain("Architecture");
    expect(html).toContain("Contact");
  });

  it("keeps essential portfolio content visible in static markup without is-visible classes", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <AuthContext.Provider value={{ handleDemoLogin: vi.fn() }}>
          <PublicPortfolio />
        </AuthContext.Provider>
      </MemoryRouter>
    );

    expect(html).not.toMatch(/class="[^"]*portfolio-js/);
    expect(html).not.toMatch(/class="[^"]*is-visible/);
    expect(html).not.toContain("portfolio-reveal");
    expect(html).toContain('data-portfolio-motion="hero"');
    expect(html).toContain('data-portfolio-motion="case-visual"');
    expect(html).toContain('data-portfolio-motion="decision-card"');
    expect(html).toContain('data-portfolio-motion="feature-card"');
    expect(html).toContain('data-portfolio-motion="architecture-step"');
    expect(html).toContain("I build full-stack products that solve real workflow problems.");
    expect(html).toContain("Product thinking with full-stack execution.");
    expect(html).toContain("AWS production deploy");
    expect(html).toContain("Flagship Case Study");
    expect(html).toContain("Engineering Decisions");
    expect(html).toContain("Project Delivery");
    expect(html).toContain("Built across the complete application stack.");
    expect(html).toContain("Let’s discuss the role and the problems you need solved.");
    expect(html).toContain("prefers-reduced-motion: reduce");
    expect(html).not.toContain("portfolioReveal");
  });

  it("allows each returned project to be selected with its own features and guided demo action", async () => {
    vi.mocked(fetchPortfolio).mockResolvedValue({ data: { projects, seo: {} } });
    const handleDemoLogin = vi.fn().mockResolvedValue(undefined);
    renderPortfolio(handleDemoLogin);

    await waitFor(() => expect(screen.getByRole("button", { name: "Nexus Hub", pressed: true })).toBeTruthy());
    expect(screen.getByText("Nexus delivery feature")).toBeTruthy();
    expect(screen.getByRole("link", { name: /view code/i }).getAttribute("href")).toBe(projects[0].repository_url);
    fireEvent.click(screen.getByRole("button", { name: "Start guided demo" }));
    expect(handleDemoLogin).toHaveBeenCalledWith("/nexus-demo");

    fireEvent.click(screen.getByRole("button", { name: "Atlas Console" }));

    expect(screen.getByRole("button", { name: "Atlas Console", pressed: true })).toBeTruthy();
    expect(screen.getByText("Atlas operations feature")).toBeTruthy();
    expect(screen.getByText("Atlas feature summary")).toBeTruthy();
    expect(screen.getByRole("link", { name: /view code/i }).getAttribute("href")).toBe(projects[1].repository_url);

    fireEvent.click(screen.getByRole("button", { name: "Start guided demo" }));
    expect(handleDemoLogin).toHaveBeenCalledWith("/atlas-demo");
  });
});
