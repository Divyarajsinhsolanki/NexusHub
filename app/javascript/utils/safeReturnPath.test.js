import { describe, expect, it } from "vitest";
import { safeReturnPath } from "./safeReturnPath";

describe("safeReturnPath", () => {
  it("preserves a local meeting route", () => {
    expect(safeReturnPath("/meet/550e8400-e29b-41d4-a716-446655440000")).toBe("/meet/550e8400-e29b-41d4-a716-446655440000");
  });

  it("rejects absolute and backslash-normalized destinations", () => {
    expect(safeReturnPath("https://evil.example/meet/id")).toBeNull();
    expect(safeReturnPath("//evil.example/meet/id")).toBeNull();
    expect(safeReturnPath("/\\evil.example/meet/id")).toBeNull();
  });
});
