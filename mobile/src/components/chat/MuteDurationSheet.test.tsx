import { render, fireEvent } from '@testing-library/react-native';
import { expect, jest, test } from '@jest/globals';
import { MuteDurationSheet } from './MuteDurationSheet';
jest.mock('../../theme', () => ({ useAppTheme: () => ({ surface: '#ffffff', text: '#000000', primary: '#2563eb' }) }));
test('shows every duration and leaves cancel separate from muting', async () => {
  const select = jest.fn();
  const close = jest.fn();
  const screen = await render(<MuteDurationSheet visible onClose={close} onSelect={select} />);
  for (const label of ['1 hour', '8 hours', '1 week', 'Until I unmute']) expect(screen.getByRole('button', { name: label })).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '8 hours' }));
  expect(select).toHaveBeenCalledWith('8h');
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(close).toHaveBeenCalled();
  expect(select).toHaveBeenCalledTimes(1);
});
