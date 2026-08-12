// @vitest-environment jsdom
import React from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  fetchConversations: vi.fn(() => Promise.resolve({ data: { meta: { unread_count: 0 } } })),
}));
const cableMocks = vi.hoisted(() => ({ subscribeToUserChat: vi.fn(() => ({ unsubscribe: vi.fn() })) }));

vi.mock("./api", () => ({
  acknowledgeCallRing: vi.fn(),
  declineCall: vi.fn(),
  endCall: vi.fn(),
  fetchConversations: apiMocks.fetchConversations,
  joinCall: vi.fn(),
  leaveCall: vi.fn(),
  updateConversationReceipt: vi.fn(),
}));

vi.mock("../lib/chatCable", () => ({ subscribeToUserChat: cableMocks.subscribeToUserChat }));
vi.mock("./chat/LazyCallRoom", () => ({ default: () => null, preloadCallRoom: vi.fn() }));
vi.mock("../context/AuthContext", async () => {
  const ReactModule = await import("react");
  return { AuthContext: ReactModule.createContext({ isAuthenticated: false, user: null }) };
});

import { AuthContext } from "../context/AuthContext";
import ChatLauncher from "./ChatLauncher";

const auth = { isAuthenticated: true, user: { id: 7 } };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ChatLauncher route ownership", () => {
  it("does not duplicate chat data or cable subscriptions on Chat routes", () => {
    render(
      <MemoryRouter initialEntries={["/chat/11"]}>
        <AuthContext.Provider value={auth}><ChatLauncher /></AuthContext.Provider>
      </MemoryRouter>
    );

    expect(apiMocks.fetchConversations).not.toHaveBeenCalled();
    expect(cableMocks.subscribeToUserChat).not.toHaveBeenCalled();
  });

  it("keeps unread and call subscriptions active outside Chat", async () => {
    render(
      <MemoryRouter initialEntries={["/projects"]}>
        <AuthContext.Provider value={auth}><ChatLauncher /></AuthContext.Provider>
      </MemoryRouter>
    );

    await waitFor(() => expect(apiMocks.fetchConversations).toHaveBeenCalledTimes(1));
    expect(cableMocks.subscribeToUserChat).toHaveBeenCalledTimes(1);
  });
});
