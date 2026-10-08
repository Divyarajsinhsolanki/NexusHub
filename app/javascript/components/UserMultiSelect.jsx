import React, { useState, useEffect, useLayoutEffect, useRef, useId } from "react";
import { createPortal } from "react-dom";
import { getUsers } from "./api";

const userName = user => `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.name || user.email;
const UserMultiSelect = ({ selectedUsers, setSelectedUsers, excludedIds = [], placeholder = "Search users..." }) => {
  const [allUsers, setAllUsers] = useState([]);
  const [query, setQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [position, setPosition] = useState(null);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const listId = useId();
  useEffect(() => {
    let active = true;
    setLoading(true); setError(false);
    getUsers().then(({ data }) => { if (active) setAllUsers(Array.isArray(data) ? data : []); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);
  useEffect(() => {
    const outside = event => {
      if (!containerRef.current?.contains(event.target) && !dropdownRef.current?.contains(event.target)) setShowDropdown(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('focusin', outside); };
  }, []);
  useLayoutEffect(() => {
    if (!showDropdown) return;
    const updatePosition = () => {
      const rect = inputRef.current.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const opensAbove = below < 180 && above > below;
      const maxHeight = Math.max(48, Math.min(260, opensAbove ? above : below));
      const width = Math.min(rect.width, window.innerWidth - 24);
      setPosition({ position: 'fixed', zIndex: 1600, width, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), maxHeight,
        ...(opensAbove ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }) });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updatePosition) : null;
    observer?.observe(inputRef.current);
    return () => { window.removeEventListener('resize', updatePosition); window.removeEventListener('scroll', updatePosition, true); observer?.disconnect(); };
  }, [showDropdown]);
  const filtered = allUsers.filter(user => {
    const id = String(user.id);
    return `${userName(user)} ${user.email || ''}`.toLowerCase().includes(query.toLowerCase()) &&
      !selectedUsers.some(selected => String(selected.id) === id) && !excludedIds.some(excluded => String(excluded) === id);
  });
  const addUser = user => {
    if (!selectedUsers.some(selected => String(selected.id) === String(user.id))) setSelectedUsers([...selectedUsers, user]);
    setQuery(''); inputRef.current.focus(); setShowDropdown(false);
  };
  const onKeyDown = event => {
    if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); inputRef.current.focus(); setShowDropdown(false); }
    if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.stopPropagation(); event.preventDefault(); setShowDropdown(true);
      const options = [...(dropdownRef.current?.querySelectorAll('[role="option"]') || [])];
      const current = options.indexOf(document.activeElement);
      const next = event.key === 'ArrowDown' ? Math.min(current + 1, options.length - 1) : Math.max(current - 1, 0);
      options[next]?.focus();
    }
  };
  return <div className="relative" ref={containerRef} onKeyDown={onKeyDown}>
    <div className="mb-1 flex flex-wrap gap-2">
      {selectedUsers.map(user => <span key={user.id} className="flex items-center rounded-full bg-blue-100 px-2 py-1 text-sm text-blue-800">
        {userName(user)}<button type="button" aria-label={`Remove ${userName(user)}`} className="ml-2" onClick={() => setSelectedUsers(selectedUsers.filter(selected => String(selected.id) !== String(user.id)))}>×</button>
      </span>)}
    </div>
    <input ref={inputRef} type="text" value={query} aria-label={placeholder} aria-expanded={showDropdown} aria-controls={showDropdown ? listId : undefined} aria-haspopup="listbox"
      onChange={event => { setQuery(event.target.value); setShowDropdown(true); }} onFocus={() => setShowDropdown(true)} placeholder={placeholder}
      className="w-full rounded-lg border border-default bg-surface-card p-2 text-primary outline-none focus:border-theme focus:ring-2 focus:ring-theme/20" />
    {showDropdown && position && createPortal(<div ref={dropdownRef} style={position} onKeyDown={onKeyDown} className="overflow-y-auto overscroll-contain rounded-xl border border-default bg-surface-elevated text-primary shadow-xl">
      {loading ? <p role="status" className="p-3 text-sm text-muted">Loading people…</p> : error ? <div className="p-3 text-sm"><p role="alert">People couldn’t be loaded.</p><button type="button" onClick={() => setRevision(value => value + 1)} className="mt-2 text-theme">Try again</button></div> :
        <ul id={listId} role="listbox" aria-label="Available people">{filtered.length === 0 ? <li className="p-3 text-sm text-muted">No matching people available.</li> : filtered.map(user => <li key={user.id} role="presentation">
          <button type="button" role="option" aria-selected="false" onClick={() => addUser(user)} className="block w-full px-3 py-2.5 text-left hover:bg-muted-surface focus:bg-muted-surface focus:outline-none">
            <span className="block text-sm font-medium">{userName(user)}</span><span className="block break-all text-xs text-muted">{user.email}</span>
          </button></li>)}</ul>}
    </div>, document.body)}
  </div>;
};
export default UserMultiSelect;
