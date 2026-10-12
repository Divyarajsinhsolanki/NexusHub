import { expect, jest, test } from '@jest/globals';
import { api } from './client';
import { endpoints } from './endpoints';
jest.mock('./client', () => ({ api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() } }));
test('unwraps snapshot envelopes and preserves the project revision in writes', async () => {
  jest.mocked(api.get).mockResolvedValue({ data: { data: { revision: 7, can_edit: false, items: [] } } });
  expect((await endpoints.projectOperations(12)).revision).toBe(7);
  jest.mocked(api.patch).mockResolvedValue({ data: { data: { revision: 8 } } });
  await endpoints.operationsMutation(12, 'operations/items/3', 'patch', { revision: 7, item: { name: 'Ruby' } });
  expect(api.patch).toHaveBeenCalledWith('/projects/12/operations/items/3', { revision: 7, item: { name: 'Ruby' } });
  jest.mocked(api.delete).mockResolvedValue({ data: undefined });
  await endpoints.operationsMutation(12, 'environments/2', 'delete', { revision: 8 });
  expect(api.delete).toHaveBeenCalledWith('/projects/12/environments/2', { data: { revision: 8 } });
});
