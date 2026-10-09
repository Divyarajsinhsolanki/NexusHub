import { expect, jest, test, beforeEach } from '@jest/globals';
import { getDatabase } from './database';
import { draftStore } from './draftStore';
jest.mock('./database', () => ({ getDatabase: jest.fn() }));
const database = { runAsync: jest.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(undefined), getFirstAsync: jest.fn() };
beforeEach(() => { jest.clearAllMocks(); (getDatabase as jest.Mock).mockResolvedValue(database as never); });
test.each(['entity:/items', 'entity:/projects/7/vault_items'])('never writes or restores sensitive drafts for %s', async key => {
  const identity = { key, userId: 1, workspaceId: 2 };
  await draftStore.set(identity, { content: 'secret' });
  expect(database.runAsync).toHaveBeenCalledWith('DELETE FROM drafts WHERE draft_key = ?', `2:1:${key}`);
  expect(database.runAsync.mock.calls.some(args => String(args[0]).includes('INSERT'))).toBe(false);
  expect(await draftStore.get(identity)).toBeNull();
  expect(database.getFirstAsync).not.toHaveBeenCalled();
});
test('retains ordinary drafts', async () => {
  await draftStore.set({ key: 'entity:/work_notes', userId: 1, workspaceId: 2 }, { content: 'note' });
  expect(database.runAsync.mock.calls.some(args => String(args[0]).includes('INSERT'))).toBe(true);
});
