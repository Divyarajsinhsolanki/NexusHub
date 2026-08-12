// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BulkLogForm from './BulkLogForm';

afterEach(() => cleanup());

describe('BulkLogForm partial scheduling', () => {
  it('creates safely scheduled rows while leaving an out-of-sprint handoff pending', async () => {
    const onSubmit = vi.fn(() => Promise.resolve());

    render(
      <BulkLogForm
        tasks={[{
          id: 41,
          task_id: 'TASK-41',
          title: 'One-day implementation',
          type: 'Code',
          developer_id: 1,
          assigned_to_user: 1,
          dev_hours: 7,
          code_review_hours: 2,
        }]}
        existingLogs={[]}
        developers={[
          { id: 1, name: 'Developer One' },
          { id: 2, name: 'Reviewer One' },
        ]}
        dates={['2026-08-21']}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('2h will remain pending.')).toBeTruthy();
    const createButton = screen.getByRole('button', { name: 'Create 1 Scheduled Log' });
    expect(createButton.disabled).toBe(false);

    fireEvent.click(createButton);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith([{
      task_id: 41,
      developer_id: 1,
      log_date: '2026-08-21',
      type: 'Code',
      hours_logged: 7,
      status: 'todo',
    }]));
  });
});
