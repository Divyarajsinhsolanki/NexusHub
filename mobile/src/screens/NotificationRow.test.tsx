import { fireEvent, render } from '@testing-library/react-native';
import { expect, jest, test } from '@jest/globals';

import type { Notification } from '@/src/api/types';
import { NotificationRow } from '../../app/(tabs)/inbox/notifications';

const notification: Notification = {
  id: 1,
  action: 'assigned',
  message: 'Alex assigned you a task',
  actor: { id: 2, name: 'Alex Morgan', avatar_color: '#2563eb' },
  read_at: null,
  created_at: new Date().toISOString(),
  notifiable_type: 'Task',
  notifiable_id: 9,
  deep_link: '/projects/3?taskId=9',
};

test('shows unread state and opens a notification', async () => {
  const onPress = jest.fn();
  const screen = await render(<NotificationRow notification={notification} onPress={onPress} />);

  await fireEvent.press(screen.getByLabelText('Unread. Alex assigned you a task'));

  expect(onPress).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Unread')).toBeTruthy();
});
