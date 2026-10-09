import { expect, jest, test } from '@jest/globals';

import { api } from './client';
import { endpoints } from './endpoints';

jest.mock('./client', () => ({ api: { post: jest.fn() } }));

test('mobile PDF history actions send the acknowledged version and preserve optional legacy calls', async () => {
  const post = api.post as jest.Mock;
  post.mockResolvedValue({ data: { data: { id: 3, title: 'Document', current_version_id: 10 } } } as never);
  await endpoints.pdfHistoryAction(3, 'undo', 11);
  expect(post).toHaveBeenLastCalledWith('/pdf_documents/3/undo', { base_version_id: 11 });
  await endpoints.pdfHistoryAction(3, 'redo', 10);
  expect(post).toHaveBeenLastCalledWith('/pdf_documents/3/redo', { base_version_id: 10 });
  await endpoints.pdfHistoryAction(3, 'restore_original');
  expect(post).toHaveBeenLastCalledWith('/pdf_documents/3/restore_original', undefined);
});
