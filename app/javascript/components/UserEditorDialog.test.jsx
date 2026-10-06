// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import UserEditorDialog from './UserEditorDialog';
afterEach(cleanup);
it('shows labeled details and editable workspace role checkboxes', () => {
  const toggle = vi.fn();
  render(<UserEditorDialog mode="edit" value={{ first_name: 'Alex', last_name: 'Rivera', email: 'alex@test.com', job_title: 'Engineer', department_id: '', roles: ['member'], bio: '' }} roles={['owner', 'member']} departments={[]} onChange={vi.fn()} onRoleToggle={toggle} onClose={vi.fn()} onSubmit={vi.fn()} />);
  expect(screen.getByRole('dialog').textContent).toContain('Edit user');
  expect(screen.getByLabelText('Email address').value).toBe('alex@test.com');
  fireEvent.click(screen.getByRole('button', { name: 'Access' }));
  expect(screen.getByRole('checkbox', { name: 'member' }).checked).toBe(true);
  fireEvent.click(screen.getByRole('checkbox', { name: 'owner' }));
  expect(toggle).toHaveBeenCalledWith('owner');
});
