import { expect, jest, test } from '@jest/globals';
import { api } from './client';
import { endpoints } from './endpoints';
jest.mock('./client', () => ({ api: { get: jest.fn() } }));
test('unwraps discovery cards from the versioned API', async () => {
  jest.mocked(api.get).mockResolvedValue({ data: { data: { tip: 'Use meaningful names' } } });
  expect(await endpoints.knowledgeDiscovery('/coding_tip')).toEqual({ tip: 'Use meaningful names' });
  expect(api.get).toHaveBeenCalledWith('/coding_tip', { params: undefined, signal: undefined });
});
test('normalizes prompt history and generated items', async () => {
  jest.mocked(api.get).mockResolvedValueOnce({ data: { data: [{ id: 7, prompt: 'Technology briefing' }] } }).mockResolvedValueOnce({ data: { data: [{ id: 8, title: 'Briefing' }] } });
  expect((await endpoints.knowledgePromptRuns()).data[0].id).toBe(7);
  expect((await endpoints.knowledgeItems(true)).data[0].id).toBe(8);
  expect(api.get).toHaveBeenCalledWith('/knowledge_items', { params: { limit: 120, active: true } });
});
