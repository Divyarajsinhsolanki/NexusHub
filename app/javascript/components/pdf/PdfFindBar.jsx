import React, { useEffect, useRef } from "react";
import { ChevronDown, ChevronUp, Loader2, Search, X } from "lucide-react";

export default function PdfFindBar({ query, onQueryChange, matches = [], activeIndex = -1, onNavigate, onClose, searching = false, error }) {
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const navigate = (direction) => {
    if (!matches.length) return;
    const current = activeIndex < 0 ? (direction > 0 ? -1 : 0) : activeIndex;
    onNavigate((current + direction + matches.length) % matches.length);
  };
  const keyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (!searching) navigate(event.shiftKey ? -1 : 1);
    }
  };
  const resultLabel = searching ? "Searching…" : matches.length ? `${activeIndex >= 0 ? activeIndex + 1 : 0} of ${matches.length}` : query.trim() ? "No matches" : "Search this PDF";
  return (
    <div className="pdf-find-bar border-b border-slate-200 bg-white px-3 py-2" role="search" aria-label="Find in PDF" onKeyDown={keyDown}>
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        <input ref={inputRef} value={query} onChange={(event) => onQueryChange(event.target.value)} aria-label="Find in PDF" placeholder="Find text in this PDF" className="min-w-0 flex-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-sm" type="search" />
        <span className="whitespace-nowrap text-xs text-slate-500" role="status" aria-live="polite">{searching ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin" aria-hidden="true" /> : null}{resultLabel}</span>
        <button type="button" onClick={() => navigate(-1)} disabled={!matches.length || searching} className="toolbar-button" aria-label="Previous match" title="Previous match (Shift+Enter)"><ChevronUp className="h-4 w-4" /></button>
        <button type="button" onClick={() => navigate(1)} disabled={!matches.length || searching} className="toolbar-button" aria-label="Next match" title="Next match (Enter)"><ChevronDown className="h-4 w-4" /></button>
        <button type="button" onClick={onClose} className="toolbar-button" aria-label="Close PDF search"><X className="h-4 w-4" /></button>
      </div>
      {error ? <p className="mt-1 text-xs text-rose-600" role="alert">{String(error.message || error)}</p> : null}
    </div>
  );
}
