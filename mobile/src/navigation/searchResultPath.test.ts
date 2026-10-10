import { expect, test } from '@jest/globals';
import { searchResultPath } from './searchResultPath';

test('opens the matched result instead of a generic collection', () => {
  expect(searchResultPath({ id: 12, type: 'post', path: '/posts#post-12' })).toBe('/inbox/post/12');
  expect(searchResultPath({ id: 5, type: 'user', path: '/users/5' })).toBe('/profile/5');
  expect(searchResultPath({ id: 8, type: 'issue', path: '/projects/3/issues?issue_id=8' })).toBe('/projects/3/issues?issueId=8');
  expect(searchResultPath({ id: 9, type: 'task', path: '/dashboard?task_id=9' })).toBe('/work?taskId=9');
  expect(searchResultPath({ id: 10, type: 'task', path: '/projects/3?task_id=10' })).toBe('/projects/3?taskId=10');
  expect(searchResultPath({ id: 4, type: 'knowledge', path: '/knowledge?bookmark_id=4' })).toBe('/more/knowledge?bookmark_id=4');
});
