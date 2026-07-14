import { describe, expect, it } from "vitest";
import { isLiveCall, mergeCallIntoConversationGroups } from "./chatCalls";

describe("chatCalls", () => {
  it("detects live call statuses", () => {
    expect(isLiveCall({ status: "ringing" })).toBe(true);
    expect(isLiveCall({ status: "active" })).toBe(true);
    expect(isLiveCall({ status: "missed" })).toBe(false);
    expect(isLiveCall(null)).toBe(false);
  });

  it("merges active call state into the matching conversation", () => {
    const groups = {
      direct: [{ id: 1, title: "DM" }],
      group: [{ id: 2, title: "Team" }]
    };

    const merged = mergeCallIntoConversationGroups(groups, {
      id: 10,
      conversation_id: 2,
      status: "active"
    });

    expect(merged.direct[0].active_call).toBeUndefined();
    expect(merged.group[0].active_call).toEqual({ id: 10, conversation_id: 2, status: "active" });
  });

  it("clears active call state when a call ends", () => {
    const groups = {
      direct: [{ id: 1, active_call: { id: 10, conversation_id: 1, status: "active" } }],
      group: []
    };

    const merged = mergeCallIntoConversationGroups(groups, {
      id: 10,
      conversation_id: 1,
      status: "ended"
    });

    expect(merged.direct[0].active_call).toBeNull();
  });
});
