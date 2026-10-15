// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../context/AuthContext", async () => {
  const ReactModule = await import("react");
  return { AuthContext: ReactModule.createContext({}) };
});

vi.mock("../components/api", () => ({
  fetchPortfolio: vi.fn(() => new Promise(() => {})),
  sendContact: vi.fn(),
}));

import { fetchPortfolio } from "../components/api";
import { AuthContext } from "../context/AuthContext";
import PublicPortfolio from "./PublicPortfolio";

const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  Element.prototype,
  "scrollIntoView",
);

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (originalScrollIntoView)
    Object.defineProperty(
      Element.prototype,
      "scrollIntoView",
      originalScrollIntoView,
    );
  else delete Element.prototype.scrollIntoView;
});

const portfolio = (handleDemoLogin = vi.fn()) => (
  <HelmetProvider>
    <MemoryRouter>
      <AuthContext.Provider value={{ handleDemoLogin }}>
        <PublicPortfolio />
      </AuthContext.Provider>
    </MemoryRouter>
  </HelmetProvider>
);

describe("PublicPortfolio", () => {
  it("renders the flagship case study and six guided feature areas", () => {
    const html = renderToStaticMarkup(portfolio());

    expect(html).toContain("Divyarajsinh Solanki");
    expect(html).toContain("Nexus Hub");
    expect(html).toContain("About Divyarajsinh Solanki");
    expect(html).toContain("Engineering experience");
    expect(html).toContain("Engineering achievements");
    expect(html).toContain("Skills");
    expect(html).toContain("Flagship Case Study");
    expect(html).toContain("Product walkthrough");
    expect(html).toContain(
      "Choose a product area to inspect its interface and purpose.",
    );
    expect(html).toContain("Project Delivery");
    expect(html).toContain("Planning and Focus");
    expect(html).toContain("Collaboration");
    expect(html).toContain("Knowledge");
    expect(html).toContain("Documents");
    expect(html).toContain("Platform");
    expect(html).toContain("Architecture");
    expect(html).toContain("Contact");
  });

  it("closes mobile navigation on Escape and when a section is selected", () => {
    render(portfolio());
    const open = screen.getByRole("button", { name: "Open navigation" });
    expect(open.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(open);
    expect(
      screen
        .getByRole("button", { name: "Close navigation" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(
      screen.getByRole("navigation", { name: "Mobile portfolio" }),
    ).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(
      screen.queryByRole("navigation", { name: "Mobile portfolio" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    fireEvent.click(
      within(
        screen.getByRole("navigation", { name: "Mobile portfolio" }),
      ).getByRole("link", { name: /About/ }),
    );
    expect(
      screen.queryByRole("navigation", { name: "Mobile portfolio" }),
    ).toBeNull();
    expect(
      document.getElementById("about").scrollIntoView,
    ).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(
      screen
        .getByRole("button", { name: "Open navigation" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("selects product areas without launching a demo and opens the matching screen", async () => {
    const login = vi.fn().mockResolvedValue(undefined);
    render(portfolio(login));
    const selector = screen.getByRole("group", { name: "Product areas" });
    const buttons = within(selector).getAllByRole("button");
    expect(buttons[0].getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(selector).getByRole("button", { name: /Documents/ }));
    expect(screen.getByRole("heading", { name: "PDF Master Workflows" })).toBeTruthy();
    expect(login).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Open live screen" }));
    await waitFor(() => expect(login).toHaveBeenCalledWith("/pdf-master"));
  });

  it("shows saved screenshots and review notes, and handles failed images", async () => {
    fetchPortfolio.mockResolvedValueOnce({ data: { projects: [{ title: "Nexus Hub", features: [
      { id: 2, position: 2, category: "Documents", title: "PDF tools", summary: "Document workflows", screenshot_url: "/pdf.webp", demo_path: "/pdf-master" },
      { id: 1, position: 1, category: "Planning", title: "Sprint planning", summary: "Plan delivery", screenshot_url: "/planning.webp", alt_text: "Sprint board", review_notes: "Workspace authorization", demo_path: "/projects" },
    ] }] } });
    render(portfolio());
    const image = await screen.findByRole("img", { name: "Sprint board" });
    expect(image.getAttribute("src")).toBe("/planning.webp");
    expect(screen.getByText("Workspace authorization", { selector: ".pf-review-note" })).toBeTruthy();
    fireEvent.error(image);
    expect(screen.getByText("Screenshot unavailable for Sprint planning.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Documents/ }));
    expect(screen.getByRole("img", { name: "PDF tools" }).getAttribute("src")).toBe("/pdf.webp");
  });

  it("presents expandable engineering details and selectable architecture", () => {
    const { container } = render(portfolio());
    const decisions = screen.getByText("Decisions", { selector: "summary" });
    expect(decisions.parentElement.open).toBe(false);
    fireEvent.click(decisions);
    expect(decisions.parentElement.open).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /The engine/ }));
    expect(screen.getByRole("button", { name: /The engine/ }).getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("#portfolio-layer-detail").textContent).toContain("workspace authorization");
    const sections = [...container.querySelectorAll("main > section")].map((section) => section.id);
    expect(sections).toEqual(["top", "case-study", "features", "decisions", "architecture", "about", "contact"]);
  });

  it("keeps controls keyboard accessible and honors reduced-motion navigation", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    vi.stubGlobal("matchMedia", vi.fn((query) => ({ matches: query.includes("prefers-reduced-motion"), addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    render(portfolio());
    const documents = screen.getByRole("button", { name: /Documents/ });
    documents.focus();
    await user.keyboard("{Enter}");
    expect(documents.getAttribute("aria-pressed")).toBe("true");
    const summary = screen.getByText("Constraints", { selector: "summary" });
    summary.focus();
    expect(summary.tagName).toBe("SUMMARY");
    // Native summary activation is supplied by browsers, not jsdom keyboard defaults.
    fireEvent.click(summary);
    expect(summary.parentElement.open).toBe(true);
    fireEvent.click(screen.getByRole("link", { name: /Explore my work/ }));
    expect(document.getElementById("case-study").scrollIntoView).toHaveBeenCalledWith({ behavior: "instant", block: "start" });
  });

  it("uses saved résumé links and avoids inventing project details when data is missing", async () => {
    fetchPortfolio.mockResolvedValueOnce({ data: { profile: { resume_url: "/resume.pdf" }, projects: [{ title: "Independent project", features: [], case_study: {} }] } });
    render(portfolio());
    const resume = await screen.findByRole("link", { name: /View résumé/ });
    expect(resume.getAttribute("href")).toBe("/resume.pdf");
    expect(screen.getByRole("status").textContent).toContain("No product walkthroughs are available yet");
    expect(screen.queryByText("Constraints", { selector: "summary" })).toBeNull();
    expect(screen.queryByText("Single-server PostgreSQL and Redis reduce cost now but can move to managed AWS services later")).toBeNull();
  });

  it("offers chapter navigation and a motion pause control without hiding work", () => {
    render(portfolio());
    const chapters = screen.getByRole("navigation", { name: "Scroll chapters" });
    expect(within(chapters).getAllByRole("link")).toHaveLength(7);
    fireEvent.click(within(chapters).getByRole("link", { name: "Architecture" }));
    expect(document.getElementById("architecture").scrollIntoView).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Pause visual motion" }));
    expect(screen.getByRole("button", { name: "Resume visual motion" }).getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector(".pf-page").dataset.reducedMotion).toBe("true");
    expect(document.querySelector(".pf-product-video").tagName).toBe("IMG");
    expect(screen.getByRole("button", { name: "Explore Nexus Hub" })).toBeTruthy();
  });

  it("prevents duplicate demo launches, announces errors, and allows a feature retry", async () => {
    let rejectLaunch;
    const handleDemoLogin = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectLaunch = reject;
          }),
      )
      .mockResolvedValueOnce(undefined);
    const { container } = render(portfolio(handleDemoLogin));
    fireEvent.click(screen.getByRole("button", { name: "Explore Nexus Hub" }));
    expect(handleDemoLogin).toHaveBeenCalledWith("/demo");
    const loadingButton = screen.getByRole("button", {
      name: "Starting demo…",
    });
    expect(loadingButton.disabled).toBe(true);
    const feature = screen.getByRole("button", { name: "Open live screen" });
    expect(feature.disabled).toBe(true);
    fireEvent.click(feature);
    expect(handleDemoLogin).toHaveBeenCalledOnce();

    await act(async () =>
      rejectLaunch({ response: { data: { error: "demo_disabled" } } }),
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "The live demo is not enabled on this deployment.",
    );
    expect(
      screen.getByRole("button", { name: "Explore Nexus Hub" }).disabled,
    ).toBe(false);
    expect(feature.disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss demo error" }));
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Knowledge/ }));
    fireEvent.click(feature);
    await waitFor(() =>
      expect(handleDemoLogin).toHaveBeenLastCalledWith("/knowledge"),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Explore Nexus Hub" }).disabled,
      ).toBe(false),
    );
    expect(handleDemoLogin).toHaveBeenCalledTimes(2);
  });
});

it("shows saved GitHub and LinkedIn URLs once in the header and once in the contact section", async () => {
  fetchPortfolio.mockResolvedValueOnce({ data: { profile: { social_links: { github: "https://github.com/example", linkedin: "https://www.linkedin.com/in/example/" } } } });
  render(portfolio());
  await waitFor(() => expect(screen.getAllByRole("link", { name: "LinkedIn" })).toHaveLength(2));
  expect(screen.getAllByRole("link", { name: "GitHub" })).toHaveLength(2);
  for (const link of screen.getAllByRole("link", { name: "LinkedIn" })) expect(link.getAttribute("href")).toBe("https://www.linkedin.com/in/example/");
  expect(document.querySelector('script[data-portfolio-recaptcha="true"]')).toBeNull();
});
