// @vitest-environment jsdom
import React, { useRef } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import usePortfolioMotion from "./usePortfolioMotion";

let frames;
let mediaQueries;
let observers;
let resizeObservers;
let scrollPosition;

const rect = (top, height, width = 1200) => ({
  top: top - scrollPosition,
  bottom: top + height - scrollPosition,
  left: 0,
  right: width,
  width,
  height,
  x: 0,
  y: top - scrollPosition,
});
const setDimension = (element, name, value) =>
  Object.defineProperty(element, name, { configurable: true, value });
const applyLayout = (root, layoutDependsOnPinned) => {
  [
    ["top", 0, 900],
    ["about", 1000, 900],
    ["features", 1900, 1600],
    ["contact", 3600, 1000],
  ].forEach(([id, top, height]) => {
    root.querySelector(`#${id}`).getBoundingClientRect = () =>
      rect(top, height);
  });
  root.querySelector("[data-hero-scene]").getBoundingClientRect = () =>
    rect(100, 600);
  root.querySelector("[data-testid='first-reveal']").getBoundingClientRect =
    () => rect(100, 100);
  root.querySelector("[data-testid='later-reveal']").getBoundingClientRect =
    () => rect(1200, 100);
  setDimension(
    root.querySelector("[data-gallery-viewport]"),
    "clientWidth",
    1000,
  );
  const track = root.querySelector("[data-gallery-track]");
  if (layoutDependsOnPinned) {
    Object.defineProperty(track, "scrollWidth", {
      configurable: true,
      get: () =>
        root.querySelector("[data-portfolio-gallery]").dataset.galleryPinned ===
        "true"
          ? 1800
          : 1000,
    });
  } else setDimension(track, "scrollWidth", 1800);
};

function Harness({ layoutDependsOnPinned = false }) {
  const rootRef = useRef(null);
  const { activeSection, reducedMotion } = usePortfolioMotion(rootRef);
  return (
    <div
      data-testid="root"
      data-motion="pending"
      style={{ "--pointer-x": "0.25" }}
      ref={(node) => {
        rootRef.current = node;
        if (node) applyLayout(node, layoutDependsOnPinned);
      }}
    >
      <output data-testid="state">
        {activeSection}:{String(reducedMotion)}
      </output>
      <section id="top" data-portfolio-section>
        <div data-hero-scene />
        <p data-testid="first-reveal" data-reveal>
          Hero
        </p>
      </section>
      <section id="about" data-portfolio-section>
        <p data-testid="later-reveal" data-reveal>
          About
        </p>
      </section>
      <section id="features" data-portfolio-section data-portfolio-gallery>
        <div data-gallery-viewport>
          <div data-gallery-track>Projects</div>
        </div>
      </section>
      <section id="contact" data-portfolio-section>
        Contact
      </section>
    </div>
  );
}

const flushFrame = () =>
  act(() => {
    const scheduled = [...frames.values()];
    frames.clear();
    scheduled.forEach((callback) => callback(16));
  });
const changeMedia = (query, matches) =>
  act(() => {
    const media = mediaQueries.get(query);
    media.matches = matches;
    media.listeners.forEach((listener) => listener({ matches }));
  });

beforeEach(() => {
  scrollPosition = 0;
  frames = new Map();
  mediaQueries = new Map();
  observers = [];
  resizeObservers = [];
  setDimension(window, "innerWidth", 1200);
  setDimension(window, "innerHeight", 800);
  Object.defineProperty(window, "scrollY", {
    configurable: true,
    get: () => scrollPosition,
  });
  setDimension(document.documentElement, "scrollHeight", 4600);
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query) => {
      if (!mediaQueries.has(query)) {
        mediaQueries.set(query, {
          matches: !query.includes("reduced-motion"),
          listeners: new Set(),
          addEventListener(_event, listener) {
            this.listeners.add(listener);
          },
          removeEventListener(_event, listener) {
            this.listeners.delete(listener);
          },
        });
      }
      return mediaQueries.get(query);
    }),
  );
  let frameId = 0;
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback) => {
      frameId += 1;
      frames.set(frameId, callback);
      return frameId;
    }),
  );
  vi.stubGlobal(
    "cancelAnimationFrame",
    vi.fn((id) => frames.delete(id)),
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback) {
        this.callback = callback;
        this.observe = vi.fn();
        this.unobserve = vi.fn();
        this.disconnect = vi.fn();
        observers.push(this);
      }
    },
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback) {
        this.callback = callback;
        this.observe = vi.fn();
        this.disconnect = vi.fn();
        resizeObservers.push(this);
      }
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("usePortfolioMotion", () => {
  it("enables the horizontal CSS layout before measuring its initial overflow", () => {
    const { container } = render(<Harness layoutDependsOnPinned />);
    const gallery = container.querySelector("[data-portfolio-gallery]");
    expect(gallery.dataset.galleryPinned).toBe("true");
    expect(gallery.style.getPropertyValue("--gallery-distance")).toBe("800px");
    scrollPosition = 2300;
    fireEvent.scroll(window);
    flushFrame();
    expect(gallery.style.getPropertyValue("--gallery-shift")).toBe("-400px");
  });

  it("batches native scrolling into gallery motion, section navigation, and pointer depth", () => {
    const { container } = render(<Harness />);
    const root = screen.getByTestId("root");
    const gallery = container.querySelector("[data-portfolio-gallery]");
    expect(root.dataset.motion).toBe("ready");
    expect(
      screen.getByTestId("first-reveal").classList.contains("is-visible"),
    ).toBe(true);
    expect(
      screen.getByTestId("later-reveal").classList.contains("is-visible"),
    ).toBe(false);
    expect(gallery.dataset.galleryPinned).toBe("true");
    expect(screen.getByTestId("state").textContent).toBe("top:false");

    scrollPosition = 2300;
    fireEvent.scroll(window);
    fireEvent.scroll(window);
    fireEvent(
      root,
      new MouseEvent("pointermove", {
        clientX: 1200,
        clientY: 0,
        bubbles: true,
      }),
    );
    expect(frames.size).toBe(1);
    flushFrame();
    expect(gallery.style.getPropertyValue("--gallery-progress")).toBe("0.5");
    expect(gallery.style.getPropertyValue("--gallery-shift")).toBe("-400px");
    expect(root.style.getPropertyValue("--page-progress")).toBe(
      String(2300 / 3800),
    );
    expect(root.style.getPropertyValue("--pointer-x")).toBe("1");
    expect(root.style.getPropertyValue("--pointer-y")).toBe("-1");
    expect(screen.getByTestId("state").textContent).toBe("features:false");

    act(() =>
      observers[0].callback([
        { isIntersecting: true, target: screen.getByTestId("later-reveal") },
      ]),
    );
    expect(
      screen.getByTestId("later-reveal").classList.contains("is-visible"),
    ).toBe(true);
    expect(observers[0].unobserve).toHaveBeenCalledWith(
      screen.getByTestId("later-reveal"),
    );
  });

  it("responds to reduced motion and viewport changes without concealing content", () => {
    const { container } = render(<Harness />);
    const gallery = container.querySelector("[data-portfolio-gallery]");
    const scene = container.querySelector("[data-hero-scene]");
    scrollPosition = 2300;
    fireEvent.scroll(window);
    flushFrame();
    expect(scene.style.getPropertyValue("--scene-scroll")).toBe("1");

    changeMedia("(prefers-reduced-motion: reduce)", true);
    flushFrame();
    expect(screen.getByTestId("state").textContent).toBe("features:true");
    expect(gallery.dataset.galleryPinned).toBe("false");
    expect(gallery.style.getPropertyValue("--gallery-shift")).toBe("0px");
    expect(scene.style.getPropertyValue("--scene-scroll")).toBe("0");
    expect(
      screen.getByTestId("later-reveal").classList.contains("is-visible"),
    ).toBe(true);

    changeMedia("(min-width: 901px)", false);
    changeMedia("(prefers-reduced-motion: reduce)", false);
    flushFrame();
    expect(gallery.dataset.galleryPinned).toBe("false");
    changeMedia("(min-width: 901px)", true);
    flushFrame();
    expect(gallery.dataset.galleryPinned).toBe("true");
    expect(gallery.style.getPropertyValue("--gallery-shift")).toBe("-400px");
  });

  it("shows all content without observers and restores owned DOM state on cleanup", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const { container, unmount } = render(<Harness />);
    const root = screen.getByTestId("root");
    const gallery = container.querySelector("[data-portfolio-gallery]");
    expect(
      screen.getByTestId("later-reveal").classList.contains("is-visible"),
    ).toBe(true);
    fireEvent.scroll(window);
    expect(frames.size).toBe(1);
    unmount();
    expect(frames.size).toBe(0);
    expect(root.dataset.motion).toBe("pending");
    expect(root.style.getPropertyValue("--pointer-x")).toBe("0.25");
    expect(root.style.getPropertyValue("--page-progress")).toBe("");
    expect(gallery.hasAttribute("data-gallery-pinned")).toBe(false);
    expect(resizeObservers[0].disconnect).toHaveBeenCalledOnce();
    mediaQueries.forEach((media) => expect(media.listeners.size).toBe(0));
    fireEvent.scroll(window);
    expect(frames.size).toBe(0);
  });
});
