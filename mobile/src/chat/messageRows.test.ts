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
});
