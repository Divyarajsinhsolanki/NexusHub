import React, { useEffect, useState } from "react";

export default function PostImage({ src }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { setFailed(false); setAttempt(0); }, [src]);
  if (!src) return null;
  const retryUrl = attempt ? `${src}${src.includes("?") ? "&" : "?"}retry=${attempt}` : src;
  return <div className="border-y border-shell-border bg-surface-card">
    {failed ? <div className="flex flex-wrap items-center justify-center gap-3 p-6 text-sm text-shell-muted" role="status">
      <span>This post’s image could not be loaded.</span>
      <button type="button" className="font-semibold text-theme hover:underline" onClick={() => { setAttempt(Date.now()); setFailed(false); }}>Retry image</button>
      <a href={src} target="_blank" rel="noopener noreferrer" className="font-semibold text-theme hover:underline">Open original</a>
    </div> : <img key={retryUrl} src={retryUrl} alt="Post attachment" className="mx-auto h-auto max-h-[500px] w-full object-contain" loading="lazy" onError={() => setFailed(true)} />}
  </div>;
}
