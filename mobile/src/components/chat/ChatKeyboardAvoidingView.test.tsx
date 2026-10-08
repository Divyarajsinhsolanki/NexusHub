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
