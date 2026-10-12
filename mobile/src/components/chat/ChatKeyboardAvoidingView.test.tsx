import { render } from '@testing-library/react-native';
import { Platform, View } from 'react-native';
import { afterEach, expect, jest, test } from '@jest/globals';
import { ChatKeyboardAvoidingView } from './ChatKeyboardAvoidingView';
afterEach(() => { jest.restoreAllMocks(); });
test('enables keyboard avoidance on Android instead of discarding the behavior', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.spyOn(require('react-native') as { KeyboardAvoidingView: unknown }, 'KeyboardAvoidingView', 'get').mockReturnValue((props: any) => require('react').createElement(View, { testID: 'keyboard-avoidance', accessibilityLabel: props.behavior }, props.children));
  const screen = await render(<ChatKeyboardAvoidingView style={{ flex: 1 }}><View /></ChatKeyboardAvoidingView>);
  expect(screen.getByTestId('keyboard-avoidance').props.accessibilityLabel).toBe('height');
  await screen.unmount();
});
test('keeps padding avoidance on iOS', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  jest.spyOn(require('react-native') as { KeyboardAvoidingView: unknown }, 'KeyboardAvoidingView', 'get').mockReturnValue((props: any) => require('react').createElement(View, { testID: 'keyboard-avoidance', accessibilityLabel: props.behavior }, props.children));
  const screen = await render(<ChatKeyboardAvoidingView style={{ flex: 1 }}><View /></ChatKeyboardAvoidingView>);
  expect(screen.getByTestId('keyboard-avoidance').props.accessibilityLabel).toBe('padding');
  await screen.unmount();
});

test('synchronizes iOS layout changes with keyboard frame animations and cleans up', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const Keyboard = require('react-native').Keyboard;
  let listener: any;
  const remove = jest.fn();
  jest.spyOn(Keyboard, 'addListener').mockImplementation((_name: unknown, callback: unknown) => { listener = callback; return { remove }; });
  const schedule = jest.spyOn(Keyboard, 'scheduleLayoutAnimation').mockImplementation(() => undefined);
  const screen = await render(<ChatKeyboardAvoidingView style={{ flex: 1 }}><View /></ChatKeyboardAvoidingView>);
  const event = { duration: 250, easing: 'keyboard' };
  listener(event);
  expect(schedule).toHaveBeenCalledWith(event);
  await screen.unmount(); expect(remove).toHaveBeenCalled();
});
