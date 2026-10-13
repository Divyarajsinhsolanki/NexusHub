// @vitest-environment jsdom
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import SkillDirectory from './SkillDirectory';
import TeamSkillMatrix from './TeamSkillMatrix';
afterEach(cleanup);
const members = [
  { id: 1, name: 'Ada', job_title: 'Engineer', skills: [{ id: 10, name: 'Ruby', proficiency: 'expert', proficiency_label: 'Expert' }] },
  { id: 2, name: 'Grace', job_title: 'Designer', skills: [] },
];
it('searches skills, links profiles, and resets combined filters', () => {
  render(<MemoryRouter><SkillDirectory members={members} skills={[{name:'Ruby'}]} roles={['Engineer','Designer']} /></MemoryRouter>);
  fireEvent.change(screen.getByRole('searchbox', {name:'Search experts'}), {target:{value:' Ruby '}});
  expect(screen.getByRole('link', {name:'View Full Profile'}).getAttribute('href')).toBe('/profile/1');
  expect(screen.queryByText('Grace')).toBeNull();
  fireEvent.change(screen.getByLabelText('Filter experts by role'), {target:{value:'Designer'}});
  expect(screen.getByText('No experts found')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', {name:'Clear filters'}));
  expect(screen.getByText('Grace')).toBeTruthy();
});
it('sorts the matrix using a keyboard-accessible button and exposes the sort state', () => {
  render(<TeamSkillMatrix members={members} skills={[{name:'Ruby'}]} roles={['Engineer','Designer']} />);
  const sort=screen.getByRole('button',{name:'Ruby'});
  fireEvent.click(sort);
  expect(sort.closest('th').getAttribute('aria-sort')).toBe('ascending');
  fireEvent.click(sort);
  expect(sort.closest('th').getAttribute('aria-sort')).toBe('descending');
  expect(screen.getAllByRole('row')[1].textContent).toContain('Ada');
  fireEvent.change(screen.getByLabelText('Filter matrix by role'), {target:{value:'Missing'}});
});
