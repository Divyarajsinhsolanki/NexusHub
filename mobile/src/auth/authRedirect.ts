type AuthRedirectInput = {
  isLoading: boolean;
  pathname: string;
  firstSegment?: string;
  signedIn: boolean;
};

export type AuthRedirectTarget = '/' | '/(tabs)/today' | null;

const AUTH_ROUTES = new Set(['login', 'signup', 'forgot-password', 'reset-password']);

export function authRedirectTarget({ isLoading, pathname, firstSegment, signedIn }: AuthRedirectInput): AuthRedirectTarget {
  if (isLoading) return null;

  const publicPortfolio = pathname === '/';
  const authRoute = AUTH_ROUTES.has(firstSegment || '');
  const protectedRoute = !publicPortfolio && !authRoute;

  if (!signedIn && protectedRoute) return '/';
  if (signedIn && (publicPortfolio || authRoute)) return '/(tabs)/today';
  return null;
}
