import { expect, it, vi } from "vitest";
import { createSingleFlight } from "./chatRequests";
it("shares concurrent reads, isolates keys, and fetches again after completion", async () => {
  const read = createSingleFlight();
  let finish;
  const request = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
  const first = read("account:1:chat:1", request);
  expect(read("account:1:chat:1", request)).toBe(first);
  await Promise.resolve();
  expect(request).toHaveBeenCalledTimes(1);
  expect(await read("account:2:chat:1", () => "other account")).toBe("other account");
  finish("messages");
  expect(await first).toBe("messages");
  expect(await read("account:1:chat:1", () => "fresh")).toBe("fresh");
});
it("allows retries after failed reads", async () => {
  const read = createSingleFlight();
  await expect(read("chat", () => Promise.reject(new Error("offline")))).rejects.toThrow("offline");
  expect(await read("chat", () => "recovered")).toBe("recovered");
});
