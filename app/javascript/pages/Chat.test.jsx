// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  fetchConversations: vi.fn(),
  fetchConversation: vi.fn(),
  fetchConversationMessages: vi.fn(),
  fetchConversationSummary: vi.fn(),
  addConversationParticipants: vi.fn(),
  removeConversationParticipant: vi.fn(),
  updateConversation: vi.fn(),
  leaveConversation: vi.fn(),
  getUsers: vi.fn(),
  getTasks: vi.fn(),
  updatePresence: vi.fn(),
  updateConversationReceipt: vi.fn(),
}));

const cableMocks = vi.hoisted(() => ({
  conversationCallback: null,
  statusCallback: null,
  sendToConversation: vi.fn(),
}));

const callMocks = vi.hoisted(() => ({ preloadCallRoom: vi.fn() }));

vi.mock("framer-motion", async () => {
  const ReactModule = await import("react");
  const stripMotionProps = ({ animate, exit, initial, transition, whileHover, whileTap, ...props }) => props;
  return {
    AnimatePresence: ({ children }) => <>{children}</>,
    motion: new Proxy({}, {
      get: (_target, tag) => ReactModule.forwardRef(({ children, ...props }, ref) => (
        ReactModule.createElement(tag, { ...stripMotionProps(props), ref }, children)
      )),
    }),
  };
});

vi.mock("../components/api", () => ({
  SchedulerAPI: { getTasks: apiMocks.getTasks },
  addConversationParticipants: apiMocks.addConversationParticipants,
  addMessageReaction: vi.fn(),
  acknowledgeCallRing: vi.fn(() => Promise.resolve({ data: {} })),
  createConversation: vi.fn(),
  createCall: vi.fn(),
  declineCall: vi.fn(),
  deleteConversation: vi.fn(),
  deleteConversationForEveryone: vi.fn(),
  endCall: vi.fn(),
  fetchConversation: apiMocks.fetchConversation,
  fetchConversationMessages: apiMocks.fetchConversationMessages,
  fetchConversationSummary: apiMocks.fetchConversationSummary,
  fetchConversations: apiMocks.fetchConversations,
  getUsers: apiMocks.getUsers,
  joinCall: vi.fn(),
  leaveConversation: apiMocks.leaveConversation,
  leaveCall: vi.fn(),
  muteConversation: vi.fn(),
  removeConversationParticipant: apiMocks.removeConversationParticipant,
  removeMessageReaction: vi.fn(),
  sendMessage: vi.fn(),
  startDirectConversation: vi.fn(),
  unmuteConversation: vi.fn(),
  updateConversation: apiMocks.updateConversation,
  updateConversationReceipt: apiMocks.updateConversationReceipt,
  updatePresence: apiMocks.updatePresence,
}));

vi.mock("../components/chat/LazyCallRoom", () => ({
  default: () => null,
  preloadCallRoom: callMocks.preloadCallRoom,
}));

vi.mock("../lib/chatCable", () => ({
  ensureCableConnection: vi.fn(),
  sendToConversation: cableMocks.sendToConversation,
  subscribeToCableStatus: vi.fn((callback) => {
    cableMocks.statusCallback = callback;
    return { unsubscribe: vi.fn() };
  }),
  subscribeToConversationChat: vi.fn((_id, callback) => {
    cableMocks.conversationCallback = callback;
    return { unsubscribe: vi.fn() };
  }),
  subscribeToPresence: vi.fn(() => ({ unsubscribe: vi.fn() })),
  subscribeToUserChat: vi.fn(() => ({ unsubscribe: vi.fn() })),
}));

vi.mock("../context/AuthContext", async () => {
  const ReactModule = await import("react");
  return { AuthContext: ReactModule.createContext({ user: null }) };
});

import { AuthContext } from "../context/AuthContext";
import Chat from "./Chat";

const user = { id: 1, first_name: "Current", last_name: "User", email: "current@example.com" };
const conversation = {
  id: 1,
  title: "Direct conversation",
  conversation_type: "direct",
  unread_count: 0,
  participants: [
    { id: 1, name: "Current User" },
    { id: 2, name: "Anita Rao", last_seen_at: new Date().toISOString() },
  ],
  messages: [
    { id: 10, conversation_id: 1, user_id: 2, user_name: "Anita Rao", body: "Initial message", created_at: "2026-08-12T08:00:00Z", reactions: {}, reacted_emojis: [] },
  ],
  messages_meta: { has_more: false, per_page: 50 },
};

const groupConversation = {
  ...conversation,
  title: "Design Guild",
  conversation_type: "group",
  creator_id: 1,
  can_manage_members: true,
  can_edit_group: true,
  can_leave_group: false,
  participants: [
    { id: 1, name: "Current User", is_creator: true },
    { id: 2, name: "Anita Rao", is_creator: false, last_seen_at: new Date().toISOString() },
  ],
};

const renderChat = () => render(
  <MemoryRouter initialEntries={["/chat/1"]}>
    <AuthContext.Provider value={{ user }}>
      <Routes><Route path="/chat/:conversationId" element={<Chat />} /></Routes>
    </AuthContext.Provider>
  </MemoryRouter>
);

beforeEach(() => {
  vi.clearAllMocks();
  cableMocks.conversationCallback = null;
  cableMocks.statusCallback = null;
  apiMocks.fetchConversations.mockResolvedValue({ data: { data: [conversation], meta: { unread_count: 0 } } });
  apiMocks.fetchConversation.mockResolvedValue({ data: conversation });
  apiMocks.fetchConversationMessages.mockResolvedValue({ data: { data: [], meta: { has_more: false } } });
  apiMocks.fetchConversationSummary.mockResolvedValue({ data: conversation });
  apiMocks.getUsers.mockResolvedValue({ data: [] });
  apiMocks.getTasks.mockResolvedValue({ data: [] });
  apiMocks.updatePresence.mockResolvedValue({ data: { online: true, last_seen_at: new Date().toISOString() } });
  apiMocks.updateConversationReceipt.mockResolvedValue({ data: {} });
  apiMocks.addConversationParticipants.mockResolvedValue({ data: groupConversation });
  apiMocks.removeConversationParticipant.mockResolvedValue({ data: groupConversation });
  apiMocks.updateConversation.mockResolvedValue({ data: groupConversation });
  apiMocks.leaveConversation.mockResolvedValue({ data: { success: true } });
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: { height: 700, addEventListener: vi.fn(), removeEventListener: vi.fn() },
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

afterEach(() => cleanup());

describe("mobile chat performance behavior", () => {
  it("defers optional data and sends one typing-start event per burst", async () => {
    renderChat();
    const composer = await screen.findByPlaceholderText("Write a message...");

    expect(apiMocks.getUsers).not.toHaveBeenCalled();
    expect(apiMocks.getTasks).not.toHaveBeenCalled();
    expect(apiMocks.fetchConversations).not.toHaveBeenCalled();
    expect(callMocks.preloadCallRoom).not.toHaveBeenCalled();

    fireEvent.change(composer, { target: { value: "H" } });
    fireEvent.change(composer, { target: { value: "He" } });
    fireEvent.change(composer, { target: { value: "Hello" } });

    const typingStarts = cableMocks.sendToConversation.mock.calls.filter(([, action, payload]) => action === "typing" && payload.is_typing);
    expect(typingStarts).toHaveLength(1);

    fireEvent.change(composer, { target: { value: "@an" } });
    await waitFor(() => expect(apiMocks.getUsers).toHaveBeenCalledTimes(1));
    expect(apiMocks.getTasks).not.toHaveBeenCalled();
  });

  it("merges a realtime message without redundant HTTP reconciliation", async () => {
    renderChat();
    await screen.findByText("Initial message");
    expect(cableMocks.conversationCallback).toBeTypeOf("function");
    apiMocks.fetchConversationSummary.mockClear();
    apiMocks.fetchConversationMessages.mockClear();

    await act(async () => {
      cableMocks.conversationCallback({
        type: "message_created",
        conversation_id: 1,
        message: { id: 11, conversation_id: 1, user_id: 2, user_name: "Anita Rao", body: "Realtime message", created_at: "2026-08-12T08:01:00Z", reactions: {}, reacted_emojis: [] },
      });
    });

    expect((await screen.findAllByText("Realtime message")).length).toBeGreaterThan(0);
    expect(apiMocks.fetchConversationSummary).not.toHaveBeenCalled();
    expect(apiMocks.fetchConversationMessages).not.toHaveBeenCalled();
  });

  it("loads add-member candidates only when group management opens", async () => {
    const newcomer = { id: 3, first_name: "Mira", last_name: "Shah", email: "mira@example.com", job_title: "Product Designer" };
    const updatedGroup = { ...groupConversation, participants: [...groupConversation.participants, { id: 3, name: "Mira Shah", is_creator: false }] };
    apiMocks.fetchConversation.mockResolvedValue({ data: groupConversation });
    apiMocks.fetchConversationSummary.mockResolvedValue({ data: groupConversation });
    apiMocks.getUsers.mockResolvedValue({ data: [newcomer] });
    apiMocks.addConversationParticipants.mockResolvedValue({ data: updatedGroup });

    renderChat();
    await screen.findByText("Initial message");
    expect(apiMocks.getUsers).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTitle("Conversation details"));
    fireEvent.click(await screen.findByRole("button", { name: "Add" }));
    expect(await screen.findByText("Mira Shah")).toBeTruthy();
    expect(apiMocks.getUsers).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("Mira Shah"));
    fireEvent.click(screen.getByRole("button", { name: "Add 1" }));

    await waitFor(() => expect(apiMocks.addConversationParticipants).toHaveBeenCalledWith(1, [3]));
    expect(await screen.findByText("Members (3)")).toBeTruthy();
  });
});
