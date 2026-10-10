import { safeReturnPath } from './safeReturnPath';

type AuthRedirectInput = {
  isLoading: boolean;
  pathname: string;
  firstSegment?: string;
  returnTo?: unknown;
  signedIn: boolean;
  landingPage?: string;
};

export type AuthRedirectTarget = string | null;

const AUTH_ROUTES = new Set(['login', 'signup', 'forgot-password', 'reset-password']);

export function authRedirectTarget({ isLoading, pathname, firstSegment, returnTo, signedIn, landingPage }: AuthRedirectInput): AuthRedirectTarget {
  if (isLoading) return null;

  const publicPortfolio = pathname === '/';
  const authRoute = AUTH_ROUTES.has(firstSegment || '');
  const protectedRoute = !publicPortfolio && !authRoute;

  if (!signedIn && protectedRoute) return `/login?returnTo=${encodeURIComponent(pathname)}`;
  if (signedIn && (publicPortfolio || authRoute)) return safeReturnPath(returnTo, mobileLandingPath(landingPage));
  return null;
}

export function mobileLandingPath(landingPage?: string) {
  const destinations: Record<string, string> = {
    calendar: '/more/calendar', posts: '/inbox?mode=posts', profile: '/more/profile',
    vault: '/more/vault', knowledge: '/more/knowledge', worklog: '/work?mode=logs',
    projects: '/projects', teams: '/more/teams', pdf: '/more/pdf', users: '/more/people',
    departments: '/more/departments', chat: '/inbox?mode=chat', notifications: '/inbox/notifications',
  };
  return destinations[landingPage || ''] || '/(tabs)/today';
}
