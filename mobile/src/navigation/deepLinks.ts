export function normalizeMobileDeepLink(deepLink: unknown) {
  if (typeof deepLink !== 'string') return null;

  const trimmed = deepLink.trim();
  if (!trimmed) return null;

  const path = extractPath(trimmed);
  if (!path || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return null;

  if (/^\/projects\/\d+\/dashboard(?:\?|$)/.test(path)) {
    const destination = new URL(path, 'https://nexushub.local');
    const projectPath = destination.pathname.replace(/\/dashboard$/, '');
    if (destination.searchParams.get('tab') === 'environments') return `${projectPath}/environments`;
    destination.searchParams.delete('tab');
    return `${projectPath}${destination.search}${destination.hash}`;
  }

  if (/^\/knowledge(?:\?|$)/.test(path)) return path.replace(/^\/knowledge/, '/more/knowledge');

  const destination = new URL(path, 'https://nexushub.local');
  const aliases: Record<string, string> = {
    '/users': '/more/people', '/teams': '/more/teams', '/departments': '/more/departments',
    '/vault': '/more/vault', '/pdf': '/more/pdf', '/pdf-master': '/more/pdf',
    '/calendar': '/more/calendar', '/momentum': '/more/momentum',
    '/profile': '/more/profile', '/settings': '/more/settings',
    '/admin': '/more/admin', '/admin/portfolio': '/more/portfolio-admin',
    '/admin/login-as-user': '/more/impersonation',
  };
  if (aliases[destination.pathname]) return `${aliases[destination.pathname]}${destination.search}${destination.hash}`;
  if (/^\/departments\/\d+$/.test(destination.pathname)) return `/more${destination.pathname}${destination.search}${destination.hash}`;

  if (destination.pathname === '/posts' && /^#post-\d+$/.test(destination.hash)) return `/inbox/post/${destination.hash.slice(6)}`;
  if (/^\/projects\/\d+\/issues$/.test(destination.pathname) && destination.searchParams.has('issue_id')) {
    destination.searchParams.set('issueId', destination.searchParams.get('issue_id')!);
    destination.searchParams.delete('issue_id');
    return `${destination.pathname}${destination.search}`;
  }

  if (path === '/notifications') return '/inbox/notifications';
  if (path === '/chat') return '/inbox';
  if (path.startsWith('/chat/')) return path;
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
