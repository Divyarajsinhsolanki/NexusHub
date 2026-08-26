import { describe, expect, test } from '@jest/globals';

import type { CallSession } from '../api/types';
import { shouldRingForUser } from './IncomingCallCoordinator';

describe('incoming call device synchronization', () => {
  test('stops ringing after the same user answers on another device', () => {
    expect(shouldRingForUser(callWithStatus('ringing'), 7)).toBe(true);
    expect(shouldRingForUser(callWithStatus('joined'), 7)).toBe(false);
  });

  test('keeps a group invitation ringing when a different participant joins', () => {
    const call = callWithStatus('ringing');
    call.status = 'active';
    call.participants.push({ user_id: 8, name: 'Another member', status: 'joined' });

    expect(shouldRingForUser(call, 7)).toBe(true);
  });

  test('never rings for the call initiator or an ended call', () => {
    const call = callWithStatus('ringing');
    expect(shouldRingForUser(call, 3)).toBe(false);
    call.status = 'ended';
    expect(shouldRingForUser(call, 7)).toBe(false);
  });
});

function callWithStatus(status: string): CallSession {
  return {
    id: 11,
    public_id: 'call-11',
    share_url: 'https://example.test/meet/call-11',
    conversation_id: 4,
    call_type: 'audio',
    status: 'ringing',
    initiator_id: 3,
    initiator_name: 'Caller',
    can_end: false,
    participants: [{ user_id: 7, name: 'Recipient', status }],
  };
}
