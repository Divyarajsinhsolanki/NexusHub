import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { PlanningScreen } from "./PlanningScreen";
import { endpoints } from "../api/endpoints";
const mockPush = jest.fn();
let mockDemo = false;
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));
jest.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ user: { demo_account: mockDemo } }),
}));
jest.mock("../components/Screen", () => ({
  Screen: ({ children, header }: any) => (
    <>
      {header}
      {children}
    </>
  ),
}));
jest.mock("../api/endpoints", () => ({
  endpoints: { calendarEvents: jest.fn(), workLogs: jest.fn() },
}));
beforeEach(() => {
  jest.clearAllMocks();
  mockDemo = false;
  jest
    .mocked(endpoints.calendarEvents)
    .mockResolvedValue({
      data: [
        { id: 9, title: "Daily meeting", start_at: "2026-10-13T10:00:00Z" },
      ],
    } as never);
  jest
    .mocked(endpoints.workLogs)
    .mockResolvedValue({
      data: [{ id: 8, title: "Implementation", start_time: "09:00" }],
    } as never);
});
test("keeps the selected day in creation and work detail links", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const screen = await render(
    <QueryClientProvider client={client}>
      <PlanningScreen />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getByText("Implementation")).toBeTruthy());
  const day = jest.mocked(endpoints.workLogs).mock.calls[0][1];
  await fireEvent.press(screen.getByText("Implementation"));
  expect(mockPush).toHaveBeenCalledWith(`/work?mode=logs&date=${day}&logId=8`);
  await fireEvent.press(screen.getByText("Add work entry"));
  expect(mockPush).toHaveBeenCalledWith(`/create?type=work_log&date=${day}`);
  await fireEvent.press(screen.getByLabelText("Next day"));
  await waitFor(() =>
    expect(jest.mocked(endpoints.workLogs).mock.calls.at(-1)?.[1]).not.toBe(
      day,
    ),
  );
  await screen.unmount();
  client.clear();
});
test("demo planning hides creation actions", async () => {
  mockDemo = true;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const screen = await render(
    <QueryClientProvider client={client}>
      <PlanningScreen />
    </QueryClientProvider>,
  );
  expect(screen.queryByText("Add event")).toBeNull();
  await screen.unmount();
  client.clear();
});
