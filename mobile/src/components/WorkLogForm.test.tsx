import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { expect, jest, test } from '@jest/globals';

import { WorkLogForm } from './WorkLogForm';

test('validates and submits a new work log', async () => {
  const onSave = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const screen = await render(
    <WorkLogForm
      onClose={jest.fn()}
      onSave={onSave}
      options={{ categories: [], priorities: [], tags: [] }}
      saving={false}
      visible
    />,
  );

  await fireEvent.changeText(screen.getByLabelText('Title'), 'Mobile implementation');
  await fireEvent.changeText(screen.getByLabelText('Tags'), 'mobile, api');
  await fireEvent.press(screen.getByText('Create work log'));

  await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
    title: 'Mobile implementation',
    actual_minutes: 60,
    tags: ['mobile', 'api'],
  })));
});
