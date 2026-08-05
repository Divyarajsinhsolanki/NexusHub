const AUTH_PATHS = new Set(['/login', '/signup', '/forgot-password', '/reset-password']);

export function safeReturnPath(value: unknown, fallback = '/(tabs)/today') {
  if (typeof value !== 'string') return fallback;
  const path = value.trim();
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return fallback;

  const pathname = path.split(/[?#]/, 1)[0];
  if (AUTH_PATHS.has(pathname)) return fallback;
  return path;
}
