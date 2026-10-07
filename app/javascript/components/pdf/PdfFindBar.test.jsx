// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PdfFindBar from "./PdfFindBar";

describe("PDF find bar", () => {
  afterEach(cleanup);
  it("navigates results using Enter and Shift+Enter and closes with Escape", () => {
    const onNavigate = vi.fn();
    const onClose = vi.fn();
    const onQueryChange = vi.fn();
    render(<PdfFindBar query="account" onQueryChange={onQueryChange} matches={[{}, {}]} activeIndex={1} onNavigate={onNavigate} onClose={onClose} />);
    const input = screen.getByRole("searchbox", { name: "Find in PDF" });
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "contract" } });
    expect(onQueryChange).toHaveBeenCalledWith("contract");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onNavigate).toHaveBeenLastCalledWith(0);
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(onNavigate).toHaveBeenLastCalledWith(0);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toBe("2 of 2");
  });

  it("reports empty results and failed searches without enabling navigation", () => {
    render(<PdfFindBar query="missing" matches={[]} onQueryChange={vi.fn()} onNavigate={vi.fn()} onClose={vi.fn()} error="Preview could not load" />);
    expect(screen.getByRole("status").textContent).toBe("No matches");
    expect(screen.getByRole("button", { name: "Next match" }).disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toBe("Preview could not load");
  });
});
