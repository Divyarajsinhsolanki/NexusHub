// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { prepareChatUpload } from "./chatUploads";
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const photo = () => new File([new Uint8Array(2 * 1024 * 1024)], "photo.jpg", { type: "image/jpeg" });
it("resizes large photos, keeps filenames, and reuses preparation on retries", async () => {
  const close = vi.fn();
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 4000, height: 3000, close })));
  const draw = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: draw });
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (done, type) {
    expect(this.width).toBe(2048);
    expect(this.height).toBe(1536);
    done(new Blob(["smaller"], { type }));
  });
  const file = photo();
  const output = await prepareChatUpload(file);
  expect(output.name).toBe(file.name);
  expect(output.size).toBeLessThan(file.size);
  expect(await prepareChatUpload(file)).toBe(output);
  expect(createImageBitmap).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
});
it("preserves small images, PNG transparency, GIF animations and documents", async () => {
  vi.stubGlobal("createImageBitmap", vi.fn());
  for (const type of ["image/jpeg", "image/png", "image/gif", "application/pdf"]) {
    const file = new File(["original"], "attachment", { type });
    expect(await prepareChatUpload(file)).toBe(file);
  }
  expect(createImageBitmap).not.toHaveBeenCalled();
});
it("falls back to originals on decode errors or larger encoded output", async () => {
  vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValueOnce(new Error("decode")).mockResolvedValue({ width: 100, height: 100, close: vi.fn() }));
  const first = photo();
  expect(await prepareChatUpload(first)).toBe(first);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() });
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((done) => done(new Blob([new Uint8Array(3 * 1024 * 1024)], { type: "image/jpeg" })));
  const second = photo();
  expect(await prepareChatUpload(second)).toBe(second);
});
