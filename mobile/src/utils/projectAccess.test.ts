import { expect, test } from '@jest/globals';
import type { Project } from '../api/types';
import { canOpenProject, canEditProject, canManageProject } from './projectAccess';
const project: Project = { id: 1, name: 'Apollo', status: 'running', sprint_count: 0, task_count: 0, users: [{ id: 42, status: 'active' }] };
test('project shortcuts require membership and exclude removed users', () => {
  expect(canOpenProject(project, { id: 42 })).toBe(true);
  expect(canOpenProject(project, { id: 7 })).toBe(false);
  expect(canOpenProject({ ...project, users: [{ id: 42, status: 'removed' }] }, { id: 42 })).toBe(false);
  expect(canOpenProject(undefined, { id: 42 })).toBe(false);
});

test.each(['invited', 'requested', 'removed'])('excludes %s project memberships', (status) => {
  expect(canOpenProject({ ...project, users: [{ id: 42, status }] }, { id: 42 })).toBe(false);
});
test('uses server permissions for owners and admins without membership rows', () => {
  expect(canOpenProject({ ...project, can_access: true, users: [] }, { id: 7 })).toBe(true);
  expect(canOpenProject({ ...project, owner_id: 7, users: [] }, { id: 7 })).toBe(true);
  expect(canEditProject({ ...project, can_edit: true, users: [] }, { id: 7 })).toBe(true);
  expect(canManageProject({ ...project, can_manage: true }, { id: 7 })).toBe(true);
});
test('denies edits for viewers and demo users even with otherwise enabled controls', () => {
  expect(canEditProject({ ...project, can_edit: false }, { id: 42 })).toBe(false);
  expect(canEditProject({ ...project, users: [{ id: 42, status: 'active', role: 'viewer' }] }, { id: 42 })).toBe(false);
  expect(canEditProject({ ...project, can_edit: true }, { id: 42, demo_account: true })).toBe(false);
  expect(canManageProject({ ...project, can_manage: false }, { id: 42 })).toBe(false);
});
