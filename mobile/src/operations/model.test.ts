import { expect, test } from '@jest/globals';
import { canVerify, comparison, deploymentTransitions, entryPayload, itemPayload, numbers } from './model';
import { timeInZone } from './time';
test('blank secret edits preserve stored values and clearing is explicit', () => {
  expect(entryPayload('configuration', true, { value: '', required: true })).not.toHaveProperty('value');
  expect(entryPayload('configuration', true, { value: '', clear_value: true })).toHaveProperty('clear_value', true);
  expect(itemPayload({ name: ' License ', details: {} }, 'license', '', false)).not.toHaveProperty('license_key');
  expect(itemPayload({ name: 'License', details: {} }, 'license', '', true)).toHaveProperty('clear_license_key', true);
});
test('releases only verify fresh matching observations and valid status transitions', () => {
  expect(canVerify({ id: 1, status: 'deployed', verification: [{ status: 'match' }] })).toBe(true);
  expect(canVerify({ id: 1, status: 'deployed', verification: [{ status: 'stale' }] })).toBe(false);
  expect(deploymentTransitions('planned')).toEqual(['in_progress', 'cancelled']);
  expect(deploymentTransitions('deployed')).toEqual([]);
});
test('compares the server-redacted equality results and validates reminders', () => {
  expect(comparison({ comparisons: [{ left_environment_id: 1, right_environment_id: 2, equal: false }] } as never, [2, 1])).toBe('Different');
  expect(numbers('30, 7, 1')).toEqual([30, 7, 1]);
  expect(() => numbers('7, abc')).toThrow();
});
test('uses the same wall-time conversion as the web deployment editor', () => {
  expect(timeInZone('2030-01-01T09:00', 'Asia/Kolkata')).toBe('2030-01-01T03:30:00.000Z');
  expect(() => timeInZone('2030-01-01T09:00', 'invalid-zone')).toThrow();
});
