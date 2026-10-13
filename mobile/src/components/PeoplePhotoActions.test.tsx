import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import * as ImagePicker from "expo-image-picker";
import { api } from "../api/client";
import { PeoplePhotoActions } from "./PeoplePhotoActions";
let mockDemo = false;
jest.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: 1, demo_account: mockDemo, permissions: ["users.manage"] },
  }),
}));
jest.mock("expo-image-picker", () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock("../api/client", () => ({
  api: { patch: jest.fn() },
  apiErrorMessage: (error: Error) => error.message,
}));
beforeEach(() => {
  jest.clearAllMocks();
  mockDemo = false;
});
test("uploads the selected photo to the existing user endpoint", async () => {
  jest
    .mocked(ImagePicker.launchImageLibraryAsync)
    .mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///profile.jpg",
          fileName: "profile.jpg",
          mimeType: "image/jpeg",
        },
      ],
    } as never);
  jest.mocked(api.patch).mockResolvedValue({ data: {} });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const screen = await render(
    <QueryClientProvider client={client}>
      <PeoplePhotoActions userId={9} />
    </QueryClientProvider>,
  );
  await fireEvent.press(screen.getByText("Change profile photo"));
  await waitFor(() =>
    expect(api.patch).toHaveBeenCalledWith("/users/9", expect.any(FormData)),
  );
  expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(
    expect.objectContaining({ aspect: [1, 1], allowsEditing: true }),
  );
  await screen.unmount();
  client.clear();
});
test("demo users cannot upload photos", async () => {
  mockDemo = true;
  const client = new QueryClient();
  const screen = await render(
    <QueryClientProvider client={client}>
      <PeoplePhotoActions userId={9} />
    </QueryClientProvider>,
  );
  expect(screen.queryByText("Change cover photo")).toBeNull();
  await screen.unmount();
  client.clear();
});
