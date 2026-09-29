import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../context/AuthContext", async () => {
  const ReactModule = await import("react");
  return { AuthContext: ReactModule.createContext({}) };
});

vi.mock("../components/api", () => ({
  fetchPortfolio: vi.fn(() => new Promise(() => {})),
  sendContact: vi.fn(),
}));

import { AuthContext } from "../context/AuthContext";
import PublicPortfolio from "./PublicPortfolio";

describe("PublicPortfolio", () => {
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
});
