import { describe, expect, it } from 'vitest';
import { filterAndSortPosts, postAuthorName } from './postFeedUtils';

const posts = [
  { id: 1, message: 'Release is ready', created_at: '2026-08-10T10:00:00Z', likes_count: 1, comments_count: 0, user: { id: 4, first_name: 'Divya', last_name: 'Solanki' } },
  { id: 2, message: 'Need feedback on scheduler', created_at: '2026-08-11T10:00:00Z', likes_count: 2, comments_count: 3, image_url: '/image.png', user: { id: 7, email: 'reviewer@example.test' } },
  { id: 3, message: 'Daily update', created_at: '2026-08-12T10:00:00Z', likes_count: 0, comments_count: 1, user: { id: 4, first_name: 'Divya' } },
];

describe('post feed filtering', () => {
  it('searches messages and author names', () => {
    expect(filterAndSortPosts({ posts, query: 'scheduler' }).map((post) => post.id)).toEqual([2]);
    expect(filterAndSortPosts({ posts, query: 'solanki' }).map((post) => post.id)).toEqual([1]);
  });

  it('filters personal, media, and discussed updates', () => {
    expect(filterAndSortPosts({ posts, filter: 'mine', userId: 4 }).map((post) => post.id)).toEqual([3, 1]);
    expect(filterAndSortPosts({ posts, filter: 'media' }).map((post) => post.id)).toEqual([2]);
    expect(filterAndSortPosts({ posts, filter: 'discussed' }).map((post) => post.id)).toEqual([3, 2]);
  });

  it('sorts by engagement without mutating the source list', () => {
    const originalOrder = posts.map((post) => post.id);
    expect(filterAndSortPosts({ posts, sort: 'active' }).map((post) => post.id)).toEqual([2, 3, 1]);
    expect(posts.map((post) => post.id)).toEqual(originalOrder);
  });

  it('falls back to email for the author name', () => {
    expect(postAuthorName(posts[1])).toBe('reviewer@example.test');
  });
});
