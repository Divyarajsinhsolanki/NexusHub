import { describe, expect, it } from "vitest";
import { getOutgoingReceiptStatus } from "./chatReceipts";

const message = { id: 42, user_id: 1, created_at: "2026-08-05T10:00:00Z" };

describe("getOutgoingReceiptStatus", () => {
  it("requires the direct-chat recipient cursor to pass the message", () => {
    const status = getOutgoingReceiptStatus(message, [
      { id: 1 },
      { id: 2, last_delivered_message_id: 42, last_read_message_id: 41 }
    ]);

    expect(status.allDelivered).toBe(true);
    expect(status.allRead).toBe(false);
  });

  it("requires every eligible group recipient for the final state", () => {
    const status = getOutgoingReceiptStatus(message, [
      { id: 1 },
      { id: 2, last_delivered_message_id: 42, last_read_message_id: 42 },
      { id: 3, last_delivered_message_id: 42, last_read_message_id: 12 }
    ]);

    expect(status.deliveredBy).toHaveLength(2);
    expect(status.readBy).toHaveLength(1);
    expect(status.allDelivered).toBe(true);
    expect(status.allRead).toBe(false);
  });

  it("does not count a member who joined after the message was sent", () => {
    const status = getOutgoingReceiptStatus(message, [
      { id: 1 },
      { id: 2, joined_at: "2026-08-05T09:00:00Z", last_delivered_message_id: 42, last_read_message_id: 42 },
      { id: 3, joined_at: "2026-08-05T11:00:00Z" }
    ]);

    expect(status.recipients.map((participant) => participant.id)).toEqual([2]);
    expect(status.allRead).toBe(true);
  });
});
