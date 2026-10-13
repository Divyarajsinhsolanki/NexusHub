import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { FullCalendarScreen } from "./CalendarScreen";
import { Platform } from "react-native";
import { endpoints } from "../api/endpoints";
jest.mock("@react-native-picker/picker", () => ({
  Picker: Object.assign(
    ({ children, ...props }: any) =>
      require("react").createElement(
        require("react-native").View,
        props,
        children,
      ),
    { Item: () => null },
  ),
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ back: jest.fn(), setParams: jest.fn() }),
}));
jest.mock("../components/Screen", () => ({
  Screen: ({ children, header }: any) => (
    <>
      {header}
      {children}
    </>
  ),
}));
jest.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: 1, demo_account: false } }),
}));
jest.mock("../api/endpoints", () => ({
  endpoints: {
    calendarEvents: jest.fn(),
    projects: jest.fn(),
    createCalendarEvent: jest.fn(),
    updateCalendarEvent: jest.fn(),
    deleteCalendarEvent: jest.fn(),
  },
}));
beforeEach(() => {
  Object.defineProperty(Platform, "OS", {
    configurable: true,
    value: "android",
  });
  jest.clearAllMocks();
  jest
    .mocked(endpoints.calendarEvents)
    .mockResolvedValue({ data: [] } as never);
  jest.mocked(endpoints.projects).mockResolvedValue([]);
  jest.mocked(endpoints.createCalendarEvent).mockResolvedValue({});
});
test("Android uses separate date/time controls and sends recurrence count", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const screen = await render(
    <QueryClientProvider client={client}>
      <FullCalendarScreen />
    </QueryClientProvider>,
  );
  await fireEvent.press(screen.getByLabelText("Create event"));
  await fireEvent.changeText(screen.getByLabelText("Title"), "Weekly review");
  await fireEvent(screen.getByLabelText("Recurrence"), "valueChange", "weekly");
  await fireEvent.changeText(
    screen.getByLabelText("Additional occurrences (1–30)"),
    "6",
  );
  expect(screen.getByLabelText("Starts date")).toBeTruthy();
  expect(screen.getByLabelText("Starts time")).toBeTruthy();
  await fireEvent.press(screen.getByText("Save event"));
  await waitFor(() =>
    expect(endpoints.createCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Weekly review",
        recurrence_rule: "weekly",
        recurrence_count: 6,
      }),
    ),
  );
  await screen.unmount();
  client.clear();
});
