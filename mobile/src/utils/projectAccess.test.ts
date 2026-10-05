import { expect, test } from '@jest/globals';
import type { Project } from '../api/types';
import { canOpenProject } from './projectAccess';
const project: Project = { id: 1, name: 'Apollo', status: 'running', sprint_count: 0, task_count: 0, users: [{ id: 42, status: 'active' }] };
test('project shortcuts require membership and exclude removed users', () => {
  expect(canOpenProject(project, { id: 42 })).toBe(true);
  expect(canOpenProject(project, { id: 7 })).toBe(false);
  expect(canOpenProject({ ...project, users: [{ id: 42, status: 'removed' }] }, { id: 42 })).toBe(false);
  expect(canOpenProject(undefined, { id: 42 })).toBe(false);
});
