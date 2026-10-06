// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SchedulerAPI } from '../components/api';
import SprintOverview from './SprintOverview';

vi.mock('../components/api', () => ({ SchedulerAPI: { getTasks: vi.fn() } }));
vi.mock('../utils/avatar', () => ({ getAvatarInitial: () => 'U' }));
vi.mock('@hello-pangea/dnd', () => ({ DragDropContext: ({ children }) => children, Droppable: () => null, Draggable: () => null }));
afterEach(cleanup);

it.each([{ tasks: [] }, { tasks: [{ id: 1, task_id: 'QA-1', type: 'qa', sprint_id: 3, title: 'Review release', qa_assigned: 'Quality team', status: 'todo' }] }])('keeps sprint and backlog viewports stable for task data $tasks', async ({ tasks }) => {
  SchedulerAPI.getTasks.mockResolvedValue({ data: tasks });
  render(<SprintOverview projectId={1} sprintId={3} projectMembers={[]} availableSprints={[{ id: 3, name: 'Sprint 3' }]} />);
  if (tasks.length) await screen.findByText('Review release');
  else await screen.findByText('No tasks found for this sprint.');
  expect(screen.getByLabelText('Sprint tasks').classList.contains('project-task-viewport')).toBe(true);
  expect(screen.getByLabelText('Backlog tasks').classList.contains('project-task-viewport')).toBe(true);
});
