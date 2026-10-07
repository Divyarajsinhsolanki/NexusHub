// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SignatureDialog from "./SignatureDialog";

const context = { clearRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), arc: vi.fn(), fill: vi.fn(), drawImage: vi.fn() };
const drawStroke = () => {
  const canvas = screen.getByLabelText("Draw your signature");
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 480, height: 180 });
  fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 100, clientY: 50, button: 0 });
  fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 200, clientY: 80 });
  fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 200, clientY: 80 });
};

describe("Signature dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (callback) { callback(new Blob(["png"], { type: "image/png" })); });
    vi.stubGlobal("PointerEvent", MouseEvent);
    URL.createObjectURL = vi.fn(() => "blob:signature-preview");
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("exports a cropped PNG without painting a background and supports stroke undo", async () => {
    const onUse = vi.fn();
    const onClose = vi.fn();
    render(<SignatureDialog open onUse={onUse} onClose={onClose} />);
    expect(screen.getByRole("button", { name: "Use signature" }).disabled).toBe(true);
    drawStroke();
    expect(screen.getByRole("button", { name: "Undo stroke" }).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Undo stroke" }));
    expect(screen.getByRole("button", { name: "Use signature" }).disabled).toBe(true);
    drawStroke();
    fireEvent.click(screen.getByRole("button", { name: "Use signature" }));
    await waitFor(() => expect(onUse).toHaveBeenCalledTimes(1));
    expect(onUse.mock.calls[0][0]).toBeInstanceOf(File);
    expect(onUse.mock.calls[0][0].type).toBe("image/png");
    expect(onUse.mock.calls[0].slice(1)).toEqual(["blob:signature-preview", { width: 232, height: 92 }]);
    expect(context.drawImage.mock.calls[0].slice(1)).toEqual([184, 84, 232, 92, 0, 0, 232, 92]);
    expect(context.fillRect).toBeUndefined();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("traps keyboard focus, closes with Escape, and restores the invoking control", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    const onClose = vi.fn();
    const { unmount } = render(<SignatureDialog open onUse={vi.fn()} onClose={onClose} />);
    const first = screen.getByRole("button", { name: "Close signature dialog" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByLabelText("Upload signature image"));
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("rejects invalid uploads without using them", () => {
    const onUse = vi.fn();
    render(<SignatureDialog open onUse={onUse} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Upload signature image"), { target: { files: [new File(["pdf"], "file.pdf", { type: "application/pdf" })] } });
    expect(screen.getByRole("alert").textContent).toContain("PNG or JPEG");
    expect(onUse).not.toHaveBeenCalled();
  });
});
