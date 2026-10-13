import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { beforeEach, expect, jest, test } from '@jest/globals';
import { PostFeed } from '../../app/(tabs)/inbox';
import { Alert } from 'react-native';
import { endpoints } from '../api/endpoints';
import type { CollectionResult, Post } from '../api/types';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({top:0,bottom:0,left:0,right:0}) }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 1 } }) }));
jest.mock('../api/endpoints', () => ({ endpoints: { posts: jest.fn(), likePost: jest.fn(), unlikePost: jest.fn(), deletePost: jest.fn() } }));
const author = { id: 1, first_name: 'Alex', last_name: 'Morgan' };
const post = { id: 12, message: 'Team update', created_at: '2026-10-10T07:00:00Z', likes_count: 0, liked_by_current_user: false, comments_count: 1, comments: [{ id: 7, body: 'Helpful comment', created_at: '2026-10-10T08:00:00Z', user: author }], user: author } as Post;
const mockRefresh = jest.fn();
function Feed() {
  const rows = useQuery<CollectionResult<Post>>({ queryKey: ['posts'], queryFn: () => endpoints.posts(), enabled: false });
  return <PostFeed posts={rows.data?.data || []} nextPage={rows.data?.meta?.next_page} onRefresh={mockRefresh} />;
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(endpoints.posts).mockResolvedValue({ data: [post, { ...post, id: 13, message: 'Older update' }], meta: { next_page: null } } as never);
  jest.mocked(endpoints.likePost).mockResolvedValue({ ...post, liked_by_current_user: true, likes_count: 1 });
});
async function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } } });
  client.setQueryData(['posts'], { data: [post], meta: { next_page: 2 } });
  const screen = await render(<QueryClientProvider client={client}><Feed /></QueryClientProvider>);
  return { screen, client, close: async () => { await screen.unmount(); client.clear(); } };
}
test('opens discussions from inline previews and loads older posts without duplicates', async () => {
  const { screen, client, close } = await setup();
  expect(screen.getByText('Helpful comment', { exact: false })).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'View discussion' }));
  expect(mockPush).toHaveBeenCalledWith('/inbox/post/12');
  await fireEvent.press(screen.getByRole('button', { name: 'Load more updates' }));
  await waitFor(() => expect(screen.getByText('Older update')).toBeTruthy());
  expect(endpoints.posts).toHaveBeenCalledWith(2);
  expect((client.getQueryData(['posts']) as CollectionResult<Post>).data.map((row) => row.id)).toEqual([12, 13]);
  expect(screen.queryByRole('button', { name: 'Load more updates' })).toBeNull();
  await close();
});
test('optimistic reactions keep the intended API action', async () => {
  const { screen, close } = await setup();
  await fireEvent.press(screen.getByLabelText('Like post'));
  await waitFor(() => expect(endpoints.likePost).toHaveBeenCalledWith(12));
  expect(endpoints.unlikePost).not.toHaveBeenCalled();
  await close();
});

test('opens author profile and deletes only the owned post after confirmation', async () => {
  const {screen,client,close} = await setup();
  const confirm = jest.spyOn(Alert,'alert').mockImplementation((_title,_message,buttons) => { buttons?.find(button=>button.text === 'Delete')?.onPress?.(); });
  await fireEvent.press(screen.getByLabelText('Open profile of Alex Morgan'));
  expect(mockPush).toHaveBeenCalledWith('/profile/1');
  await fireEvent.press(screen.getByLabelText('Update actions'));
  await fireEvent.press(screen.getByText('Delete update'));
  await waitFor(()=>expect(endpoints.deletePost).toHaveBeenCalledWith(12));
  await waitFor(()=>expect((client.getQueryData(['posts']) as CollectionResult<Post>).data).toEqual([]));
  confirm.mockRestore(); await close();
});
