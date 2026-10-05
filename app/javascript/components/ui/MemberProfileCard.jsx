import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { FiBriefcase, FiExternalLink, FiMail, FiPhone, FiX } from "react-icons/fi";
import Avatar from "./Avatar";

export const profileCardPosition = (anchor, card, viewport) => {
  const margin = 12;
  const gap = 8;
  const width = Math.min(352, Math.max(0, viewport.width - margin * 2));
  const height = Math.min(card.height, Math.max(0, viewport.height - margin * 2));
  const below = anchor.bottom + gap;
  const top = below + height <= viewport.height - margin ? below : anchor.top - gap - height;
  return {
    width,
    left: Math.max(margin, Math.min(anchor.left, viewport.width - width - margin)),
    top: Math.max(margin, Math.min(top, viewport.height - height - margin)),
  };
};

const safeSocialUrl = (value) => {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch { return null; }
};

const MemberProfileCard = ({ member = {}, compact = false, children, className = "" }) => {
  const name = member.name || member.full_name || [member.first_name, member.last_name].filter(Boolean).join(" ") || "Invited user";
  const picture = member.profile_picture || member.profile_picture_url;
  const phone = member.phone_number || member.phone;
  const id = useId();
  const trigger = useRef(null);
  const panel = useRef(null);
  const closeTimer = useRef(null);
  const ignoreFocus = useRef(false);
  const pinned = useRef(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const clearTimer = () => window.clearTimeout(closeTimer.current);
  const show = () => { clearTimer(); setOpen(true); };
  const close = () => { clearTimer(); pinned.current = false; setOpen(false); setPosition(null); };
  const scheduleClose = () => {
    clearTimer();
    if (!pinned.current && !panel.current?.contains(document.activeElement)) closeTimer.current = window.setTimeout(close, 180);
  };
  const onBlur = (event) => {
    if (!trigger.current?.contains(event.relatedTarget) && !panel.current?.contains(event.relatedTarget)) close();
  };

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  useLayoutEffect(() => {
    if (!open) return undefined;
    const update = () => {
      if (!trigger.current || !panel.current) return;
      setPosition(profileCardPosition(trigger.current.getBoundingClientRect(), panel.current.getBoundingClientRect(), {
        width: window.innerWidth, height: window.innerHeight,
      }));
    };
    update();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(panel.current);
    const onScroll = (event) => { if (!panel.current?.contains(event.target)) close(); };
    const onPointerDown = (event) => {
      if (!trigger.current?.contains(event.target) && !panel.current?.contains(event.target)) close();
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
        ignoreFocus.current = true;
        trigger.current?.focus();
        ignoreFocus.current = false;
      }
      if (event.key === "Tab") {
        const controls = Array.from(panel.current?.querySelectorAll("button, a[href]") || []);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!event.shiftKey && document.activeElement === trigger.current && first) {
          event.preventDefault(); first.focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); trigger.current?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          close();
          ignoreFocus.current = true;
          trigger.current?.focus();
          ignoreFocus.current = false;
        }
      }
    };
    window.addEventListener("resize", update);
    document.addEventListener("scroll", onScroll, true);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
      document.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  return <>
    <button
      ref={trigger} type="button" className={`member-profile-trigger ${compact ? "member-profile-trigger-compact" : ""} ${className}`}
      aria-label={`Preview ${name}'s profile`} aria-expanded={open} aria-controls={open ? id : undefined} aria-haspopup="dialog"
      onMouseEnter={show} onMouseLeave={scheduleClose} onBlur={onBlur}
      onFocus={() => { if (!ignoreFocus.current) show(); }}
      onClick={(event) => { event.stopPropagation(); pinned.current = true; show(); }}
    >
      {children || <>
        <Avatar name={name} src={picture} className={compact ? "h-9 w-9 text-sm shrink-0" : "h-11 w-11 text-base shrink-0"} />
        {!compact && <span className="min-w-0 space-y-1">
          <span className="block font-semibold text-shell-text-strong break-words">{name}</span>
          {member.role && <span className="block text-sm capitalize text-shell-muted">{member.role.replaceAll("_", " ")}</span>}
          {member.email && <span className="block text-sm text-shell-muted break-all">{member.email}</span>}
          {typeof member.allocation_percentage === "number" && <span className="block text-xs text-shell-muted">Allocation: {member.allocation_percentage}%</span>}
        </span>}
      </>}
    </button>
    {open && createPortal(
      <section ref={panel} id={id} role="dialog" aria-label={`${name}'s profile preview`}
        className="member-profile-popover" style={{ ...position, visibility: position ? "visible" : "hidden" }}
        onMouseEnter={clearTimer} onMouseLeave={scheduleClose} onBlur={onBlur} onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start gap-3">
          <Avatar name={name} src={picture} className="h-12 w-12 shrink-0 text-lg" />
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-shell-text-strong break-words">{name}</h3>
            <p className="text-sm text-shell-muted break-words">{member.job_title || "Team member"}</p>
            {member.department_name && <p className="mt-1 text-xs text-shell-muted break-words">{member.department_name}</p>}
          </div>
          <button type="button" aria-label="Close profile preview" className="member-profile-close" onClick={() => {
            close(); ignoreFocus.current = true; trigger.current?.focus(); ignoreFocus.current = false;
          }}><FiX aria-hidden="true" /></button>
        </div>
        <div className="mt-4 space-y-2 text-sm text-shell-muted">
          {member.email && <a className="member-profile-contact" href={`mailto:${member.email}`}><FiMail aria-hidden="true" /><span>{member.email}</span></a>}
          {phone && <a className="member-profile-contact" href={`tel:${phone}`}><FiPhone aria-hidden="true" /><span>{phone}</span></a>}
          {member.role && <p className="member-profile-contact capitalize"><FiBriefcase aria-hidden="true" /><span>{member.role.replaceAll("_", " ")}</span></p>}
          {member.workload_status && <p className="text-xs capitalize">Workload: {member.workload_status.replaceAll("_", " ")}</p>}
          {typeof member.allocation_percentage === "number" && <p className="text-xs">Allocation: {member.allocation_percentage}%</p>}
        </div>
        {member.bio && <p className="mt-4 text-sm leading-6 text-shell-muted break-words">{member.bio}</p>}
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          {Object.entries({ linkedin: "LinkedIn", github: "GitHub", twitter: "Twitter", website: "Website" }).map(([key, label]) => {
            const href = safeSocialUrl(member.social_links?.[key]);
            return href ? <a key={key} href={href} target="_blank" rel="noopener noreferrer" className="text-theme hover:underline">{label}</a> : null;
          })}
        </div>
        {member.id != null && <Link className="member-profile-view" to={`/profile/${member.id}`} onClick={close}>View full profile <FiExternalLink aria-hidden="true" /></Link>}
      </section>, document.body
    )}
  </>;
};
export default MemberProfileCard;
