// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import UserMultiSelect from './UserMultiSelect';
vi.mock('./api', () => ({ getUsers: vi.fn(async () => ({ data: [{ id: 1, first_name: 'Ada', email: 'ada@example.test' }, { id: 2, first_name: 'Grace', email: 'grace@example.test' }] })) }));
afterEach(cleanup);
const Harness = () => { const [selected, setSelected] = useState([]); return <div style={{ overflow: 'hidden' }}><UserMultiSelect selectedUsers={selected} setSelectedUsers={setSelected} excludedIds={['2']} /></div>; };
it('renders the list outside clipping containers and supports selection and Escape', async () => {
  const { container } = render(<Harness />);
  const input = screen.getByRole('textbox');
  fireEvent.focus(input);
  const option = await screen.findByRole('option', { name: /Ada/ });
  expect(container.contains(option)).toBe(false);
  expect(screen.queryByRole('option', { name: /Grace/ })).toBeNull();
  expect(option.closest('[style]').style.position).toBe('fixed');
  fireEvent.click(option);
  expect(screen.getByRole('button', { name: 'Remove Ada' })).toBeTruthy();
  fireEvent.focus(input);
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(screen.queryByRole('listbox')).toBeNull();
});
it('shows an empty result instead of a blank menu', async () => {
  render(<Harness />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Nobody' } });
  expect(await screen.findByText('No matching people available.')).toBeTruthy();
});
