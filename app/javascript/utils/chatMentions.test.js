import { describe, expect, it } from "vitest";
import {
  applyComposerEntity,
  getComposerEntityQuery,
  getMentionedUserIds,
  getPreferredUserMentionHandle,
  getTaskReferenceKey,
  getUserMentionAliases,
  resolveChatMessageText,
  tokenizeChatMessage
} from "./chatMentions";

describe("chatMentions", () => {
  const user = {
    id: 7,
    name: "Jane Doe",
    first_name: "Jane",
    last_name: "Doe",
    email: "jane.doe@example.com"
  };

  const task = {
    id: 12,
    task_id: "TASK-42",
    title: "Build mention support"
  };

  it("builds stable user aliases from profile fields", () => {
    expect(getUserMentionAliases(user)).toEqual(["jane.doe", "jane"]);
  });

  it("prefers the email handle for inserted mentions", () => {
    expect(getPreferredUserMentionHandle(user)).toBe("jane.doe");
  });

  it("normalizes task references from task ids", () => {
    expect(getTaskReferenceKey(task)).toBe("task-42");
  });

  it("detects the active @ or # query at the cursor", () => {
    expect(getComposerEntityQuery("Hi @ja", 6)).toEqual({
      trigger: "@",
      query: "ja",
      start: 3,
      end: 6
    });

    expect(getComposerEntityQuery("Check #TASK", 11)).toEqual({
      trigger: "#",
      query: "TASK",
      start: 6,
      end: 11
    });
  });

  it("replaces the active token and keeps spacing valid", () => {
    expect(
      applyComposerEntity("Hi @ja team", getComposerEntityQuery("Hi @ja team", 6), "@jane.doe")
    ).toEqual({
      value: "Hi @jane.doe team",
      selectionStart: 12,
      selectionEnd: 12
    });

    expect(
      applyComposerEntity("Check #TA", getComposerEntityQuery("Check #TA", 9), "#TASK-42")
    ).toEqual({
      value: "Check #TASK-42 ",
      selectionStart: 15,
      selectionEnd: 15
    });
  });

  it("tokenizes and resolves known users and tasks", () => {
    const segments = tokenizeChatMessage("Talk to @jane.doe about #TASK-42.", {
      usersByHandle: {
        "jane.doe": user
      },
      tasksByKey: {
        "task-42": task
      }
    });

    expect(segments).toEqual([
      { kind: "text", text: "Talk to " },
      {
        kind: "user",
        raw: "@jane.doe",
        text: "@Jane Doe",
        searchText: "@Jane Doe jane.doe@example.com",
        user
      },
      { kind: "text", text: " about " },
      {
        kind: "task",
        raw: "#TASK-42",
        text: "#TASK-42",
        searchText: "#TASK-42 Build mention support",
        task
      },
      { kind: "text", text: "." }
    ]);
  });

  it("leaves unknown tokens untouched when resolving text", () => {
    expect(
      resolveChatMessageText("Talk to @jane.doe and #TASK-42", {
        usersByHandle: {
          "jane.doe": user
        },
        tasksByKey: {
          "task-42": task
        }
      })
    ).toBe("Talk to @Jane Doe and #TASK-42");

    expect(resolveChatMessageText("Unknown @person", {})).toBe("Unknown @person");
  });
});

describe('already tagged users', () => {
  const jane = { id: 7, name: 'Jane Doe', email: 'jane.doe@example.com' };
  const lookups = { usersByHandle: { 'jane.doe': jane, jane } };
  it('recognizes aliases, case and punctuation without matching email addresses or partial handles', () => {
    expect([...getMentionedUserIds('Hi (@JANE), @', lookups)]).toEqual(['7']);
    expect([...getMentionedUserIds('jane@example.com @jane.d @', lookups)]).toEqual([]);
  });
  it('ignores the current token but includes mentions before and after the caret', () => {
    const text = '@jane.doe';
    expect([...getMentionedUserIds(text, lookups, getComposerEntityQuery(text, text.length))]).toEqual([]);
    expect([...getMentionedUserIds('@j @jane.doe', lookups, getComposerEntityQuery('@j @jane.doe', 2))]).toEqual(['7']);
    expect([...getMentionedUserIds('@jane @j', lookups, getComposerEntityQuery('@jane @j', 8))]).toEqual(['7']);
  });
  it('allows the user again after the mention is removed', () => {
    expect([...getMentionedUserIds('Hi @', lookups)]).toEqual([]);
  });
});
