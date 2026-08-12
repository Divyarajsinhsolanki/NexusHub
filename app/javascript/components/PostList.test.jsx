// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  fetchComments: vi.fn(),
}));

vi.mock('./api', () => ({
  createComment: vi.fn(),
  deleteComment: vi.fn(),
  deletePost: vi.fn(),
  fetchComments: apiMocks.fetchComments,
  likePost: vi.fn(),
  unlikePost: vi.fn(),
}));

vi.mock('../context/AuthContext', async () => {
  const ReactModule = await import('react');
  return { AuthContext: ReactModule.createContext({ user: null }) };
});

import { AuthContext } from '../context/AuthContext';
import PostList from './PostList';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PostList comments', () => {
  it('loads the complete discussion only when a preview is expanded', async () => {
    apiMocks.fetchComments.mockResolvedValue({
      data: [{
        id: 90,
        body: 'The complete discussion is available.',
        created_at: '2026-08-12T08:00:00Z',
        can_delete: false,
        user: { id: 8, first_name: 'Review', last_name: 'User' },
      }],
    });
    const onPostUpdate = vi.fn((postId, updater) => {
      expect(postId).toBe(10);
      expect(updater({ id: 10 }).comments).toHaveLength(1);
    });

    render(
      <AuthContext.Provider value={{ user: { id: 4, first_name: 'Divya' } }}>
        <PostList
          posts={[{
            id: 10,
            message: 'An update with a long discussion',
            created_at: '2026-08-12T07:00:00Z',
            comments: [],
            comments_count: 6,
            has_more_comments: true,
            likes_count: 0,
            user: { id: 7, first_name: 'Post', last_name: 'Owner' },
          }]}
          refreshPosts={vi.fn()}
          onPostUpdate={onPostUpdate}
        />
      </AuthContext.Provider>
    );

    expect(apiMocks.fetchComments).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Comment/i }));

    await waitFor(() => expect(apiMocks.fetchComments).toHaveBeenCalledWith(10));
    expect(onPostUpdate).toHaveBeenCalledTimes(1);
  });
});
