import { describe, expect, test } from '@jest/globals';

import { normalizedMessageRows, normalizedParticipants } from './messageRows';

describe('chat response normalization', () => {
  test('drops malformed and duplicate cached rows without crashing', () => {
    const rows = normalizedMessageRows([
      { data: [{ id: 2, body: 'Newest', created_at: '2026-08-26T10:00:00Z' }] },
      { data: [null, { id: 1, content: 'Oldest', attachments: 'invalid' }, { id: 2, body: 'duplicate' }, { id: 0 }] },
      { data: 'invalid' },
    ]);

    expect(rows.map((message) => message.id)).toEqual([1, 2]);
    expect(rows[0]).toMatchObject({ body: 'Oldest', attachments: [] });
  });

  test('uses an empty participant list for stale response shapes', () => {
    expect(normalizedParticipants({ id: 1 })).toEqual([]);
    expect(normalizedParticipants([{ id: 2, name: 'Taylor' }, null])).toEqual([{ id: 2, name: 'Taylor' }]);
  });

  test('keeps valid message identities stable when realtime appends a row', () => {
    const first = { id: 1, body: 'First', created_at: '2026-08-26T10:00:00Z' };
    const second = { id: 2, body: 'Second', created_at: '2026-08-26T10:01:00Z' };

    const before = normalizedMessageRows([{ data: [first] }]);
    const after = normalizedMessageRows([{ data: [first, second] }]);

    expect(after).toHaveLength(2);
    expect(after[0]).toBe(before[0]);
    expect(after[0]).toBe(first);
  });

  test('normalizes a 50-message attachment-heavy thread without duplicate keys', () => {
    const data = Array.from({ length: 50 }, (_, index) => ({
      id: index + 1,
      body: `Message ${index + 1}`,
      created_at: '2026-08-26T10:00:00Z',
      attachments: [{ id: index + 1, filename: `image-${index}.jpg`, url: `https://example.test/${index}.jpg`, content_type: 'image/jpeg' }],
    }));

    const rows = normalizedMessageRows([{ data }, { data: [data[0], { id: 'broken' }] }]);

    expect(rows).toHaveLength(50);
    expect(new Set(rows.map((message) => message.id)).size).toBe(50);
  });
});
