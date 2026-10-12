// @vitest-environment jsdom
import React from "react";
import { render, waitFor, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import PageTitle from "./PageTitle";
vi.mock("../config/features", () => ({ portfolioEnabled: true }));
afterEach(cleanup);
const visit = (path) => render(<HelmetProvider><MemoryRouter initialEntries={[path]}><PageTitle /></MemoryRouter></HelmetProvider>);
it("gives contact its own metadata and replaces indexing rules for private pages", async () => {
  const page = visit("/contact");
  await waitFor(() => expect(document.title).toBe("Contact | Divyarajsinh Solanki"));
  expect(document.querySelector('meta[name="description"]').content).toContain("Contact Divyarajsinh");
  expect(document.querySelector('meta[name="robots"]').content).toBe("index, follow");
  page.unmount();
  visit("/projects/12/issues");
  await waitFor(() => expect(document.title).toBe("Issue Tracker | Divyarajsinh Solanki"));
  expect(document.querySelector('meta[name="robots"]').content).toBe("noindex, nofollow");
  expect(document.querySelector('link[rel="canonical"]').href).toMatch(/\/projects\/12\/issues$/);
});
