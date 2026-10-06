// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const { responseHandlers } = vi.hoisted(() => ({ responseHandlers: [] }));
vi.mock("axios", () => ({
  default: {
    create: () => ({
      interceptors: {
        request: { use: vi.fn() },
        response: { use: (success) => responseHandlers.push(success) },
      },
    }),
  },
}));
vi.mock("react-hot-toast", () => ({ toast: { error: vi.fn() } }));
import "./api";

describe("browser session CSRF rotation", () => {
  beforeEach(() => {
    document.head.innerHTML = '<meta name="csrf-token" content="previous-session-token">';
  });

  it("uses the new session token returned after login or logout", () => {
    const response = { headers: { "x-csrf-token": "new-session-token" } };
    expect(responseHandlers[0](response)).toBe(response);
    expect(document.querySelector('meta[name="csrf-token"]').content).toBe("new-session-token");
  });

  it("preserves the token on ordinary API responses", () => {
    responseHandlers[0]({ headers: {} });
    expect(document.querySelector('meta[name="csrf-token"]').content).toBe("previous-session-token");
  });
});
