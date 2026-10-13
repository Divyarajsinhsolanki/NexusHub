import { expect, jest, test } from "@jest/globals";
import { api } from "./client";
import { endpoints } from "./endpoints";
jest.mock("./client", () => ({
  api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
test("calendar transfer preserves plain ICS and imports through the existing API", async () => {
  const ics = "BEGIN:VCALENDAR\nEND:VCALENDAR";
  jest.mocked(api.get).mockResolvedValue({ data: ics });
  expect(await endpoints.exportCalendarIcs()).toBe(ics);
  expect(api.get).toHaveBeenCalledWith("/calendar_events/export_ics", {
    responseType: "text",
  });
  jest
    .mocked(api.post)
    .mockResolvedValue({ data: { imported_count: 1, events: [] } });
  expect(await endpoints.importCalendarIcs(ics)).toEqual({
    imported_count: 1,
    events: [],
  });
  expect(api.post).toHaveBeenCalledWith("/calendar_events/import_ics", { ics });
});
test("dated work links retain server pagination and date filtering", async () => {
  jest
    .mocked(api.get)
    .mockResolvedValue({ data: { data: [], meta: { next_page: 3 } } });
  await endpoints.workLogs(2, "2026-10-13");
  expect(api.get).toHaveBeenCalledWith("/work_logs", {
    params: { page: 2, per_page: 30, date: "2026-10-13" },
  });
});
