import { fireEvent, render } from '@testing-library/react-native';
import { expect, jest, test } from '@jest/globals';
import { MessageActionsSheet } from './MessageActionsSheet';
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
test('deleting requires confirmation within the same themed sheet', async () => {
  const remove = jest.fn();
  const screen = await render(<MessageActionsSheet message={{ id: 1, body: 'My message', created_at: '2026-10-12' }} canEdit onEdit={jest.fn()} onDelete={remove} onClose={jest.fn()} onSelect={jest.fn()} onReply={jest.fn()} pending={false} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Delete message' }));
  expect(remove).not.toHaveBeenCalled();
  expect(screen.getByText('Delete message?')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Keep message' }));
  expect(screen.getByText('Message actions')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Delete message' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Delete for everyone' }));
  expect(remove).toHaveBeenCalledTimes(1);
  await screen.unmount();
});
