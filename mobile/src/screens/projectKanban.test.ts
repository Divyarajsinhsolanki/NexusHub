import { describe, expect, test } from '@jest/globals';

import type { Sprint, Task } from '../api/types';
import { completionSummary, defaultSprintWeek, dropStatusAt, dueDays, initialSprint, modeTaskType, sprintWeekStarts, weekDateRange } from './projectKanban';

const sprint = (id: number, start: string, end: string): Sprint => ({ id, project_id: 1, name: `Sprint ${id}`, start_date: start, end_date: end, status: 'active', progress: 0, task_count: 0 });
const task = (id: number, end_date: string, status: Task['status'] = 'todo'): Task => ({ id, title: `Task ${id}`, type: 'Code', status, end_date });

describe('project Kanban calculations', () => {
  test('selects the current sprint and falls back to the first sorted sprint', () => {
    const rows = [sprint(2, '2026-08-10', '2026-08-20'), sprint(1, '2026-08-01', '2026-08-07')];

    expect(initialSprint(rows, new Date('2026-08-04T12:00:00')).id).toBe(1);
    expect(initialSprint(rows, new Date('2026-09-01T12:00:00')).id).toBe(2);
  });

  test('builds sprint weeks and selects the week containing today', () => {
    const starts = sprintWeekStarts(sprint(1, '2026-08-01', '2026-08-16'));

    expect(starts).toHaveLength(3);
    expect(weekDateRange(starts[1])).toEqual({ due_from: '2026-08-08', due_to: '2026-08-14' });
    expect(defaultSprintWeek(starts, new Date('2026-08-10T12:00:00'))).toBe(1);
  });

  test('groups due tasks across the selected seven-day window', () => {
    const start = new Date('2026-08-03T12:00:00');
    const days = dueDays([task(1, '2026-08-03'), task(2, '2026-08-05'), task(3, '2026-08-05', 'completed')], start);

    expect(days.map((day) => day.count)).toEqual([1, 0, 2, 0, 0, 0, 0]);
    expect(days[2].tasks.map((item) => item.id)).toEqual([2, 3]);
  });

  test('calculates completion and mode filters', () => {
    expect(completionSummary({ todo: 2, inprogress: 1, completed: 1 })).toEqual({ todo: 2, inprogress: 1, completed: 1, total: 4, percentage: 25 });
    expect(modeTaskType('dev')).toBe('Code');
    expect(modeTaskType('qa')).toBe('qa');
    expect(modeTaskType('combined')).toBeUndefined();
  });

  test('maps bottom drop targets into the three canonical statuses', () => {
    expect(dropStatusAt(20, 780, 390, 844)).toBe('todo');
    expect(dropStatusAt(190, 780, 390, 844)).toBe('inprogress');
    expect(dropStatusAt(370, 780, 390, 844)).toBe('completed');
    expect(dropStatusAt(190, 400, 390, 844)).toBeUndefined();
  });
});
