import { describe, expect, it } from "vitest";
import { canOpenProjectWorkspace } from "./projectAccess";
describe("project workspace access", () => {
  it("permits members and handles string identifiers", () => {
    expect(canOpenProjectWorkspace({ users: [{ id: 1 }] }, { id: "1" })).toBe(true);
  });
  it("does not grant project access from global roles alone", () => {
    expect(canOpenProjectWorkspace({ users: [{ id: 2 }] }, { id: 1, roles: [{ name: "owner" }] })).toBe(false);
  });
  it.each(['invited', 'requested', 'removed'])('denies %s memberships', (status) => {
    expect(canOpenProjectWorkspace({ users: [{ id: 1, status }] }, { id: 1 })).toBe(false);
  });
  it("denies missing users and malformed member lists", () => {
    expect(canOpenProjectWorkspace({}, { id: 1 })).toBe(false);
    expect(canOpenProjectWorkspace({ users: [null, {}] }, {})).toBe(false);
  });
});
