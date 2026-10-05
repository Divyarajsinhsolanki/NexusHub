// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import PostImage from "./PostImage";
afterEach(cleanup);
it("shows failed attachments and retries without losing the original link", () => {
  render(<PostImage src="/old-post.png" />);
  fireEvent.error(screen.getByRole("img"));
  expect(screen.getByRole("status").textContent).toContain("could not be loaded");
  expect(screen.getByRole("link", { name: "Open original" }).getAttribute("href")).toBe("/old-post.png");
  fireEvent.click(screen.getByRole("button", { name: "Retry image" }));
  expect(screen.getByRole("img").getAttribute("src")).toContain("/old-post.png?retry=");
});
it("resets failure state when the attachment changes", () => {
  const { rerender } = render(<PostImage src="/old-post.png" />);
  fireEvent.error(screen.getByRole("img"));
  rerender(<PostImage src="/new-post.png" />);
  expect(screen.getByRole("img").getAttribute("src")).toBe("/new-post.png");
});
