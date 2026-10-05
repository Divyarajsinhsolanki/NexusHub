// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../context/AuthContext";
import Login from "./Login";

vi.mock("../context/AuthContext", () => ({ AuthContext: React.createContext({}) }));
vi.mock("../firebaseFlags", () => ({ firebaseEnabled: false }));
vi.mock("../components/landing/WorkspaceOrb", () => ({ default: () => null }));
afterEach(cleanup);
const setup = (handleLogin) => render(
  <MemoryRouter initialEntries={["/login?return_to=%2Fprojects"]}>
    <AuthContext.Provider value={{ handleLogin }}><Login /></AuthContext.Provider>
  </MemoryRouter>
);
const fill = () => {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "person@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret" } });
};
describe("Login", () => {
  it("reveals the password without submitting the form", () => {
    const login = vi.fn(); setup(login); fill();
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByLabelText("Password").type).toBe("text");
    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(screen.getByLabelText("Password").type).toBe("password");
    expect(login).not.toHaveBeenCalled();
  });
  it("blocks repeat submissions while preserving the return path", async () => {
    let finish;
    const login = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    setup(login); fill();
    const form = screen.getByRole("button", { name: "Sign in" }).closest("form");
    fireEvent.submit(form); fireEvent.submit(form);
    expect(login).toHaveBeenCalledExactlyOnceWith({ auth: { email: "person@example.com", password: "secret" } }, "/projects");
    expect(screen.getByRole("button", { name: "Signing in…" }).disabled).toBe(true);
    finish();
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign in" }).disabled).toBe(false));
  });
  it("announces failures and clears stale errors when credentials change", async () => {
    setup(vi.fn().mockRejectedValue(new Error("Unauthorized"))); fill();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Password").getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "corrected" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
