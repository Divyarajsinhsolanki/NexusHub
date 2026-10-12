import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import VirtualMessages from "./VirtualMessages";
it("bounds rendered rows for long histories while retaining short histories", () => {
  const render = (count) => renderToStaticMarkup(<VirtualMessages messages={Array.from({ length: count }, (_, i) => ({ id: i + 1 }))} scrollRef={{ current: null }} renderMessage={(message) => <span>{message.id}</span>} />);
  expect((render(20).match(/data-message-id=/g) || []).length).toBe(20);
  const rows = (render(10000).match(/data-message-id=/g) || []).length;
  expect(rows).toBeGreaterThan(0);
  expect(rows).toBeLessThan(40);
});
