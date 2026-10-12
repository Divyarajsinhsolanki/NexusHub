import { describe, expect, it } from "vitest";
import { positionMessageMenu } from "./MessageActionsPopover";

const bounds = { left: 20, right: 420, top: 100, bottom: 600 };
describe("message menu placement", () => {
  it("opens above bottom messages and below top messages", () => {
    expect(positionMessageMenu({ left: 50, right: 82, top: 550, bottom: 582 }, { height: 260 }, bounds, false)).toMatchObject({ placement: "above", top: 284 });
    expect(positionMessageMenu({ left: 50, right: 82, top: 110, bottom: 142 }, { height: 260 }, bounds, false)).toMatchObject({ placement: "below", top: 148 });
  });
  it("clamps both message directions and limits tall menus", () => {
    const result = positionMessageMenu({ left: 400, right: 432, top: 350, bottom: 382 }, { height: 900 }, bounds, false);
    expect(result.left + result.width).toBeLessThanOrEqual(bounds.right);
    expect(result.top).toBeGreaterThanOrEqual(bounds.top);
    expect(result.maxHeight).toBe(244);
    expect(positionMessageMenu({ left: 0, right: 32, top: 110, bottom: 142 }, { height: 260 }, bounds, true).left).toBe(20);
  });
});
