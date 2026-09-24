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
import PublicPortfolio, { demoStartErrorMessage } from "./PublicPortfolio";

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

  it("explains how to correct disabled or unseeded demo deployments", () => {
    expect(demoStartErrorMessage({ response: { data: { error: "demo_disabled" } } })).toContain("PORTFOLIO_ENABLED");
    expect(demoStartErrorMessage({ response: { data: { error: "demo_unavailable" } } })).toContain("seed the demo workspace");
    expect(demoStartErrorMessage({})).toBe("The demo could not be started. Please try again or check the deployment logs.");
  });
});
