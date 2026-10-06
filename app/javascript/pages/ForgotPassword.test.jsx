// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { requestPasswordReset } from "../components/api";
import ForgotPassword from "./ForgotPassword";
vi.mock("../components/api", () => ({ requestPasswordReset: vi.fn() }));
vi.mock("../components/landing/WorkspaceOrb", () => ({ default: () => null }));
vi.mock("../components/ui/AuthWorkspaceScene", () => ({ default: () => <div>Workspace scene</div> }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const setup = () => render(<MemoryRouter initialEntries={["/forgot-password"]}><Routes><Route path="/forgot-password" element={<ForgotPassword />} /><Route path="/login" element={<p>Sign-in destination</p>} /></Routes></MemoryRouter>);
it("prevents duplicate reset requests and shows account-safe confirmation", async () => {
  let finish;
  requestPasswordReset.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  setup();
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "user@example.com" } });
  const form = screen.getByRole("button", { name: "Send reset email" }).closest("form");
  fireEvent.submit(form); fireEvent.submit(form);
  expect(requestPasswordReset).toHaveBeenCalledExactlyOnceWith("user@example.com");
  expect(screen.getByRole("button", { name: "Sending…" }).disabled).toBe(true);
  finish();
  expect((await screen.findByRole("status")).textContent).toContain("If an account exists");
});
it("returns to the login route", () => {
  setup(); fireEvent.click(screen.getByRole("button", { name: "Back to sign in" }));
  expect(screen.getByText("Sign-in destination")).toBeTruthy();
});
