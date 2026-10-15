import { act, render } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { expect, jest, test } from '@jest/globals';
import { LoadingSurface } from './LoadingSurface';

test('keeps a readable loading state and stops motion when requested', async () => {
  const preference = jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  let changed: ((value: boolean) => void) | undefined;
  const remove = jest.fn();
  const listener = jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((_event, callback) => { changed = callback as unknown as (value: boolean) => void; return { remove } as unknown as ReturnType<typeof AccessibilityInfo.addEventListener>; });
  const screen = await render(<LoadingSurface title="Documents" label="Loading documents…" />);
  expect(screen.getByLabelText('Documents. Loading documents…').props.accessibilityState.busy).toBe(true);
  expect(screen.getByTestId('loading-activity')).toBeTruthy();
  await act(() => { changed?.(true); });
  expect(screen.queryByTestId('loading-activity')).toBeNull();
  expect(screen.getByText('Loading documents…')).toBeTruthy();
  await screen.unmount(); expect(remove).toHaveBeenCalled();
  preference.mockRestore(); listener.mockRestore();
});
