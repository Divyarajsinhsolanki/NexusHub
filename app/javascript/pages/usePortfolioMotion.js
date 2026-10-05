import { useEffect, useState } from "react";

const clamp = (value, minimum = 0, maximum = 1) =>
  Math.min(maximum, Math.max(minimum, value));
const motionQuery = "(prefers-reduced-motion: reduce)";
const desktopQuery = "(min-width: 901px)";
const pointerQuery = "(hover: hover) and (pointer: fine)";

// Scroll remains native. Only decorative transforms and the desktop project
// gallery follow it; every section stays in the document and keyboard order.
export default function usePortfolioMotion(rootRef, dependencies = []) {
  const [activeSection, setActiveSection] = useState("");
  const [reducedMotion, setReducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      Boolean(window.matchMedia?.(motionQuery).matches),
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof window === "undefined") return undefined;

    const motionMedia = window.matchMedia?.(motionQuery);
    const desktopMedia = window.matchMedia?.(desktopQuery);
    const pointerMedia = window.matchMedia?.(pointerQuery);
    const sections = [...root.querySelectorAll("[data-portfolio-section][id]")];
    const reveals = [...root.querySelectorAll("[data-reveal]")];
    const scenes = [...root.querySelectorAll("[data-hero-scene]")];
    const galleries = [
      ...root.querySelectorAll("[data-portfolio-gallery]"),
    ].map((section) => ({
      section,
      viewport: section.querySelector("[data-gallery-viewport]"),
      track: section.querySelector("[data-gallery-track]"),
    }));
    const originals = new Map();
    const originallyVisible = new Map(
      reveals.map((element) => [
        element,
        element.classList.contains("is-visible"),
      ]),
    );
    let frame = null;
    let pointerX = 0;
    let pointerY = 0;
    let stopped = false;

    const remember = (element, kind, name) => {
      if (!originals.has(element)) originals.set(element, new Map());
      const values = originals.get(element);
      const key = `${kind}:${name}`;
      if (!values.has(key)) {
        values.set(
          key,
          kind === "style"
            ? [
                element.style.getPropertyValue(name),
                element.style.getPropertyPriority(name),
              ]
            : element.getAttribute(name),
        );
      }
    };
    const style = (element, name, value) => {
      remember(element, "style", name);
      if (element.style.getPropertyValue(name) !== value)
        element.style.setProperty(name, value);
    };
    const attribute = (element, name, value) => {
      remember(element, "attribute", name);
      if (element.getAttribute(name) !== value)
        element.setAttribute(name, value);
    };
    const motionIsReduced = () => Boolean(motionMedia?.matches);
    const reveal = (element) => element.classList.add("is-visible");
    const revealAboveFold = () => {
      reveals.forEach((element) => {
        if (
          motionIsReduced() ||
          element.getBoundingClientRect().top <= window.innerHeight
        )
          reveal(element);
      });
    };
    const updateActiveSection = () => {
      if (!sections.length) return;
      const readingLine = window.innerHeight * 0.35;
      let current = sections[0].id;
      sections.forEach((section) => {
        if (section.getBoundingClientRect().top <= readingLine)
          current = section.id;
      });
      setActiveSection((previous) =>
        previous === current ? previous : current,
      );
    };

    const update = () => {
      frame = null;
      if (stopped) return;
      const reduced = motionIsReduced();
      const desktop = desktopMedia
        ? desktopMedia.matches
        : window.innerWidth >= 901;
      const finePointer = Boolean(pointerMedia?.matches) && !reduced;
      const scrollTop =
        window.scrollY || document.documentElement.scrollTop || 0;

      // The horizontal track layout itself is gated by this attribute. Enable
      // eligible galleries before measuring, otherwise their grid fallback has
      // no overflow and would never transition into a pinned gallery.
      galleries.forEach(({ section, viewport, track }) => {
        attribute(
          section,
          "data-gallery-pinned",
          String(desktop && !reduced && Boolean(viewport && track)),
        );
      });
      const galleryLayouts = galleries.map((gallery) => ({
        ...gallery,
        distance: Math.max(
          0,
          (gallery.track?.scrollWidth || 0) -
            (gallery.viewport?.clientWidth || 0),
        ),
      }));
      galleryLayouts.forEach(({ section, viewport, track, distance }) => {
        attribute(
          section,
          "data-gallery-pinned",
          String(
            desktop && !reduced && distance > 1 && Boolean(viewport && track),
          ),
        );
        style(section, "--gallery-distance", `${distance}px`);
      });
      const documentHeight = Math.max(
        document.documentElement.scrollHeight,
        document.body?.scrollHeight || 0,
      );

      attribute(root, "data-reduced-motion", String(reduced));
      style(
        root,
        "--page-progress",
        String(
          clamp(scrollTop / Math.max(documentHeight - window.innerHeight, 1)),
        ),
      );
      style(root, "--pointer-x", String(finePointer ? pointerX : 0));
      style(root, "--pointer-y", String(finePointer ? pointerY : 0));
      scenes.forEach((scene) => {
        const rect = scene.getBoundingClientRect();
        style(
          scene,
          "--scene-scroll",
          String(reduced ? 0 : clamp(-rect.top / Math.max(rect.height, 1))),
        );
      });
      galleryLayouts.forEach(({ section, viewport, track, distance }) => {
        const pinned =
          desktop && !reduced && distance > 1 && Boolean(viewport && track);
        // Read after setting distance: CSS can size the sticky section from it.
        const rect = section.getBoundingClientRect();
        const progress = pinned
          ? clamp(-rect.top / Math.max(rect.height - window.innerHeight, 1))
          : 0;
        style(section, "--gallery-progress", String(progress));
        style(section, "--gallery-shift", `${-progress * distance}px`);
      });
      updateActiveSection();
    };
    const requestFrame =
      window.requestAnimationFrame?.bind(window) ||
      ((callback) => window.setTimeout(callback, 16));
    const cancelFrame =
      window.cancelAnimationFrame?.bind(window) ||
      window.clearTimeout.bind(window);
    const schedule = () => {
      if (frame === null && !stopped) frame = requestFrame(update);
    };
    const onPointerMove = (event) => {
      if (
        motionIsReduced() ||
        !pointerMedia?.matches ||
        event.pointerType === "touch"
      )
        return;
      pointerX = clamp(
        (event.clientX / Math.max(window.innerWidth, 1)) * 2 - 1,
        -1,
        1,
      );
      pointerY = clamp(
        (event.clientY / Math.max(window.innerHeight, 1)) * 2 - 1,
        -1,
        1,
      );
      schedule();
    };
    const onPointerLeave = () => {
      pointerX = 0;
      pointerY = 0;
      schedule();
    };
    const onMediaChange = () => {
      setReducedMotion(motionIsReduced());
      if (motionIsReduced() || !pointerMedia?.matches) {
        pointerX = 0;
        pointerY = 0;
      }
      revealAboveFold();
      schedule();
    };
    const onResize = () => {
      revealAboveFold();
      schedule();
    };

    revealAboveFold();
    let revealObserver;
    let sectionObserver;
    if (window.IntersectionObserver) {
      revealObserver = new window.IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            reveal(entry.target);
            revealObserver.unobserve(entry.target);
          });
        },
        { rootMargin: "0px 0px -5% 0px", threshold: 0.08 },
      );
      reveals.forEach((element) => {
        if (!element.classList.contains("is-visible"))
          revealObserver.observe(element);
      });
      sectionObserver = new window.IntersectionObserver(updateActiveSection, {
        rootMargin: "-18% 0px -45% 0px",
        threshold: [0, 0.15, 0.35, 0.6, 1],
      });
      sections.forEach((section) => sectionObserver.observe(section));
    } else {
      reveals.forEach(reveal);
    }
    attribute(root, "data-motion", "ready");
    setReducedMotion(motionIsReduced());
    update();

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    root.addEventListener("pointermove", onPointerMove, { passive: true });
    root.addEventListener("pointerleave", onPointerLeave, { passive: true });
    const mediaQueries = [motionMedia, desktopMedia, pointerMedia].filter(
      Boolean,
    );
    mediaQueries.forEach((media) => {
      if (media.addEventListener)
        media.addEventListener("change", onMediaChange);
      else media.addListener?.(onMediaChange);
    });
    let resizeObserver;
    if (window.ResizeObserver) {
      resizeObserver = new window.ResizeObserver(schedule);
      galleries.forEach(({ viewport, track }) => {
        if (viewport) resizeObserver.observe(viewport);
        if (track) resizeObserver.observe(track);
      });
    }

    return () => {
      stopped = true;
      if (frame !== null) cancelFrame(frame);
      revealObserver?.disconnect();
      sectionObserver?.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", onResize);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerleave", onPointerLeave);
      mediaQueries.forEach((media) => {
        if (media.removeEventListener)
          media.removeEventListener("change", onMediaChange);
        else media.removeListener?.(onMediaChange);
      });
      originals.forEach((values, element) =>
        values.forEach((value, key) => {
          const separator = key.indexOf(":");
          const kind = key.slice(0, separator);
          const name = key.slice(separator + 1);
          if (kind === "style") {
            if (value[0]) element.style.setProperty(name, value[0], value[1]);
            else element.style.removeProperty(name);
          } else if (value === null) element.removeAttribute(name);
          else element.setAttribute(name, value);
        }),
      );
      originallyVisible.forEach((visible, element) =>
        element.classList.toggle("is-visible", visible),
      );
    };
    // Content changes can add sections/reveal targets; callers supply stable
    // scalar dependencies for that data, rather than recreating the root ref.
  }, [rootRef, ...dependencies]);

  return { activeSection, reducedMotion };
}
