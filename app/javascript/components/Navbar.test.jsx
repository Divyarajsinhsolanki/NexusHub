// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

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

const user = {
  id: 1,
  email: "member@example.com",
  first_name: "Member",
  last_name: "User",
  profile_picture: null,
  roles: [{ name: "member" }],
};

describe("Navbar responsive behavior", () => {
  it("renders accessible mobile navigation controls", () => {
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
    expect(screen.getByRole("button", { name: /open profile menu/i }).getAttribute("aria-haspopup")).toBe("menu");
    expect(screen.getAllByRole("link", { name: /my work/i }).length).toBeGreaterThan(0);
  });
});
