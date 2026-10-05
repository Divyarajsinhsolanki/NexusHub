// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import MemberProfileCard, { profileCardPosition } from "./MemberProfileCard";

afterEach(() => { cleanup(); vi.useRealTimers(); });
const member = { id: 42, full_name: "Alex Rivera", profile_picture_url: "/avatar.png", email: "alex@example.com", phone: "123456", allocation_percentage: 0 };
const setup = (value = member) => render(<MemoryRouter><div data-testid="clipped-parent" style={{ overflow: "hidden", transform: "translateX(0)" }}><MemberProfileCard member={value} compact /></div></MemoryRouter>);
const trigger = () => screen.getByRole("button", { name: "Preview Alex Rivera's profile" });

describe("MemberProfileCard", () => {
  it("renders outside clipping containers and keeps department contact fields", () => {
    const { getByTestId } = setup(); fireEvent.click(trigger());
    const dialog = screen.getByRole("dialog");
    expect(dialog.parentElement).toBe(document.body);
    expect(getByTestId("clipped-parent").contains(dialog)).toBe(false);
    expect(screen.getByRole("link", { name: "alex@example.com" }).getAttribute("href")).toBe("mailto:alex@example.com");
    expect(screen.getByRole("link", { name: "123456" }).getAttribute("href")).toBe("tel:123456");
    expect(screen.getByText("Allocation: 0%")).toBeTruthy();
    expect(screen.getByRole("link", { name: "View full profile" }).getAttribute("href")).toBe("/profile/42");
  });
  it("supports keyboard focus, enters the preview with Tab, and restores focus on Escape", () => {
    setup(); act(() => trigger().focus());
    fireEvent.keyDown(trigger(), { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close profile preview" }));
    fireEvent.keyDown(document.activeElement, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger());
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
  });
  it("returns to the trigger with Shift+Tab and does not close while scrolling its own content", () => {
    setup(); act(() => trigger().focus());
    fireEvent.keyDown(trigger(), { key: "Tab" });
    fireEvent.keyDown(document.activeElement, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(trigger());
    fireEvent.scroll(screen.getByRole("dialog"));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
  it("allows the pointer to move into the portal before closing", () => {
    vi.useFakeTimers(); setup(); fireEvent.mouseEnter(trigger());
    fireEvent.mouseLeave(trigger());
    fireEvent.mouseEnter(screen.getByRole("dialog"));
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.mouseLeave(screen.getByRole("dialog"));
    act(() => vi.advanceTimersByTime(300));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("keeps a tapped preview open until dismissed and stops parent selection", () => {
    const select = vi.fn();
    render(<MemoryRouter><div onClick={select}><MemberProfileCard member={member} compact /></div></MemoryRouter>);
    fireEvent.click(trigger()); fireEvent.mouseLeave(trigger());
    expect(select).not.toHaveBeenCalled();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("closes when its scrolling container moves", () => {
    const { getByTestId } = setup(); fireEvent.click(trigger());
    fireEvent.scroll(getByTestId("clipped-parent"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("filters unsafe social links and avoids profile links without an id", () => {
    setup({ ...member, id: undefined, social_links: { website: "javascript:alert(1)", github: "https://github.com/alex" } });
    fireEvent.click(trigger());
    expect(screen.queryByRole("link", { name: "Website" })).toBeNull();
    expect(screen.queryByRole("link", { name: "View full profile" })).toBeNull();
    expect(screen.getByRole("link", { name: "GitHub" }).getAttribute("href")).toBe("https://github.com/alex");
  });
});

describe("profileCardPosition", () => {
  it("flips above a bottom-edge trigger and stays inside a narrow viewport", () => {
    const position = profileCardPosition({ left: 300, top: 500, bottom: 540 }, { height: 250 }, { width: 375, height: 600 });
    expect(position).toEqual({ width: 351, left: 12, top: 242 });
  });
  it("clamps oversized cards and places cards below when space permits", () => {
    expect(profileCardPosition({ left: 20, top: 50, bottom: 80 }, { height: 200 }, { width: 1200, height: 800 })).toEqual({ width: 352, left: 20, top: 88 });
    expect(profileCardPosition({ left: -50, top: 10, bottom: 50 }, { height: 900 }, { width: 375, height: 600 }).top).toBe(12);
  });
});
