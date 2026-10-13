import { expect, jest, test } from "@jest/globals";
import { fireEvent, render } from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";
import { VaultScreen } from "./VaultScreen";
let mockProps: any;
jest.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: 1, demo_account: false } }),
}));
jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn(async () => undefined),
}));
jest.mock("expo-router", () => ({
  useFocusEffect: (callback: any) =>
    require("react").useEffect(callback, [callback]),
}));
jest.mock("../components/EntityCollectionScreen", () => ({
  EntityCollectionScreen: (props: any) => {
    mockProps = props;
    return props.renderRecord({
      id: 1,
      title: "API key",
      category: "Token",
      content: "secret-value",
    });
  },
}));
jest.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: { data: [] } }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
  useMutation: () => ({ mutate: jest.fn(), isPending: false }),
}));
test("masks token values, supports explicit reveal/copy, and excludes secrets from drafts", async () => {
  const screen = await render(<VaultScreen />);
  expect(screen.queryByText("secret-value")).toBeNull();
  await fireEvent.press(screen.getByLabelText("Reveal API key"), {
    stopPropagation: jest.fn(),
  });
  expect(screen.getByText("secret-value")).toBeTruthy();
  await fireEvent.press(screen.getByLabelText("Copy API key"), {
    stopPropagation: jest.fn(),
  });
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith("secret-value");
  await fireEvent.press(screen.getByLabelText("Hide API key"), {
    stopPropagation: jest.fn(),
  });
  expect(screen.queryByText("secret-value")).toBeNull();
  expect(
    mockProps.fields.find((field: any) => field.key === "content").secure,
  ).toBe(true);
  expect(mockProps.params).toEqual({ categories: [], sort: "recent" });
  await screen.unmount();
});
test("project vault retains edit permissions and project-scoped paths", async () => {
  const screen = await render(<VaultScreen projectId={9} canWrite={false} />);
  expect(mockProps.canWrite).toBe(false);
  expect(mockProps.path).toBe("/projects/9/vault_items");
  expect(mockProps.wrapper).toBe("project_vault_item");
  expect(
    mockProps.fields.some(
      (field: any) => field.key === "project_environment_id",
    ),
  ).toBe(true);
  await screen.unmount();
});
