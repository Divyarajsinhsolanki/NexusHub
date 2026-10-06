import { fireEvent, render } from '@testing-library/react-native';
import { expect, jest, test } from '@jest/globals';

import { PrimaryButton } from './PrimaryButton';
import { SegmentedControl } from './SegmentedControl';

test('a busy button keeps its name and blocks duplicate actions', async () => {
  const onPress = jest.fn();
  const screen = await render(<PrimaryButton label="Save changes" loading onPress={onPress} />);
  const button = screen.getByRole('button', { name: 'Save changes' });
  expect(button.props.accessibilityState).toEqual({ disabled: true, busy: true });
  expect(screen.getByText('Save changes')).toBeTruthy();
  await fireEvent.press(button);
  expect(onPress).not.toHaveBeenCalled();
});

test('segments expose selection and only change to a different option', async () => {
  const onChange = jest.fn();
  const screen = await render(<SegmentedControl options={[{ value: 'all', label: 'All work' }, { value: 'mine', label: 'Assigned to me' }]} value="all" onChange={onChange} />);
  await fireEvent.press(screen.getByRole('tab', { name: 'All work' }));
  expect(onChange).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('tab', { name: 'Assigned to me' }));
  expect(onChange).toHaveBeenCalledWith('mine');
});
