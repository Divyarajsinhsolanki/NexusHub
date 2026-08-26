import { describe, expect, it } from 'vitest';

import { moveSchedulerLog, schedulerDropTarget } from './schedulerDrag';

describe('scheduler drag and drop', () => {
  it('parses a valid date and member drop target', () => {
    expect(schedulerDropTarget({
      draggableId: '91',
      source: { droppableId: '2026-08-10:4', index: 0 },
      destination: { droppableId: '2026-08-11:7', index: 1 },
    })).toEqual({ taskId: '91', logDate: '2026-08-11', developerId: 7 });
  });

  it('ignores cancelled, unchanged, and malformed drops', () => {
    expect(schedulerDropTarget({ draggableId: '91', destination: null })).toBeNull();
    expect(schedulerDropTarget({
      draggableId: '91',
      source: { droppableId: '2026-08-10:4', index: 0 },
      destination: { droppableId: '2026-08-10:4', index: 0 },
    })).toBeNull();
    expect(schedulerDropTarget({
      draggableId: '91',
      source: { droppableId: '2026-08-10:4', index: 0 },
      destination: { droppableId: 'invalid', index: 0 },
    })).toBeNull();
  });

  it('moves only the selected log in optimistic state', () => {
    const logs = [
      { id: 91, log_date: '2026-08-10', developer_id: 4 },
      { id: 92, log_date: '2026-08-10', developer_id: 4 },
    ];
    expect(moveSchedulerLog(logs, { taskId: '91', logDate: '2026-08-11', developerId: 7 })).toEqual([
      { id: 91, log_date: '2026-08-11', developer_id: 7 },
      logs[1],
    ]);
  });
});
