import { act, render } from '@testing-library/react-native';
import { expect, jest, test } from '@jest/globals';
import { PanResponder, Text } from 'react-native';
import { isReplySwipe, SwipeToReply } from './SwipeToReply';
test('requires a deliberate horizontal right swipe and preserves vertical scrolling', () => {
  expect(isReplySwipe(70, 5)).toBe(true);
  for (const [dx, dy] of [[10, 0], [70, 100], [-80, 0]]) expect(isReplySwipe(dx, dy)).toBe(false);
});
test('replies once on release and ignores cancelled or disabled gestures', async () => {
  let config: any;
  const original = PanResponder.create;
  const spy = jest.spyOn(PanResponder, 'create').mockImplementation(input => { config = input; return original(input); });
  const reply = jest.fn();
  const screen = await render(<SwipeToReply enabled onReply={reply}><Text>Message</Text></SwipeToReply>);
  expect(config.onMoveShouldSetPanResponderCapture({}, { dx: 20, dy: 2, numberActiveTouches: 1 })).toBe(true);
  expect(config.onMoveShouldSetPanResponderCapture({}, { dx: 20, dy: 50, numberActiveTouches: 1 })).toBe(false);
  await act(() => config.onPanResponderRelease({}, { dx: 70, dy: 2 }));
  expect(reply).toHaveBeenCalledTimes(1);
  await act(() => config.onPanResponderTerminate());
  expect(reply).toHaveBeenCalledTimes(1);
  await screen.rerender(<SwipeToReply enabled={false} onReply={reply}><Text>Message</Text></SwipeToReply>);
  expect(config.onMoveShouldSetPanResponderCapture({}, { dx: 80, dy: 2, numberActiveTouches: 1 })).toBe(false);
  spy.mockRestore(); await screen.unmount();
});
