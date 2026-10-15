import { useEffect, useState } from "react";

const clamp = (value, minimum = 0, maximum = 1) =>
  Math.min(maximum, Math.max(minimum, value));
const motionQuery = "(prefers-reduced-motion: reduce)";
const pointerQuery = "(hover: hover) and (pointer: fine)";

// Native scrolling drives decorative motion and section navigation only.
export default function usePortfolioMotion(rootRef, dependencies = [], motionEnabled = true) {
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
    const pointerMedia = window.matchMedia?.(pointerQuery);
    const sections = [...root.querySelectorAll("[data-portfolio-section][id]")];
    const reveals = [...root.querySelectorAll("[data-reveal]")];
    const scenes = [...root.querySelectorAll("[data-hero-scene]")];
    const parallaxLayers = [...root.querySelectorAll("[data-parallax]")];
    const scrollScenes = [...root.querySelectorAll("[data-scroll-scene]")];
    const ribbons = [...root.querySelectorAll("[data-kinetic]")];
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
    let easedScroll = window.scrollY || 0;
    let lastScroll = easedScroll;
    let velocity = 0;
    let lastFrameTime = 0;

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
    const motionIsReduced = () => !motionEnabled || Boolean(motionMedia?.matches);
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

    const update = (time = 0) => {
      frame = null;
      if (stopped) return;
      const reduced = motionIsReduced();
      const finePointer = Boolean(pointerMedia?.matches) && !reduced;
      const scrollTop =
        window.scrollY || document.documentElement.scrollTop || 0;

      const elapsed = lastFrameTime ? clamp(time - lastFrameTime, 8, 64) : 16;
      lastFrameTime = time;
      const ease = 1 - Math.pow(0.8, elapsed / 16);
      easedScroll = reduced ? scrollTop : easedScroll + (scrollTop - easedScroll) * ease;
      if (Math.abs(scrollTop - easedScroll) < 0.25) easedScroll = scrollTop;
      velocity = reduced ? 0 : velocity * 0.82 + clamp((scrollTop - lastScroll) / elapsed, -3, 3) * 0.18;
      if (Math.abs(velocity) < 0.002) velocity = 0;
      lastScroll = scrollTop;

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
      const mobile = window.innerWidth < 901;
      // Decorative layers ease behind native scrolling; links, focus and content
      // stay in the normal document flow. No wheel/touch events are intercepted.
      parallaxLayers.forEach((layer) => {
        const section = layer.closest("[data-portfolio-section]");
        const rect = (section || layer).getBoundingClientRect();
        const offset = window.innerHeight * 0.4 - (rect.top + scrollTop - easedScroll);
        const speed = Number(layer.dataset.parallax) || 0;
        const displacement = reduced ? 0 : clamp(offset * speed * (mobile ? 0.35 : 1), -120, 120);
        style(layer, "--parallax-y", `${displacement}px`);
      });
      sections.forEach((section) => {
        const rect = section.getBoundingClientRect();
        style(section, "--section-progress", String(reduced ? 0 : clamp((window.innerHeight - rect.top) / (window.innerHeight + rect.height))));
      });
      scrollScenes.forEach((scene) => {
        const rect = scene.getBoundingClientRect();
        const progress = reduced || mobile ? 1 : clamp((110 - rect.top) / Math.max(rect.height - window.innerHeight * 0.78, 1));
        style(scene, "--cinema-progress", String(progress));
      });
      ribbons.forEach((ribbon) => {
        const rect = ribbon.getBoundingClientRect();
        const progress = clamp((window.innerHeight - rect.top) / (window.innerHeight + rect.height));
        style(ribbon, "--ribbon-shift", `${reduced ? 0 : (progress - 0.5) * (mobile ? 100 : 240)}px`);
        style(ribbon, "--ribbon-skew", `${velocity * -1.8}deg`);
      });
      updateActiveSection();
      if (!reduced && (Math.abs(scrollTop - easedScroll) >= 0.25 || velocity !== 0)) schedule();
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
    const mediaQueries = [motionMedia, pointerMedia].filter(
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
      resizeObserver.observe(root);
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
  }, [rootRef, motionEnabled, ...dependencies]);

  return { activeSection, reducedMotion };
}
