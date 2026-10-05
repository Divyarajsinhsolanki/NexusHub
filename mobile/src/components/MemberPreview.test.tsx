import { fireEvent, render } from '@testing-library/react-native';
import { expect, test } from '@jest/globals';
import { Text } from 'react-native';
import { MemberPreview } from './MemberPreview';
test('opens a native profile overlay and preserves zero allocation', async () => {
  const screen = await render(<MemberPreview member={{ id: 1, name: 'Alex', email: 'alex@example.com', allocation_percentage: 0 }}><Text>Avatar</Text></MemberPreview>);
  await fireEvent.press(screen.getByRole('button', { name: "Preview Alex's profile" }));
  expect(screen.getByText('Allocation: 0%')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Email Alex' })).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Close profile preview' }));
  expect(screen.queryByText('Allocation: 0%')).toBeNull();
});
