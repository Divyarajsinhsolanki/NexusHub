const normalizedText = (value) => String(value || '').trim().toLowerCase();

export const postAuthorName = (post) => {
  const user = post?.user || {};
  return [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email || 'Unknown member';
};

export const postEngagement = (post) => (
  Number(post?.likes_count || 0) + Number(post?.comments_count || post?.comments?.length || 0)
);

export const filterAndSortPosts = ({ posts = [], query = '', filter = 'all', sort = 'newest', userId }) => {
  const normalizedQuery = normalizedText(query);

  const filtered = posts.filter((post) => {
    if (filter === 'mine' && String(post?.user?.id) !== String(userId)) return false;
    if (filter === 'media' && !post?.image_url) return false;
    if (filter === 'discussed' && Number(post?.comments_count || post?.comments?.length || 0) <= 0) return false;

    if (!normalizedQuery) return true;
    const searchableText = normalizedText(`${postAuthorName(post)} ${post?.message || ''}`);
    return searchableText.includes(normalizedQuery);
  });

  return [...filtered].sort((left, right) => {
    if (sort === 'active') {
      return postEngagement(right) - postEngagement(left) || new Date(right.created_at) - new Date(left.created_at);
    }
    if (sort === 'oldest') return new Date(left.created_at) - new Date(right.created_at);
    return new Date(right.created_at) - new Date(left.created_at);
  });
};
