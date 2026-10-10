import { expect, test } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import { absoluteAssetUrl } from '../api/client';
import { Avatar } from './Avatar';

test('resolves relative profile pictures and preserves selected local photos', async () => {
  const screen = await render(<Avatar name="Alex Morgan" uri="/rails/active_storage/profile.jpg" />);
  expect(screen.getByLabelText('Alex Morgan profile picture').props.source.uri).toBe(absoluteAssetUrl('/rails/active_storage/profile.jpg'));
  await screen.rerender(<Avatar name="Alex Morgan" uri="file:///photos/new.jpg" />);
  expect(screen.getByLabelText('Alex Morgan profile picture').props.source.uri).toBe('file:///photos/new.jpg');
  await screen.unmount();
});

test('shows initials on failure and retries when the photo changes', async () => {
  const screen = await render(<Avatar name="Alex Morgan" uri="/old.jpg" />);
  await fireEvent(screen.getByLabelText('Alex Morgan profile picture'), 'error');
  expect(screen.getByText('AM')).toBeTruthy();
  await screen.rerender(<Avatar name="Alex Morgan" uri="/new.jpg" />);
  expect(screen.getByLabelText('Alex Morgan profile picture').props.source.uri).toBe(absoluteAssetUrl('/new.jpg'));
  await screen.unmount();
});

test('ignores empty and serialized missing images', async () => {
  for (const uri of ['', 'null', 'undefined', '  ']) {
    const screen = await render(<Avatar name="Alex Morgan" uri={uri} />);
    expect(screen.queryByLabelText('Alex Morgan profile picture')).toBeNull();
    expect(screen.getByText('AM')).toBeTruthy();
    await screen.unmount();
  }
  expect(absoluteAssetUrl('content://media/photo/1')).toBe('content://media/photo/1');
  expect(absoluteAssetUrl('https://cdn.example/photo.jpg')).toBe('https://cdn.example/photo.jpg');
});
