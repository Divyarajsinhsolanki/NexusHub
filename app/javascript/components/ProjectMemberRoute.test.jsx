// @vitest-environment jsdom
import React, { useContext } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('./api', () => ({ fetchProject: mocks.fetch }));
vi.mock('../context/AuthContext', async () => ({ AuthContext: (await import('react')).createContext({ isAuthenticated: true, initializing: false, user: { id: 1 } }) }));
vi.mock('./ui/PageLoader', () => ({ default: () => <p>Checking access</p> }));
vi.mock('./AccessDeniedRedirect', () => ({ default: () => <p>Access denied</p> }));
import ProjectMemberRoute, { ProjectRouteContext } from './ProjectMemberRoute';
function ProjectContent() {
  const { project } = useContext(ProjectRouteContext);
  return <p>{project.name}</p>;
}
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function mount() {
  return render(<MemoryRouter initialEntries={['/projects/1']}><Link to="/projects/2">Next project</Link><Routes><Route path="/projects/:projectId" element={<ProjectMemberRoute><ProjectContent /></ProjectMemberRoute>} /></Routes></MemoryRouter>);
}
it('removes the previous project context while checking the next project', async () => {
  let resolve;
  mocks.fetch.mockImplementation(id => id === '1' ? Promise.resolve({ data: { id: 1, name: 'Old project', can_access: true } }) : new Promise(done => { resolve = done; }));
  mount();
  await screen.findByText('Old project');
  fireEvent.click(screen.getByText('Next project'));
  expect(screen.queryByText('Old project')).toBeNull();
  expect(screen.getByText('Checking access')).toBeTruthy();
  await act(async () => resolve({ data: { id: 2, name: 'New project', can_access: true } }));
  expect(screen.getByText('New project')).toBeTruthy();
  expect(mocks.fetch).toHaveBeenLastCalledWith('2');
});
it('checks a new project even after the previous project was denied', async () => {
  mocks.fetch.mockImplementation(async id => ({ data: { id: Number(id), name: 'Allowed project', can_access: id === '2', users: [] } }));
  mount();
  await screen.findByText('Access denied');
  fireEvent.click(screen.getByText('Next project'));
  expect(screen.queryByText('Access denied')).toBeNull();
  await screen.findByText('Allowed project');
});
