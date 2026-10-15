// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import WorkspaceIntegrations from "./WorkspaceIntegrations";
import { AuthContext } from "../../context/AuthContext";
import api from "../api";
vi.mock("../../context/AuthContext", async () => ({ AuthContext: (await import("react")).createContext(null) }));
vi.mock("../api", () => ({ default: { get: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: [{ provider: "slack", configured: true, settings: {} }] });
  api.put.mockResolvedValue({ data: { configured: true } });
  api.delete.mockResolvedValue({});
});
it("hides workspace secrets management from members", () => {
  render(<AuthContext.Provider value={{ user: { permissions: [] } }}><WorkspaceIntegrations /></AuthContext.Provider>);
  expect(screen.queryByText("Workspace connections")).toBeNull();
  expect(api.get).not.toHaveBeenCalled();
});
it("submits only the new credential and clears it after saving", async () => {
  render(<AuthContext.Provider value={{ user: { id: 1, workspace: { id: 2 }, permissions: ["integrations.manage"] } }}><WorkspaceIntegrations /></AuthContext.Provider>);
  await screen.findByText("Configured");
  fireEvent.change(screen.getByLabelText("Connection"), { target: { value: "slack" } });
  const input = screen.getByLabelText("Slack incoming webhook URL");
  expect(input.getAttribute("type")).toBe("password");
  fireEvent.change(input, { target: { value: "https://hooks.slack.com/services/T/B/secret" } });
  fireEvent.click(screen.getByText("Save connection"));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith("/workspace_integrations/slack", { integration: { credential: "https://hooks.slack.com/services/T/B/secret" } }));
  await screen.findByRole("status");
  expect(input.value).toBe("");
  fireEvent.click(screen.getByText("Disconnect Slack"));
  await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/workspace_integrations/slack"));
});
