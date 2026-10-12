import React, { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

export function positionMessageMenu(anchor, menu, bounds, outgoing) {
  const gap = 6;
  const width = Math.min(210, bounds.right - bounds.left);
  const below = Math.max(0, bounds.bottom - anchor.bottom - gap);
  const above = Math.max(0, anchor.top - bounds.top - gap);
  const upwards = below < menu.height && above > below;
  const maxHeight = upwards ? above : below;
  const height = Math.min(menu.height, maxHeight);
  return {
    left: Math.max(bounds.left, Math.min(outgoing ? anchor.right - width : anchor.left, bounds.right - width)),
    top: upwards ? anchor.top - gap - height : anchor.bottom + gap,
    width, maxHeight, placement: upwards ? "above" : "below",
  };
}

export default function MessageActionsPopover({ open, outgoing, triggerRef, menuRef, children }) {
  const [position, setPosition] = useState(null);
  const [host, setHost] = useState(null);
  useLayoutEffect(() => { setHost(triggerRef.current?.closest(".nexus-chat-page") || null); }, [triggerRef]);
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) return;
      const list = trigger.closest(".nexus-chat-message-list")?.getBoundingClientRect();
      const bounds = { left: Math.max(8, list?.left || 8), right: Math.min(window.innerWidth - 8, list?.right || window.innerWidth - 8), top: Math.max(8, list?.top || 8), bottom: Math.min(window.innerHeight - 8, list?.bottom || window.innerHeight - 8) };
      setPosition(positionMessageMenu(trigger.getBoundingClientRect(), { height: menu.scrollHeight }, bounds, outgoing));
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
    if (menuRef.current) observer?.observe(menuRef.current);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); observer?.disconnect(); };
  }, [open, outgoing, triggerRef, menuRef]);
  const menu = <div ref={menuRef} role="group" aria-label="Message actions menu" className="nx-chat-message-tools" data-open={open} data-placement={position?.placement}
    style={{ position: "fixed", top: position?.top || 0, left: position?.left || 0, right: "auto", width: position?.width || 210, maxHeight: position?.maxHeight, visibility: open && !position ? "hidden" : undefined }}>
    {children}
  </div>;
  return host ? createPortal(menu, host) : menu;
}
