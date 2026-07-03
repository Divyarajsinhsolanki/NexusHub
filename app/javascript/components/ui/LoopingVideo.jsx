import React, { useEffect, useState } from "react";

const prefersReducedMotion = () => {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
};

const LoopingVideo = ({ srcMp4, srcWebm, poster, className = "", ariaLabel = "" }) => {
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(mediaQuery.matches);
    updatePreference();

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", updatePreference);
      return () => mediaQuery.removeEventListener("change", updatePreference);
    }

    mediaQuery.addListener(updatePreference);
    return () => mediaQuery.removeListener(updatePreference);
  }, []);

  if (reducedMotion || (!srcMp4 && !srcWebm)) {
    return <img src={poster} alt={ariaLabel} className={className} loading="lazy" />;
  }

  return (
    <video
      className={className}
      poster={poster}
      muted
      autoPlay
      loop
      playsInline
      preload="metadata"
      aria-label={ariaLabel || undefined}
      aria-hidden={ariaLabel ? undefined : true}
    >
      {srcWebm ? <source src={srcWebm} type="video/webm" /> : null}
      {srcMp4 ? <source src={srcMp4} type="video/mp4" /> : null}
      {poster ? <img src={poster} alt={ariaLabel} /> : null}
    </video>
  );
};

export default LoopingVideo;
