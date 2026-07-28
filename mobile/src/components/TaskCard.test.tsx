import { fireEvent, render } from '@testing-library/react-native';
import { expect, jest, test } from '@jest/globals';

import type { Task } from '../api/types';
import { TaskCard } from './TaskCard';

const task: Task = {
  id: 7,
  task_id: 'APP-7',
  title: 'Build the mobile task card',
  type: 'Code',
  status: 'todo',
  project_id: 2,
  sprint_id: 3,
};

test('changes a task to the selected status', async () => {
  const onStatusChange = jest.fn();
  const screen = await render(<TaskCard onStatusChange={onStatusChange} task={task} />);

  await fireEvent.press(screen.getByText('Doing'));

  expect(onStatusChange).toHaveBeenCalledWith('inprogress');
});

test('renders task identity and status without a mutation control when read only', async () => {
  const screen = await render(<TaskCard task={task} />);

  expect(screen.getByText('APP-7')).toBeTruthy();
  expect(screen.getByText('Build the mobile task card')).toBeTruthy();
  expect(screen.queryByText('Doing')).toBeNull();
});
