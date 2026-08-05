import { safeReturnPath } from './safeReturnPath';

type AuthRedirectInput = {
  isLoading: boolean;
  pathname: string;
  firstSegment?: string;
  returnTo?: unknown;
  signedIn: boolean;
};

export type AuthRedirectTarget = string | null;

const AUTH_ROUTES = new Set(['login', 'signup', 'forgot-password', 'reset-password']);

export function authRedirectTarget({ isLoading, pathname, firstSegment, returnTo, signedIn }: AuthRedirectInput): AuthRedirectTarget {
  if (isLoading) return null;

  const publicPortfolio = pathname === '/';
  const authRoute = AUTH_ROUTES.has(firstSegment || '');
  const protectedRoute = !publicPortfolio && !authRoute;

  if (!signedIn && protectedRoute) return `/login?returnTo=${encodeURIComponent(pathname)}`;
  if (signedIn && (publicPortfolio || authRoute)) return safeReturnPath(returnTo);
  return null;
}
