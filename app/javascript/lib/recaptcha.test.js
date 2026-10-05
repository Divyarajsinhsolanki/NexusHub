// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { getContactVerificationToken } from "./recaptcha";
afterEach(() => { delete window.grecaptcha; vi.useRealTimers(); });
it("waits for readiness and requests the server's expected action", async () => {
  const execute = vi.fn().mockResolvedValue("verified-token");
  window.grecaptcha = { ready: (callback) => callback(), execute };
  expect(await getContactVerificationToken("site-key")).toBe("verified-token");
  expect(execute).toHaveBeenCalledWith("site-key", { action: "contact_form_submit" });
});
it("times out a stuck verification instead of keeping the form busy forever", async () => {
  vi.useFakeTimers();
  window.grecaptcha = { ready: (callback) => callback(), execute: () => new Promise(() => {}) };
  const result = expect(getContactVerificationToken("invalid-domain-key")).rejects.toThrow("Verification could not complete");
  await vi.advanceTimersByTimeAsync(12000);
  await result;
});
it("fails without a configured site key", async () => {
  await expect(getContactVerificationToken()).rejects.toThrow("Please use the email link");
});
