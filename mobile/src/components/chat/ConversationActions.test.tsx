jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { expect, jest, test } from '@jest/globals';
import { ConversationRow } from '../../../app/(tabs)/inbox';
import { endpoints } from '../../api/endpoints';
import type { Conversation } from '../../api/types';
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 1 } }) }));
jest.mock('../../api/endpoints', () => ({ endpoints: { setConversationMuted: jest.fn(async () => undefined), hideConversation: jest.fn(async () => undefined) } }));
test('long press shows actions before mute durations, and requires delete confirmation', async () => {
  const client = new QueryClient();
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const screen = await render(<QueryClientProvider client={client}><ConversationRow conversation={{ id: 7, title: 'Team chat', participants: [], conversation_type: 'group', muted: false } as unknown as Conversation} /></QueryClientProvider>);
  await fireEvent(screen.getByRole('button', { name: 'Open Team chat' }), 'longPress');
  expect(alert).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Mute' }));
  await fireEvent.press(screen.getByRole('button', { name: '1 week' }));
  await waitFor(() => expect(endpoints.setConversationMuted).toHaveBeenCalledWith(7, true, '1w'));
  await fireEvent(screen.getByRole('button', { name: 'Open Team chat' }), 'longPress');
  await fireEvent.press(screen.getByRole('button', { name: 'Delete chat for me' }));
  expect(endpoints.hideConversation).not.toHaveBeenCalled();
  expect(alert).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(endpoints.hideConversation).toHaveBeenCalledWith(7));
  await screen.unmount(); client.clear(); alert.mockRestore();
});

test('selects multiple rows without navigating into a chat', async () => {
  const client = new QueryClient();
  const toggle = jest.fn();
  const screen = await render(<QueryClientProvider client={client}><ConversationRow conversation={{ id: 7, title: 'Design', participants: [] }} selecting selected onToggleSelection={toggle} /></QueryClientProvider>);
  const checkbox = screen.getByRole('checkbox', { name: 'Select Design' });
  expect(checkbox.props.accessibilityState.checked).toBe(true);
  await fireEvent.press(checkbox);
  expect(toggle).toHaveBeenCalledWith(7);
  await screen.unmount(); client.clear();
});
