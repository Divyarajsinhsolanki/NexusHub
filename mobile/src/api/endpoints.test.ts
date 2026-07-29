import { describe, expect, test } from '@jest/globals';

import { normalizeCollection, unwrapData } from './endpoints';

describe('mobile API compatibility', () => {
  test('unwraps normalized v1 envelopes', () => {
    expect(unwrapData({ data: { id: 7, name: 'Nexus' }, meta: { current_page: 1 } })).toEqual({ id: 7, name: 'Nexus' });
  });

  test('preserves legacy controller objects and arrays', () => {
    expect(unwrapData([{ id: 1 }, { id: 2 }])).toHaveLength(2);
    expect(unwrapData({ events: [{ id: 3 }], conflicts: {} })).toEqual({ events: [{ id: 3 }], conflicts: {} });
  });

  test('normalizes collection keys used by web-backed v1 routes', () => {
    expect(normalizeCollection<{ id: number }>({ projects: [{ id: 4 }] })).toEqual([{ id: 4 }]);
    expect(normalizeCollection<{ id: number }>([{ id: 5 }])).toEqual([{ id: 5 }]);
  });
});
