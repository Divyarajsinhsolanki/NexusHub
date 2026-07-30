export function normalizeMobileDeepLink(deepLink: unknown) {
  if (typeof deepLink !== 'string') return null;

  const trimmed = deepLink.trim();
  if (!trimmed) return null;

  const path = extractPath(trimmed);
  if (!path || !path.startsWith('/')) return null;

  if (path === '/notifications') return '/inbox/notifications';
  if (path === '/chat') return '/inbox';
  if (path.startsWith('/chat/')) return `/inbox${path}`;
  if (path === '/posts') return '/inbox';
  if (path.startsWith('/posts/')) return path.replace(/^\/posts\//, '/inbox/post/');

  return path;
}

function extractPath(value: string) {
  if (!/^https?:\/\//i.test(value)) return value;

  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
