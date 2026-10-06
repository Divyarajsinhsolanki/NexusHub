// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("../components/api", () => ({
  fetchItems: vi.fn(async () => ({ data: [
    { id: 1, title: "Deploy command", category: "Command", content: "run deploy" },
    { id: 2, title: "Team notes", category: "Note", content: "Release checklist" },
  ] })), createItem: vi.fn(), updateItem: vi.fn(), deleteItem: vi.fn(),
}));
import Vault from "./Vault";
afterEach(cleanup);
it("keeps category filters, search, and editing accessible in the compact vault", async () => {
  render(<Vault />);
  await screen.findByText("Deploy command");
  expect(screen.getByRole("heading", { name: "Vault" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Edit Deploy command" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Secure Notes" }));
  await waitFor(() => expect(screen.queryByText("Deploy command")).toBeNull());
  expect(screen.getByText("Team notes")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "All Items" }));
  fireEvent.change(screen.getByRole("searchbox", { name: "Search vault" }), { target: { value: "Deploy" } });
  await waitFor(() => expect(screen.queryByText("Team notes")).toBeNull());
  expect(screen.getByText("Deploy command")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Edit Deploy command" }));
  expect(screen.getByText("Edit Item")).toBeTruthy();
});
