import { useCallback, useEffect, useRef } from "react";
import { useMotionValueEvent, useReducedMotion, useScroll } from "framer-motion";

const clamp = (value) => Math.max(0, Math.min(1, value));
const progressThroughViewport = (element) => {
  const { top, height } = element.getBoundingClientRect();
  const viewport = window.innerHeight || 1;
  return clamp((viewport - top) / (viewport + height));
};

// All selectors are intentionally scoped to the portfolio root so this module cannot
// affect routes that share the application shell.
const usePortfolioScrollMotion = (rootRef) => {
  const { scrollY } = useScroll();
  const reducedMotion = useReducedMotion();
  const rafId = useRef(null);

  const updateTimeline = useCallback(() => {
    const root = rootRef.current;
    if (!root || reducedMotion) return;

    const hero = root.querySelector("[data-portfolio-motion='hero']");
    if (hero) {
      const progress = progressThroughViewport(hero);
      hero.style.transform = `translate3d(0, ${progress * -54}px, 0) rotateY(${-12 + progress * 12}deg) rotateX(${8 - progress * 8}deg)`;
      hero.style.opacity = `${1 - progress * 0.22}`;
    }

    const caseStudy = root.querySelector("[data-portfolio-motion='case-study']");
    const caseVisual = root.querySelector("[data-portfolio-motion='case-visual']");
    if (caseStudy && caseVisual) {
      const progress = progressThroughViewport(caseStudy);
      caseVisual.style.transform = `scale(${0.94 + progress * 0.06}) translate3d(0, ${(0.5 - progress) * 20}px, 0)`;
    }

    root.querySelectorAll("[data-portfolio-motion='decision-card']").forEach((card, index) => {
      const progress = clamp((progressThroughViewport(card) - index * 0.035) / 0.55);
      card.style.opacity = `${0.3 + progress * 0.7}`;
      card.style.transform = `translate3d(0, ${(1 - progress) * 30}px, 0)`;
    });

    root.querySelectorAll("[data-portfolio-motion='feature-card']").forEach((card, index) => {
      const progress = clamp((progressThroughViewport(card) - index * 0.04) / 0.55);
      card.style.opacity = `${0.3 + progress * 0.7}`;
      card.style.transform = `translate3d(0, ${(1 - progress) * 34}px, 0)`;
    });

    root.querySelectorAll("[data-portfolio-motion='architecture-step']").forEach((step, index) => {
      const progress = clamp((progressThroughViewport(step) - index * 0.05) / 0.55);
      step.style.opacity = `${0.35 + progress * 0.65}`;
      step.style.transform = `translate3d(${(1 - progress) * 24}px, 0, 0)`;
    });
  }, [reducedMotion, rootRef]);

  useMotionValueEvent(scrollY, "change", () => {
    if (rafId.current) return;
    rafId.current = window.requestAnimationFrame(() => {
      rafId.current = null;
      updateTimeline();
    });
  });

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    if (reducedMotion) {
      root.classList.remove("portfolio-motion-enabled");
      root.querySelectorAll("[data-portfolio-motion]").forEach((element) => {
        element.style.removeProperty("opacity");
        element.style.removeProperty("transform");
      });
      return undefined;
    }

    root.classList.add("portfolio-motion-enabled");
    updateTimeline();
    return () => {
      window.cancelAnimationFrame(rafId.current);
      root.classList.remove("portfolio-motion-enabled");
      root.querySelectorAll("[data-portfolio-motion]").forEach((element) => {
        element.style.removeProperty("opacity");
        element.style.removeProperty("transform");
      });
    };
  }, [reducedMotion, rootRef, updateTimeline]);
};

export default usePortfolioScrollMotion;
