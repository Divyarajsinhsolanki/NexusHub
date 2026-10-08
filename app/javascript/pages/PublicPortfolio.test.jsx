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
    expect(html).toContain("Flagship Case Study");
    expect(html).toContain("Feature Map");
    expect(html).toContain(
      "A large product, organized for a fast technical review.",
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

  it("moves gallery controls one card at a time without skipping the middle feature", () => {
    const { container } = render(portfolio());
    const gallery = container.querySelector("[data-portfolio-gallery]");
    const viewport = gallery.querySelector("[data-gallery-viewport]");
    const track = gallery.querySelector("[data-gallery-track]");
    const dimension = (element, name, value) =>
      Object.defineProperty(element, name, { configurable: true, value });
    gallery.dataset.galleryPinned = "true";
    gallery.getBoundingClientRect = () => ({ top: 1900 });
    dimension(gallery, "offsetHeight", 1800);
    dimension(viewport, "clientWidth", 1000);
    dimension(track, "scrollWidth", 2000);
    [...track.children].forEach((card, index) => {
      dimension(card, "offsetWidth", 360);
      dimension(card, "offsetLeft", index * 384);
    });
    const originalHeight = window.innerHeight;
    dimension(window, "innerHeight", 800);
    const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    try {
      fireEvent.click(screen.getByRole("button", { name: "Next feature" }));
      expect(scroll).toHaveBeenLastCalledWith({
        top: 2284,
        behavior: "smooth",
      });
      gallery.style.setProperty("--gallery-shift", "-384px");
      gallery.style.setProperty("--gallery-progress", "0.384");
      fireEvent.click(screen.getByRole("button", { name: "Next feature" }));
      expect(scroll).toHaveBeenLastCalledWith({
        top: 2668,
        behavior: "smooth",
      });
      gallery.style.setProperty("--gallery-shift", "-768px");
      gallery.style.setProperty("--gallery-progress", "0.768");
      fireEvent.click(screen.getByRole("button", { name: "Previous feature" }));
      expect(scroll).toHaveBeenLastCalledWith({
        top: 2284,
        behavior: "smooth",
      });
    } finally {
      dimension(window, "innerHeight", originalHeight);
    }
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
    const feature = container.querySelectorAll(".pf-feature-hitarea")[3];
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
