import { describe, expect, test } from '@jest/globals';

import type { Message } from '../api/types';
import { messageKey, OlderPageRequestGate } from './threadList';

describe('chat thread list stability', () => {
  test('uses only the normalized message id as the permanent row key', () => {
    expect(messageKey({ id: 42 } as Message)).toBe('42');
    expect(messageKey({ id: -172345 } as Message)).toBe('-172345');
  });

  test('does not request history during initial layout or programmatic scrolling', () => {
    const gate = new OlderPageRequestGate();

    expect(gate.begin(120)).toBe(false);
    expect(gate.begin(120)).toBe(false);
  });

  test('allows one page per intentional gesture and deduplicates cursors', () => {
    const gate = new OlderPageRequestGate();

    gate.markUserGesture();
    expect(gate.begin(120)).toBe(true);
    expect(gate.begin(120)).toBe(false);
    gate.finish(120, true);

    gate.markUserGesture();
    expect(gate.begin(120)).toBe(false);
    expect(gate.begin(80)).toBe(true);
  });

  test('allows a failed page to be retried after another gesture', () => {
    const gate = new OlderPageRequestGate();

    gate.markUserGesture();
    expect(gate.begin(90)).toBe(true);
    gate.finish(90, false);
    gate.markUserGesture();
    expect(gate.begin(90)).toBe(true);
  });
});
