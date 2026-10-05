// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import Knowledge3DRoom from "./Knowledge3DRoom";
vi.mock("../../lib/threeLoader", () => ({ loadThree: () => new Promise(() => {}) }));
afterEach(cleanup);
it("shows every card in the default overview and opens full content", () => {
  const cards = Array.from({ length: 24 }, (_, i) => ({
    key: `card-${i}`, metadata: { title: `Topic ${i}`, category: "Learning", summary: "Short preview" },
    Component: () => <p>Full knowledge content</p>, generatedItem: {},
  }));
  render(<Knowledge3DRoom filteredCards={cards} categories={[]} filters={{}} knowledgeItems={[]} filteredCardsLength={24} setFilters={vi.fn()} setSearchQuery={vi.fn()} setActiveCategory={vi.fn()} />);
  const overview = screen.getByRole("main", { name: "All knowledge cards" });
  expect(within(overview).getAllByRole("button")).toHaveLength(24);
  expect(screen.getByRole("button", { name: "All cards" }).getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(within(overview).getAllByRole("button")[0]);
  expect(screen.getByText("Full knowledge content")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "3D room" }));
  expect(screen.queryByRole("main", { name: "All knowledge cards" })).toBeNull();
});
