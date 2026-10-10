import { Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { expect, jest, test } from '@jest/globals';
import { RichMessageText } from './RichMessageText';
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
test('opens member profiles and focuses referenced project tasks', async () => {
  const screen = await render(<Text><RichMessageText text="Hello @sam, check #AC-7." color="#2563eb" lookups={{ usersByHandle: { sam: { id: 2, name: 'Sam' } }, tasksByKey: { 'ac-7': { id: 7, task_id: 'AC-7', project_id: 4 } } }} /></Text>);
  await fireEvent.press(screen.getByText('@Sam'));
  expect(mockPush).toHaveBeenCalledWith('/profile/2');
  await fireEvent.press(screen.getByText('#AC-7'));
  expect(mockPush).toHaveBeenCalledWith('/projects/4?taskId=7');
});

test('highlights ordinary URLs and opens them without trailing punctuation', async () => {
  const linking = require('react-native').Linking;
  const open = jest.spyOn(linking, 'openURL').mockResolvedValue(undefined);
  const screen = await render(<Text><RichMessageText text="See https://example.com/page, please." color="#2563eb" lookups={{}} /></Text>);
  const link = screen.getByText('https://example.com/page');
  expect(link.props.accessibilityRole).toBe('link');
  expect(link.props.style.textDecorationLine).toBe('underline');
  await fireEvent.press(link);
  expect(open).toHaveBeenCalledWith('https://example.com/page');
  open.mockRestore();
});
