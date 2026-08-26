// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("framer-motion", async () => {
  const ReactModule = await import("react");
  const stripMotionProps = ({
    animate,
    exit,
    initial,
    layoutId,
    transition,
    whileHover,
    whileTap,
    ...props
  }) => props;

  return {
    AnimatePresence: ({ children }) => <>{children}</>,
    motion: new Proxy(
      {},
      {
        get: (_target, tag) =>
          ReactModule.forwardRef(({ children, ...props }, ref) =>
            ReactModule.createElement(tag, { ...stripMotionProps(props), ref }, children)
          ),
      }
    ),
    useMotionValueEvent: vi.fn(),
    useScroll: () => ({ scrollY: {} }),
  };
});

vi.mock("./api", () => ({
  fetchProjects: vi.fn(() => Promise.resolve({ data: [] })),
  fetchCalendarEvents: vi.fn(() => Promise.resolve({ data: [] })),
  getIssues: vi.fn(() => Promise.resolve({ data: [] })),
  SchedulerAPI: {
    getTasks: vi.fn(() => Promise.resolve({ data: [] })),
    getTaskLogs: vi.fn(() => Promise.resolve({ data: [] })),
  },
}));

vi.mock("./NotificationCenter", () => ({
  default: () => <button type="button" aria-label="Notifications" />,
}));

vi.mock("../context/AuthContext", async () => {
  const ReactModule = await import("react");
  return { AuthContext: ReactModule.createContext({ user: null, handleLogout: vi.fn() }) };
});

import { AuthContext } from "../context/AuthContext";
import Navbar from "./Navbar";

afterEach(() => cleanup());

const user = {
  id: 1,
  email: "member@example.com",
  first_name: "Member",
  last_name: "User",
  profile_picture: null,
  roles: [{ name: "member" }],
};

const LocationProbe = () => {
  const location = useLocation();
  return <output aria-label="Current search">{location.search}</output>;
};

describe("Navbar responsive behavior", () => {
  it("renders accessible mobile navigation controls", () => {
    window.localStorage.clear();
    render(
      <MemoryRouter initialEntries={["/my-work"]}>
        <AuthContext.Provider value={{ user, handleLogout: vi.fn() }}>
          <Navbar />
        </AuthContext.Provider>
      </MemoryRouter>
    );

    const openButton = screen.getByRole("button", { name: /open navigation menu/i });
    expect(openButton.getAttribute("aria-expanded")).toBe("false");
    expect(openButton.getAttribute("aria-controls")).toBe("mobile-navigation");
    expect(screen.queryByRole("button", { name: /open profile menu/i })).toBeNull();
    expect(screen.getByRole("button", { name: /open account menu/i }).getAttribute("aria-haspopup")).toBe("menu");
    expect(screen.getAllByRole("link", { name: /my work/i }).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /collapse navigation/i }));
    expect(window.localStorage.getItem("nexus:shell:nav-collapsed")).toBe("true");
    const primaryNavigation = screen.getByRole("complementary", { name: /primary navigation/i });
    expect(primaryNavigation.classList.contains("nexus-global-rail-collapsed")).toBe(true);
    expect(screen.getByRole("link", { name: /nexushub home/i }).querySelector("img")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^more$/i }));
    expect(screen.getByRole("dialog", { name: /mobile navigation/i }).getAttribute("aria-modal")).toBe("true");
    expect(openButton.getAttribute("aria-expanded")).toBe("true");
  });

  it("opens route context as an overlay drawer and restores focus on Escape", () => {
    render(
      <MemoryRouter initialEntries={["/projects"]}>
        <AuthContext.Provider value={{ user, handleLogout: vi.fn() }}>
          <Navbar />
        </AuthContext.Provider>
      </MemoryRouter>
    );

    const trigger = screen.getByRole("button", { name: /open context navigation/i });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: /context navigation/i })).toBeTruthy();
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: /context navigation/i })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps account actions in the top-right menu", () => {
    render(
      <MemoryRouter initialEntries={["/my-work"]}>
        <AuthContext.Provider value={{ user, handleLogout: vi.fn() }}>
          <Navbar />
        </AuthContext.Provider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /open account menu/i }));
    expect(screen.getByRole("menu", { name: /account/i })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /profile/i })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /settings/i })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /sign out/i })).toBeTruthy();
  });

  it("auto-opens a deep-linked inspector and clears only its selection", async () => {
    render(
      <MemoryRouter initialEntries={["/calendar?event_id=5&custom=yes"]}>
        <AuthContext.Provider value={{ user, handleLogout: vi.fn() }}>
          <Navbar />
          <LocationProbe />
        </AuthContext.Provider>
      </MemoryRouter>
    );

    expect(await screen.findByRole("dialog", { name: /workspace inspector/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /close inspector/i }));
    await waitFor(() => expect(screen.getByLabelText("Current search").textContent).toBe("?custom=yes"));
    expect(screen.queryByRole("dialog", { name: /workspace inspector/i })).toBeNull();
  });
});
