// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const { responseHandlers, errorHandlers } = vi.hoisted(() => ({ responseHandlers: [], errorHandlers: [] }));
vi.mock("axios", () => ({
  default: {
    create: () => ({
      interceptors: {
        request: { use: vi.fn() },
        response: { use: (success, failure) => { responseHandlers.push(success); errorHandlers.push(failure); } },
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

it("shows quota guidance while preserving status, retry headers and the error code", async () => {
  const error = { config: { skipAuthRetry: true }, response: { status: 429, headers: { "retry-after": "30" },
    data: { error: "resource_limit_exceeded", message: "PDF processors are busy. Try again shortly." } } };
  await expect(errorHandlers[0](error)).rejects.toBe(error);
  expect(error.response.data.error).toBe("PDF processors are busy. Try again shortly.");
  expect(error.response.data.code).toBe("resource_limit_exceeded");
  expect(error.response.headers["retry-after"]).toBe("30");
});
