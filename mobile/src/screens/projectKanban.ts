import { addDays, differenceInCalendarDays, endOfDay, format, isWithinInterval, parseISO, startOfDay } from 'date-fns';

import type { Sprint, Task, TaskStatus } from '../api/types';

export type BoardMode = 'combined' | 'dev' | 'qa';
export type BoardScope = 'all' | 'mine';

export const KANBAN_STATUSES: Array<{ value: TaskStatus; label: string }> = [
  { value: 'todo', label: 'To do' },
  { value: 'inprogress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
];

export function initialSprint(sprints: Sprint[], now = new Date()) {
  return sprints.find((sprint) => isWithinInterval(now, { start: startOfDay(parseISO(sprint.start_date)), end: endOfDay(parseISO(sprint.end_date)) })) || sprints[0];
}

export function sprintWeekStarts(sprint?: Sprint) {
  if (!sprint) return [];
  const start = parseISO(sprint.start_date);
  const days = differenceInCalendarDays(parseISO(sprint.end_date), start) + 1;
  return Array.from({ length: Math.max(1, Math.ceil(days / 7)) }, (_, index) => addDays(start, index * 7));
}

export function defaultSprintWeek(starts: Date[], now = new Date()) {
  const index = starts.findIndex((start) => isWithinInterval(now, { start, end: addDays(start, 6) }));
  return index >= 0 ? index : 0;
}

export function weekDateRange(start: Date) {
  return { due_from: format(start, 'yyyy-MM-dd'), due_to: format(addDays(start, 6), 'yyyy-MM-dd') };
}

export function dueDays(tasks: Task[], start: Date) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = format(addDays(start, index), 'yyyy-MM-dd');
    const matching = tasks.filter((task) => task.end_date === date);
    return { date, tasks: matching, count: matching.length };
  });
}

export function completionSummary(counts: Record<TaskStatus, number>) {
  const total = counts.todo + counts.inprogress + counts.completed;
  return { ...counts, total, percentage: total ? Math.round((counts.completed / total) * 100) : 0 };
}

export function modeTaskType(mode: BoardMode) {
  return mode === 'dev' ? 'Code' as const : mode === 'qa' ? 'qa' as const : undefined;
}

export function dropStatusAt(x: number, y: number, width: number, height: number): TaskStatus | undefined {
  if (y < height - 230) return undefined;
  return KANBAN_STATUSES[Math.max(0, Math.min(2, Math.floor(x / (width / 3))))]?.value;
}
