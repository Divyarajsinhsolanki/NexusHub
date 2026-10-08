import React, { useContext, useEffect, useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { ArrowUp, ArrowDown, GripVertical } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import { AuthContext } from '../../context/AuthContext';
import { HOME_CARDS, HOME_SHORTCUTS, normalizeHomePreferences } from '../../utils/homeShortcuts';

export default function HomeShortcutSettings() {
  const { user, setUser } = useContext(AuthContext);
  const [preferences, setPreferences] = useState(() => normalizeHomePreferences(user?.home_preferences));
  const [saving, setSaving] = useState(false);
  const savedPreferences = JSON.stringify(normalizeHomePreferences(user?.home_preferences));
  useEffect(() => { setPreferences(JSON.parse(savedPreferences)); }, [user?.id, savedPreferences]);
  const selected = preferences.shortcut_ids.map(id => HOME_SHORTCUTS.find(link => link.id === id));
  const links = [...selected, ...HOME_SHORTCUTS.filter(link => !preferences.shortcut_ids.includes(link.id))];
  const toggle = (id) => setPreferences(current => ({ ...current, shortcut_ids: current.shortcut_ids.includes(id) ? current.shortcut_ids.filter(value => value !== id) : [...current.shortcut_ids, id] }));
  const move = (id, direction) => setPreferences(current => {
    const ids = [...current.shortcut_ids];
    const index = ids.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return current;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    return { ...current, shortcut_ids: ids };
  });
  const reorderCards = (source, destination) => setPreferences(current => {
    if (destination < 0 || destination >= current.card_order.length || source === destination) return current;
    const order = [...current.card_order];
    const [key] = order.splice(source, 1);
    order.splice(destination, 0, key);
    return { ...current, card_order: order };
  });
  const onCardDragEnd = result => {
    if (saving || !result.destination) return;
    reorderCards(result.source.index, result.destination.index);
  };
  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.post('/update_profile', { auth: { home_preferences: preferences } });
      const saved = normalizeHomePreferences(data.home_preferences);
      setPreferences(saved);
      setUser(current => ({ ...current, home_preferences: saved }));
      try { window.localStorage.setItem(`nexus-home-preferences-updated:${user.id}`, String(Date.now())); } catch { /* Account persistence does not depend on browser storage. */ }
      toast.success('Home shortcuts saved.');
    } catch {
      toast.error('Unable to save home shortcuts. Please try again.');
    } finally { setSaving(false); }
  };
  return (
    <section className="space-y-6" aria-label="Home shortcut settings">
      <div><h3 className="text-lg font-semibold text-primary">Home layout and shortcuts</h3><p className="mt-1 text-sm text-muted">Show or hide sidebar cards, then choose and reorder your Quick access links.</p></div>
      <fieldset disabled={saving} className="space-y-2">
        <legend className="mb-3 text-sm font-semibold text-primary">Sidebar cards</legend>
        <p className="mb-3 text-sm text-muted">Drag the grip to rearrange cards. Hidden cards keep their place when you show them again.</p>
        <DragDropContext onDragEnd={onCardDragEnd}>
          <Droppable droppableId="home-sidebar-cards">
            {provided => <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
              {preferences.card_order.map((key, index) => {
                const card = HOME_CARDS.find(item => item.key === key);
                return <Draggable key={key} draggableId={key} index={index} isDragDisabled={saving}>
                  {(drag, snapshot) => <div ref={drag.innerRef} {...drag.draggableProps} className={`flex items-center gap-3 rounded-xl border border-default bg-surface-card px-3 py-4 ${snapshot.isDragging ? 'shadow-lg ring-2 ring-theme/30' : ''}`}>
                    <span {...drag.dragHandleProps} aria-label={`Rearrange ${card.label}`} className="shrink-0 cursor-grab rounded-lg p-2 text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-theme active:cursor-grabbing"><GripVertical size={20} /></span>
                    <label className="flex min-w-0 flex-1 items-center justify-between gap-3 text-sm text-primary">
                      <span>{card.label}</span>
                      <input type="checkbox" aria-label={`Show ${card.label} on Home`} checked={preferences[key]} onChange={event => setPreferences(current => ({ ...current, [key]: event.target.checked }))} className="h-4 w-4 shrink-0 accent-[var(--theme-color)]" />
                    </label>
                    <div className="flex shrink-0 gap-1">
                      <button type="button" aria-label={`Move ${card.label} card up`} disabled={index === 0 || saving} onClick={() => reorderCards(index, index - 1)} className="app-secondary-button p-2 disabled:opacity-30"><ArrowUp size={16} /></button>
                      <button type="button" aria-label={`Move ${card.label} card down`} disabled={index === preferences.card_order.length - 1 || saving} onClick={() => reorderCards(index, index + 1)} className="app-secondary-button p-2 disabled:opacity-30"><ArrowDown size={16} /></button>
                    </div>
                  </div>}
                </Draggable>;
              })}
              {provided.placeholder}
            </div>}
          </Droppable>
        </DragDropContext>
      </fieldset>
      <fieldset disabled={saving} className="space-y-2">
        <legend className="mb-3 text-sm text-muted">Check a link to show it. Use the arrows to reorder selected links.</legend>
        {links.map(link => {
          const index = preferences.shortcut_ids.indexOf(link.id);
          return <div key={link.id} className="flex items-center justify-between gap-3 rounded-xl border border-default px-4 py-3">
            <label className="flex items-center gap-3 text-sm text-primary"><input type="checkbox" checked={index >= 0} onChange={() => toggle(link.id)} className="h-4 w-4 accent-[var(--theme-color)]" />{link.label}</label>
            {index >= 0 && <div className="flex gap-1">
              <button type="button" aria-label={`Move ${link.label} up`} disabled={index === 0} onClick={() => move(link.id, -1)} className="app-secondary-button p-2 disabled:opacity-30"><ArrowUp size={16} /></button>
              <button type="button" aria-label={`Move ${link.label} down`} disabled={index === selected.length - 1} onClick={() => move(link.id, 1)} className="app-secondary-button p-2 disabled:opacity-30"><ArrowDown size={16} /></button>
            </div>}
          </div>;
        })}
      </fieldset>
      {!preferences.show_shortcuts && <p className="text-sm text-muted">Quick access is hidden. Your chosen links and order will be kept.</p>}
      {preferences.show_shortcuts && selected.length === 0 && <p className="text-sm text-muted">Quick access will show an empty state until you select a link.</p>}
      <div className="flex justify-end border-t border-default pt-6"><button type="button" onClick={save} disabled={saving} className="app-primary-button">{saving ? 'Saving…' : 'Save Home settings'}</button></div>
    </section>
  );
}
