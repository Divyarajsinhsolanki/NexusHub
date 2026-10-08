// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
vi.mock("../components/api", () => ({
  fetchCalendarEvents: vi.fn(async () => ({ data: [{ id: 1, title: "Team meeting", start_at: "2026-10-07T09:00:00", end_at: "2026-10-07T10:00:00", event_type: "meeting" }] })),
  getWorkLogs: vi.fn(async () => ({ data: [{ id: 2, title: "Build report", start_time: "10:00", end_time: "11:00" }] })),
  fetchDailyMomentum: vi.fn(async () => ({ data: { morning_briefing: { focus_tasks: [{ id: 3, title: "Review release", status: "doing", project_id: 4 }] } } })),
  createWorkLog: vi.fn(async () => ({ data: {} })), updateWorkLog: vi.fn(), deleteWorkLog: vi.fn(),
  createCalendarEvent: vi.fn(), updateCalendarEvent: vi.fn(), deleteCalendarEvent: vi.fn(),
}));
import Planning from "./Planning";
import { createWorkLog, getWorkLogs, fetchCalendarEvents } from "../components/api";
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const mount = () => render(<MemoryRouter initialEntries={["/planning?date=2026-10-07"]}><Planning /></MemoryRouter>);
describe("Planning", () => {
  it("opens managed operations records instead of editing their calendar projections", async () => {
    fetchCalendarEvents.mockResolvedValueOnce({ data: [{ id: 7, title: "Licence renewal", start_at: "2026-10-07T09:00:00", end_at: "2026-10-07T10:00:00", event_type: "deadline", managed_operation: true, operation_path: "/projects/4/dashboard?tab=environments&section=licenses&record=9" }] });
    mount();
    const link = await screen.findByRole("link", { name: "Open Licence renewal" });
    expect(link.getAttribute("href")).toBe("/projects/4/dashboard?tab=environments&section=licenses&record=9");
    expect(screen.queryByRole("button", { name: "Edit Licence renewal" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete Licence renewal" })).toBeNull();
  });
  it("combines events, work entries, and focus tasks for the selected day", async () => {
    mount();
    await screen.findByText("Team meeting");
    expect(screen.getByText("Build report")).toBeTruthy();
    expect(screen.getByText("Review release").getAttribute("href")).toBe("/projects/4/dashboard?task_id=3");
    expect(screen.getByText("1 events · 1h 0m logged")).toBeTruthy();
    expect(getWorkLogs).toHaveBeenCalledWith({ date: "2026-10-07", per_page: 100 });
    fireEvent.change(screen.getByLabelText("Go to date"), { target: { value: "2026-10-08" } });
    await waitFor(() => expect(getWorkLogs).toHaveBeenLastCalledWith({ date: "2026-10-08", per_page: 100 }));
  });
  it("creates a work entry and refreshes the shared agenda", async () => {
    mount(); await screen.findByText("Team meeting");
    fireEvent.click(screen.getByText("Log work"));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Write proposal" } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(createWorkLog).toHaveBeenCalledWith(expect.objectContaining({ title: "Write proposal", log_date: "2026-10-07", start_time: "09:00", end_time: "10:00" })));
    await waitFor(() => expect(fetchCalendarEvents).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
