// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  muteConversation: vi.fn(),
  editChatMessage: vi.fn(),
  deleteChatMessage: vi.fn(),
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
  userCallback: null,
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
  editChatMessage: apiMocks.editChatMessage,
  deleteChatMessage: apiMocks.deleteChatMessage,
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
  muteConversation: apiMocks.muteConversation,
  removeConversationParticipant: apiMocks.removeConversationParticipant,
  removeMessageReaction: vi.fn(),
  sendMessage: apiMocks.sendMessage,
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
  subscribeToUserChat: vi.fn((callback) => { cableMocks.userCallback = callback; return { unsubscribe: vi.fn() }; }),
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
  localStorage.clear();
  apiMocks.sendMessage.mockReset();
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

  it("renders messages from the user stream when the thread subscription misses them", async () => {
    renderChat();
    await screen.findByText("Initial message");
    await act(async () => cableMocks.userCallback({ type: "message_created", conversation_id: 1, message: { id: 12, user_id: 2, user_name: "Anita Rao", body: "User stream message", created_at: "2026-08-12T08:02:00Z", reactions: {}, reacted_emojis: [] } }));
    expect(within(screen.getByLabelText("Conversation messages")).getByText("User stream message")).toBeTruthy();
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


describe("chat composer and keyboard controls", () => {
  it("quotes a selected message and sends its reply target", async () => {
    apiMocks.sendMessage.mockResolvedValue({ data: { id: 99, user_id: 1, user_name: 'Current User', body: 'Quoted reply', created_at: '2026-10-06T08:00:00Z', reply_to: { ...conversation.messages[0] } } });
    renderChat();
    fireEvent.click(await screen.findByRole('button', { name: 'Reply to Anita Rao' }));
    expect(screen.getByRole('button', { name: 'Cancel reply' })).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'Quoted reply' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(apiMocks.sendMessage).toHaveBeenCalled());
    expect(apiMocks.sendMessage.mock.calls[0][1].get('message[reply_to_id]')).toBe('10');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Cancel reply' })).toBeNull());
    const bubble = screen.getAllByText('Quoted reply').map((element) => element.closest('.nx-chat-message-bubble')).find(Boolean);
    expect(bubble.querySelector('time')).toBeTruthy();
  });

  it("inserts composer emojis and updates message authors after a profile event", async () => {
    renderChat();
    const composer = await screen.findByRole('textbox', { name: 'Message' });
    fireEvent.click(screen.getByRole('button', { name: 'Choose emoji' }));
    const option = within(screen.getByRole('dialog', { name: 'Emoji picker' })).getAllByRole('button')[0];
    const emoji = option.textContent;
    fireEvent.click(option);
    expect(composer.value).toContain(emoji);
    await act(async () => cableMocks.userCallback({ type: 'user_profile_updated', user_id: 2, user_name: 'Anita Updated', user_profile_picture: '/new-avatar.png' }));
    expect(await screen.findByRole('button', { name: 'Reply to Anita Updated' })).toBeTruthy();
  });

  it("renders membership logs separately from message bubbles", async () => {
    apiMocks.fetchConversation.mockResolvedValue({ data: { ...conversation, messages: [{ ...conversation.messages[0], message_type: 'system', body: 'Current User added Anita Rao' }] } });
    renderChat();
    expect((await screen.findByRole('note')).textContent).toContain('Current User added Anita Rao');
    expect(screen.queryByRole('button', { name: 'Reply to Anita Rao' })).toBeNull();
  });
  it("keeps the draft visible when sending fails and allows retry", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    apiMocks.sendMessage.mockRejectedValueOnce(new Error("Offline"));
    renderChat();
    const composer = await screen.findByRole("textbox", { name: "Message" });
    fireEvent.change(composer, { target: { value: "Keep this draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Your draft is still here");
    expect(composer.value).toBe("Keep this draft");
    expect(screen.getByRole("button", { name: "Send message" }).disabled).toBe(false);
    apiMocks.sendMessage.mockResolvedValueOnce({ data: { ...conversation.messages[0], id: 99, user_id: 1, body: "Keep this draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(composer.value).toBe(""));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(apiMocks.sendMessage).toHaveBeenCalledTimes(2);
    errorLog.mockRestore();
  });

  it("does not send during IME composition and prevents duplicate pending sends", async () => {
    let resolveSend;
    apiMocks.sendMessage.mockImplementation(() => new Promise((resolve) => { resolveSend = resolve; }));
    renderChat();
    const composer = await screen.findByRole("textbox", { name: "Message" });
    fireEvent.change(composer, { target: { value: "Hello team" } });
    fireEvent.keyDown(composer, { key: "Enter", isComposing: true });
    fireEvent.keyDown(composer, { key: "Enter", shiftKey: true });
    expect(apiMocks.sendMessage).not.toHaveBeenCalled();
    fireEvent.keyDown(composer, { key: "Enter" });
    fireEvent.keyDown(composer, { key: "Enter" });
    expect(apiMocks.sendMessage).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Send message" }).disabled).toBe(true);
    await act(async () => resolveSend({ data: { ...conversation.messages[0], id: 99, user_id: 1, body: "Hello team" } }));
    expect(composer.value).toBe("");
  });

  it("opens reaction choices only on demand and restores focus with Escape", async () => {
    renderChat();
    const trigger = await screen.findByRole("button", { name: "Add reaction" });
    expect(screen.queryByRole("group", { name: "Choose a reaction" })).toBeNull();
    fireEvent.click(trigger);
    expect(screen.getByRole("group", { name: "Choose a reaction" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("group", { name: "Choose a reaction" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("inserts mention and task triggers from the composer toolbar", async () => {
    renderChat();
    const composer = await screen.findByRole("textbox", { name: "Message" });
    fireEvent.click(screen.getByRole("button", { name: "Mention a teammate" }));
    expect(composer.value).toBe("@");
    await waitFor(() => expect(apiMocks.getUsers).toHaveBeenCalledTimes(1));
    fireEvent.change(composer, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Link a task" }));
    expect(composer.value).toBe("#");
    await waitFor(() => expect(apiMocks.getTasks).toHaveBeenCalledTimes(1));
  });

  it("traps new-conversation dialog focus and closes with Escape", async () => {
    renderChat();
    await screen.findByRole("textbox", { name: "Message" });
    const trigger = screen.getByRole("button", { name: "Start a new conversation" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Start a direct chat" });
    const controls = dialog.querySelectorAll('button:not([disabled]), input:not([disabled])');
    const last = controls[controls.length - 1];
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("dialog").querySelector("button"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("conversation drafts", () => {
  const secondConversation = {
    ...conversation,
    id: 2,
    title: "Mira Chen",
    participants: [conversation.participants[0], { id: 3, name: "Mira Chen" }],
    messages: [],
    last_message: "A separate conversation",
  };

  const renderTwoConversations = () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    });
    apiMocks.fetchConversations.mockResolvedValue({ data: { data: [conversation, secondConversation], meta: { unread_count: 0 } } });
    apiMocks.fetchConversation.mockImplementation(async (id) => ({ data: Number(id) === 2 ? secondConversation : conversation }));
    apiMocks.fetchConversationSummary.mockImplementation(async (id) => ({ data: Number(id) === 2 ? secondConversation : conversation }));
    return render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <AuthContext.Provider value={{ user }}>
          <Routes>
            <Route path="/chat" element={<Chat />} />
            <Route path="/chat/:conversationId" element={<Chat />} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>
    );
  };

  it("keeps drafts separate when navigating between conversations", async () => {
    renderTwoConversations();
    const composer = await screen.findByRole("textbox", { name: "Message" });
    fireEvent.change(composer, { target: { value: "Draft for Anita" } });
    fireEvent.click(await screen.findByRole("link", { name: /Mira Chen/ }));
    await screen.findByRole("heading", { name: "Mira Chen" });
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Message" }).value).toBe(""));
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), { target: { value: "Draft for Mira" } });
    fireEvent.click(screen.getByRole("link", { name: /Anita Rao/ }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Message" }).value).toBe("Draft for Anita"));
    fireEvent.click(screen.getByRole("link", { name: /Mira Chen/ }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Message" }).value).toBe("Draft for Mira"));
  });

  it("keeps a late send result in its original conversation", async () => {
    let resolveSend;
    apiMocks.sendMessage.mockImplementation(() => new Promise((resolve) => { resolveSend = resolve; }));
    renderTwoConversations();
    const composer = await screen.findByRole("textbox", { name: "Message" });
    fireEvent.change(composer, { target: { value: "For Anita only" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    fireEvent.click(await screen.findByRole("link", { name: /Mira Chen/ }));
    await screen.findByRole("heading", { name: "Mira Chen" });
    await act(async () => resolveSend({ data: { ...conversation.messages[0], id: 99, user_id: 1, body: "For Anita only" } }));
    expect(within(screen.getByRole("main")).queryByText("For Anita only")).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: /Anita Rao/ }));
    expect(await within(screen.getByRole("main")).findByText("For Anita only")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Message" }).value).toBe("");
  });
  it("retains newer composer input when an earlier send completes", async () => {
    let complete;
    apiMocks.sendMessage.mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
    renderChat();
    const composer = await screen.findByRole("textbox", { name: "Message" });
    fireEvent.change(composer, { target: { value: "First message" } });
    fireEvent.submit(composer.closest("form"));
    await waitFor(() => expect(apiMocks.sendMessage).toHaveBeenCalledTimes(1));
    const form = apiMocks.sendMessage.mock.calls[0][1];
    expect(form.get("message[client_id]")).toBeTruthy();
    fireEvent.change(composer, { target: { value: "Next draft" } });
    await act(async () => complete({ data: { ...conversation.messages[0], id: 456, user_id: user.id, body: "First message" } }));
    expect(composer.value).toBe("Next draft");
  });

  it("reuses the same client id after an ambiguous send failure", async () => {
    apiMocks.sendMessage.mockRejectedValueOnce(new Error("Network interrupted")).mockResolvedValueOnce({ data: { ...conversation.messages[0], id: 457, user_id: user.id, body: "Retry safely" } });
    renderChat();
    const composer = await screen.findByRole("textbox", { name: "Message" });
    fireEvent.change(composer, { target: { value: "Retry safely" } });
    fireEvent.submit(composer.closest("form"));
    await screen.findByText(/Your message couldn’t be sent/);
    fireEvent.submit(composer.closest("form"));
    await waitFor(() => expect(apiMocks.sendMessage).toHaveBeenCalledTimes(2));
    expect(apiMocks.sendMessage.mock.calls[0][1].get("message[client_id]")).toBe(apiMocks.sendMessage.mock.calls[1][1].get("message[client_id]"));
  });

  it("restores a persisted draft and reply after remount", async () => {
    const first = renderChat();
    const composer = await screen.findByRole("textbox", { name: "Message" });
    fireEvent.change(composer, { target: { value: "Remember this" } });
    fireEvent.click(await screen.findByRole("button", { name: "Reply to Anita Rao" }));
    await waitFor(() => expect(Object.values(localStorage).some((value) => value.includes("Remember this"))).toBe(true));
    first.unmount();
    renderChat();
    expect((await screen.findByRole("textbox", { name: "Message" })).value).toBe("Remember this");
    expect(await screen.findByRole("button", { name: "Cancel reply" })).toBeTruthy();
  });

  it("searches unloaded history and opens surrounding context without marking it read", async () => {
    apiMocks.fetchConversationMessages.mockResolvedValue({ data: { data: [{ ...conversation.messages[0], id: 9, body: "Older budget" }], meta: { has_more: false } } });
    renderChat();
    fireEvent.click(await screen.findByRole("button", { name: "Search in conversation" }));
    const search = screen.getByRole("textbox", { name: "Search messages in this conversation" });
    fireEvent.change(search, { target: { value: "budget" } });
    await screen.findByText("budget", { exact: false });
    await waitFor(() => expect(apiMocks.fetchConversationMessages).toHaveBeenCalledWith("1", expect.objectContaining({ q: "budget" })));
    fireEvent.click(await screen.findByRole("button", { name: "Open message in conversation" }));
    await screen.findByText(/Viewing message context/);
    expect(apiMocks.fetchConversationMessages).toHaveBeenCalledWith("1", expect.objectContaining({ around_id: 9 }));
  });

  it("applies deletion to cached messages and quoted replies", async () => {
    renderChat();
    await screen.findByText("Initial message");
    await act(async () => cableMocks.userCallback({ type: "message_deleted", conversation_id: 1, message: { ...conversation.messages[0], body: "Message deleted", deleted_at: new Date().toISOString(), updated_at: new Date().toISOString(), attachments: [], reactions: {} } }));
    expect(await screen.findByText("Message deleted")).toBeTruthy();
    expect(screen.queryByText("Initial message")).toBeNull();
    expect(screen.queryByRole("button", { name: "Reply to Anita Rao" })).toBeNull();
  });

  it("edits and deletes an owned message through the new actions", async () => {
    const owned = { ...conversation.messages[0], id: 700, user_id: user.id, body: "Original owned message", created_at: new Date().toISOString() };
    apiMocks.fetchConversation.mockResolvedValue({ data: { ...conversation, messages: [owned] } });
    apiMocks.editChatMessage.mockResolvedValue({ data: { ...owned, body: "Corrected message", edited_at: new Date().toISOString(), updated_at: new Date().toISOString() } });
    apiMocks.deleteChatMessage.mockResolvedValue({ data: { ...owned, body: "Message deleted", deleted_at: new Date().toISOString(), updated_at: new Date().toISOString(), attachments: [] } });
    renderChat();
    fireEvent.click(await screen.findByRole("button", { name: "Edit message", exact: true }));
    fireEvent.change(screen.getByLabelText("Edit message · available for 15 minutes"), { target: { value: "Corrected message" } });
    fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
    expect(await screen.findByText("Corrected message")).toBeTruthy();
    expect(apiMocks.editChatMessage).toHaveBeenCalledWith("1", 700, "Corrected message");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Delete message", exact: true }));
    expect(await screen.findByText("Message deleted")).toBeTruthy();
    expect(apiMocks.deleteChatMessage).toHaveBeenCalledWith("1", 700);
    confirm.mockRestore();
  });

});

it('refreshes typing during continuous composition and stops on blur', async () => {
  renderChat();
  const composer = await screen.findByPlaceholderText('Write a message...');
  const now = vi.spyOn(Date, 'now');
  now.mockReturnValue(10000);
  fireEvent.change(composer, { target: { value: 'Hello' } });
  now.mockReturnValue(11200);
  fireEvent.change(composer, { target: { value: 'Hello team' } });
  expect(cableMocks.sendToConversation.mock.calls.filter(([, action, data]) => action === 'typing' && data.is_typing)).toHaveLength(2);
  fireEvent.blur(composer);
  expect(cableMocks.sendToConversation).toHaveBeenLastCalledWith('1', 'typing', { conversation_id: '1', is_typing: false });
  now.mockRestore();
});

it('combines multiple typing participants and removes stopped participants', async () => {
  renderChat();
  await screen.findByPlaceholderText('Write a message...');
  act(() => {
    cableMocks.conversationCallback({ type: 'typing_indicator', conversation_id: 1, user_id: 2, user_name: 'Anita', is_typing: true });
    cableMocks.conversationCallback({ type: 'typing_indicator', conversation_id: 1, user_id: 3, user_name: 'Sam', is_typing: true });
  });
  expect(screen.getAllByText('Several people are typing…').length).toBeGreaterThan(0);
  act(() => cableMocks.conversationCallback({ type: 'typing_indicator', conversation_id: 1, user_id: 3, is_typing: false }));
  expect(screen.getAllByText('Anita is typing…').length).toBeGreaterThan(0);
});
it('offers one Mute action and shows durations only after selecting it', async () => {
  window.matchMedia.mockImplementation(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  apiMocks.muteConversation.mockResolvedValue({ data: { ...conversation, muted: true } });
  renderChat();
  const actions = await screen.findByRole('button', { name: 'Conversation actions' });
  fireEvent.click(actions);
  expect(screen.queryByRole('button', { name: 'Mute 1 hour' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Mute' }));
  const dialog = screen.getByRole('dialog', { name: 'Mute notifications for…' });
  fireEvent.click(within(dialog).getByRole('button', { name: '8 hours' }));
  await waitFor(() => expect(apiMocks.muteConversation).toHaveBeenCalledWith(conversation.id, '8h'));
});
