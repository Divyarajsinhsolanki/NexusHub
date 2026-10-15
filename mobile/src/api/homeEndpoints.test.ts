import { expect, jest, test } from '@jest/globals';
import { api } from './client';
import { endpoints } from './endpoints';
jest.mock('./client', () => ({ api: { get: jest.fn() } }));
test('keeps the default home request and sends explicit server filters', async () => {
  const data = { as_of_date: '2026-10-16', summary: {}, tasks: [] };
  jest.mocked(api.get).mockResolvedValue({ data: { data } });
  expect(await endpoints.home()).toEqual(data);
  expect(api.get).toHaveBeenLastCalledWith('/home');
  expect(await endpoints.homeByTaskFilter('overdue')).toEqual(data);
  expect(api.get).toHaveBeenLastCalledWith('/home', { params: { task_filter: 'overdue' } });
});
