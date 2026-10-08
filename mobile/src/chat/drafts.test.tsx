import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { beforeEach, expect, jest, test } from '@jest/globals';
import { Pressable, Text, TextInput, View } from 'react-native';
import { clearChatDrafts, useChatDraft } from './drafts';

function Composer({ userId = 1, workspaceId = 2 }: { userId?: number; workspaceId?: number }) {
  const draft = useChatDraft(userId, workspaceId, 3);
  return <View><TextInput accessibilityLabel="Draft" value={draft.body} onChangeText={draft.setBody} />
    <Pressable accessibilityRole="button" accessibilityLabel="Select reply" onPress={() => draft.setReplyTo({ id: 5, body: 'Target', created_at: '2026-10-07T10:00:00Z' })}><Text>Reply</Text></Pressable>
    <Text>{draft.replyTo?.body}</Text></View>;
}
beforeEach(async () => { await clearChatDrafts(); jest.clearAllMocks(); });
test('restores text and reply, isolates accounts/workspaces, and flushes immediately on unmount', async () => {
  const screen = await render(<Composer />);
  await fireEvent.changeText(screen.getByLabelText('Draft'), 'Remember me');
  await fireEvent.press(screen.getByLabelText('Select reply'));
  await screen.unmount();
  await waitFor(async () => expect(await AsyncStorage.getItem('nexus-chat-draft:1:2:3')).toContain('Remember me'));
  const restored = await render(<Composer />);
  await waitFor(() => expect(restored.getByLabelText('Draft').props.value).toBe('Remember me'));
  expect(restored.getByText('Target')).toBeTruthy();
  await restored.unmount();
  const isolated = await render(<Composer workspaceId={4} />);
  expect(isolated.getByLabelText('Draft').props.value).toBe('');
  await isolated.unmount();
});
test('a delayed storage read cannot erase newly typed text', async () => {
  let resolveRead!: (value: string | null) => void;
  jest.spyOn(AsyncStorage, 'getItem').mockImplementationOnce(() => new Promise((resolve) => { resolveRead = resolve; }));
  const screen = await render(<Composer />);
  await fireEvent.changeText(screen.getByLabelText('Draft'), 'New typing');
  await act(async () => resolveRead(JSON.stringify({ body: 'Old draft' })));
  expect(screen.getByLabelText('Draft').props.value).toBe('New typing');
  await screen.unmount();
});
test('logout prevents late timers and unmount from recreating a draft', async () => {
  const screen = await render(<Composer />);
  await fireEvent.changeText(screen.getByLabelText('Draft'), 'Private draft');
  await clearChatDrafts();
  await screen.unmount();
  expect(await AsyncStorage.getItem('nexus-chat-draft:1:2:3')).toBeNull();
});
