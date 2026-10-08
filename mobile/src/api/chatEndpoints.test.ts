import { beforeEach, expect, jest, test } from '@jest/globals';
import { api } from './client';
import { endpoints } from './endpoints';
jest.mock('./client', () => ({ api: { patch: jest.fn(), delete: jest.fn() } }));
beforeEach(() => { jest.clearAllMocks(); });
test('unwraps the native message edit response envelope', async () => {
  const message = { id: 9, body: 'Edited', edited_at: '2026-10-08T10:00:00Z' };
  jest.mocked(api.patch).mockResolvedValue({ data: { data: message } });
  expect(await endpoints.editMessage(7, 9, 'Edited')).toEqual(message);
  expect(api.patch).toHaveBeenCalledWith('/conversations/7/messages/9', { message: { body: 'Edited' } });
});
test('unwraps deletion envelopes and supports legacy unwrapped responses', async () => {
  const message = { id: 9, body: 'Message deleted', deleted_at: '2026-10-08T10:00:00Z' };
  jest.mocked(api.delete).mockResolvedValueOnce({ data: { data: message } }).mockResolvedValueOnce({ data: message });
  expect(await endpoints.deleteMessage(7, 9)).toEqual(message);
  expect(await endpoints.deleteMessage(7, 9)).toEqual(message);
});
