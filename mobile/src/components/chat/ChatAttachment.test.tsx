import { fireEvent, render } from '@testing-library/react-native';
import { ChatAttachment } from './ChatAttachment';

jest.mock('expo', () => ({ useEvent: () => ({ status: 'readyToPlay' }) }));
jest.mock('../../theme', () => ({ useAppTheme: () => ({ text: '#111111', primary: '#008060', surfaceMuted: '#eeeeee' }) }));
jest.mock('expo-router', () => ({ useFocusEffect: () => undefined }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
jest.mock('../../api/client', () => ({ absoluteAssetUrl: (path: string) => `https://example.com${path}` }));

test('images open a full-screen viewer and close again', async () => {
  const screen = await render(<ChatAttachment file={{ filename: 'photo.jpg', url: '/photo.jpg' }} mine={false} />);
  await fireEvent.press(screen.getByLabelText('View photo.jpg'));
  expect(screen.getByLabelText('Full image photo.jpg')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Close image'));
  expect(screen.queryByLabelText('Full image photo.jpg')).toBeNull();
  await screen.unmount();
});

test('videos mount the inline player only after tapping play', async () => {
  const screen = await render(<ChatAttachment file={{ filename: 'clip.mp4', url: '/clip.mp4' }} mine />);
  expect(screen.queryByLabelText('Chat video player')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Play clip.mp4'));
  expect(screen.getByLabelText('Chat video player')).toBeTruthy();
  await screen.unmount();
});
import { expect, jest, test } from '@jest/globals';
