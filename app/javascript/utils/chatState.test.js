// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest";
import { chatDraftKey, clearChatDrafts, readChatDraft, writeChatDraft, mergeMessage, patchMessageRows, canChangeMessage } from "./chatState";
beforeEach(() => localStorage.clear());
it("isolates drafts by account, workspace and conversation, and clears only drafts", () => {
  const key = chatDraftKey({ id: 1, workspace: { id: 2 } }, 3);
  writeChatDraft(key, { body: "Draft", replyTo: { id: 42 }, attachments: ["not persisted"] });
  expect(readChatDraft(key)).toEqual({ body: "Draft", replyTo: { id: 42 } });
  expect(readChatDraft(chatDraftKey({ id: 2, workspace: { id: 2 } }, 3))).toBeNull();
  expect(readChatDraft(chatDraftKey({ id: 1, workspace: { id: 4 } }, 3))).toBeNull();
  localStorage.setItem("theme", "dark");
  clearChatDrafts();
  expect(readChatDraft(key)).toBeNull();
  expect(localStorage.getItem("theme")).toBe("dark");
});
it("does not resurrect deleted messages from delayed responses", () => {
  const deleted = { id: 1, body: "Message deleted", deleted_at: "2026-10-07T10:00:00Z", updated_at: "2026-10-07T10:00:00Z" };
  expect(mergeMessage(deleted, { id: 1, body: "Old content", updated_at: "2026-10-07T09:59:00Z" })).toBe(deleted);
  expect(patchMessageRows([{ id: 2, reply_to: { id: 1, body: "Old content" } }], deleted)[0].reply_to.body).toBe("Message deleted");
});
it("uses a strict 15-minute cutoff and excludes system messages", () => {
  const message = { id: 1, user_id: 5, created_at: "2026-10-07T10:00:00Z" };
  expect(canChangeMessage(message, 5, Date.parse("2026-10-07T10:14:59Z"))).toBe(true);
  expect(canChangeMessage(message, 5, Date.parse("2026-10-07T10:15:00Z"))).toBe(false);
  expect(canChangeMessage({ ...message, message_type: "system" }, 5, Date.parse("2026-10-07T10:01:00Z"))).toBe(false);
});
