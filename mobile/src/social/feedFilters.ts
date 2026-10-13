import type { Conversation, Post } from "../api/types";
export type ConversationFilter = "all" | "unread" | "direct" | "group";
export type PostFilter = "all" | "mine" | "media" | "discussed";
export type PostSort = "newest" | "oldest" | "active";
export function filterConversations(
  rows: Conversation[],
  query: string,
  filter: ConversationFilter,
) {
  const search = query.trim().toLowerCase();
  return rows.filter(
    (row) =>
      (filter === "all" ||
        (filter === "unread"
          ? Number(row.unread_count) > 0
          : row.conversation_type === filter)) &&
      (!search ||
        String(row.title || row.name || `Conversation ${row.id}`)
          .toLowerCase()
          .includes(search)),
  );
}
export function filterPosts(
  rows: Post[],
  query: string,
  filter: PostFilter,
  sort: PostSort,
  userId?: number,
) {
  const search = query.trim().toLowerCase();
  const time = (post: Post) => new Date(post.created_at).getTime();
  const engagement = (post: Post) =>
    Number(post.likes_count || 0) +
    Number(post.comments_count || post.comments?.length || 0);
  return rows
    .filter(
      (post) =>
        (filter !== "mine" || post.user.id === userId) &&
        (filter !== "media" || Boolean(post.image_url)) &&
        (filter !== "discussed" ||
          Number(post.comments_count || post.comments?.length || 0) > 0) &&
        (!search ||
          `${post.user.first_name} ${post.user.last_name} ${post.message}`
            .toLowerCase()
            .includes(search)),
    )
    .sort((a, b) =>
      sort === "oldest"
        ? time(a) - time(b)
        : sort === "active"
          ? engagement(b) - engagement(a) || time(b) - time(a)
          : time(b) - time(a),
    );
}
