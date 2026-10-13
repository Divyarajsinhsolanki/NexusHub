// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;
  static instances = [];

  constructor() {
    this.readyState = FakeWebSocket.CONNECTING;
    this.sent = [];
    FakeWebSocket.instances.push(this);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  receive(payload) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  send(payload) {
    this.sent.push(JSON.parse(payload));
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }
}

const identifier = JSON.stringify({ channel: "ChatChannel", conversation_id: 12 });

beforeEach(() => {
  vi.resetModules();
  FakeWebSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("chat cable subscription confirmation", () => {
  it("holds conversation actions until Action Cable confirms the subscription", async () => {
    const { sendToConversation, subscribeToConversationChat } = await import("./chatCable");
    const subscription = subscribeToConversationChat(12, vi.fn());
    const socket = FakeWebSocket.instances[0];

    socket.open();
    sendToConversation(12, "typing", { is_typing: true });

    expect(socket.sent.filter((payload) => payload.command === "message")).toHaveLength(0);

    socket.receive({ type: "confirm_subscription", identifier });

    expect(socket.sent.filter((payload) => payload.command === "message")).toEqual([
      expect.objectContaining({ command: "message", identifier }),
    ]);
    subscription.unsubscribe();
  });

  it("discards queued actions when the conversation unsubscribes before confirmation", async () => {
    const { sendToConversation, subscribeToConversationChat } = await import("./chatCable");
    const subscription = subscribeToConversationChat(12, vi.fn());
    const socket = FakeWebSocket.instances[0];

    socket.open();
    sendToConversation(12, "typing", { is_typing: true });
    subscription.unsubscribe();
    socket.receive({ type: "confirm_subscription", identifier });

    expect(socket.sent.filter((payload) => payload.command === "message")).toHaveLength(0);
  });

  it("does not queue actions for a conversation without an active subscription", async () => {
    const { sendToConversation } = await import("./chatCable");

    expect(sendToConversation(12, "typing", { is_typing: true })).toBe(false);
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it("keeps confirmed subscriptions intact when ensuring an open connection", async () => {
    const { ensureCableConnection, sendToConversation, subscribeToConversationChat } = await import("./chatCable");
    const subscription = subscribeToConversationChat(12, vi.fn());
    const socket = FakeWebSocket.instances[0];

    socket.open();
    socket.receive({ type: "confirm_subscription", identifier });
    const subscribeCount = socket.sent.filter((payload) => payload.command === "subscribe").length;

    expect(ensureCableConnection()).toBe(true);
    expect(sendToConversation(12, "typing", { is_typing: true })).toBe(true);
    expect(socket.sent.filter((payload) => payload.command === "subscribe")).toHaveLength(subscribeCount);
    expect(socket.sent.filter((payload) => payload.command === "message")).toHaveLength(1);
    subscription.unsubscribe();
  });
});

it("stops reconnection and discards queued actions after session revocation", async () => {
  vi.useFakeTimers();
  const check = vi.fn();
  window.addEventListener("nexus-session-check", check);
  const { subscribeToSession, subscribeToConversationChat, sendToConversation } = await import("./chatCable");
  const auth = subscribeToSession();
  const chat = subscribeToConversationChat(12, vi.fn());
  const socket = FakeWebSocket.instances[0];
  socket.open();
  sendToConversation(12, "typing", { is_typing: true });
  socket.receive({ type: "disconnect", reason: "remote", reconnect: false });
  expect(check).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(FakeWebSocket.instances).toHaveLength(1);
  auth.unsubscribe();
  chat.unsubscribe();
  window.removeEventListener("nexus-session-check", check);
  vi.useRealTimers();
});
