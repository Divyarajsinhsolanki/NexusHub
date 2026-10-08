export const HOME_SHORTCUTS = [
  { id: 'chat', label: 'Team chat', path: '/chat' },
  { id: 'knowledge', label: 'Knowledge library', path: '/knowledge' },
  { id: 'pdf-master', label: 'PDF Master', path: '/pdf-master' },
  { id: 'planning', label: 'My planning', path: '/planning' },
  { id: 'calendar', label: 'Calendar', path: '/calendar' },
  { id: 'projects', label: 'Projects', path: '/projects' },
  { id: 'vault', label: 'Personal vault', path: '/vault' },
  { id: 'worklog', label: 'Work logs', path: '/worklog' },
  { id: 'teams', label: 'Teams', path: '/teams' },
  { id: 'notifications', label: 'Notifications', path: '/notifications' },
];
export const HOME_CARDS = [
  { key: 'show_overview', label: 'Today’s overview' },
  { key: 'show_shortcuts', label: 'Quick access' },
  { key: 'show_due_tasks', label: 'Tasks due today' },
  { key: 'show_tasks', label: 'My tasks' },
  { key: 'show_projects', label: 'Projects' },
  { key: 'show_birthdays', label: 'Upcoming birthdays' },
];
const DEFAULT_LINKS = ['chat', 'knowledge', 'pdf-master'];
export function normalizeHomePreferences(value) {
  return {
    ...Object.fromEntries(HOME_CARDS.map(card => [card.key, value?.[card.key] !== false])),
    card_order: [...new Set([
      ...(Array.isArray(value?.card_order) ? value.card_order.filter(key => HOME_CARDS.some(card => card.key === key)) : []),
      ...HOME_CARDS.map(card => card.key),
    ])],
    shortcut_ids: Array.isArray(value?.shortcut_ids)
      ? [...new Set(value.shortcut_ids)].filter(id => HOME_SHORTCUTS.some(link => link.id === id))
      : [...DEFAULT_LINKS],
  };
}
