import * as Sentry from '@sentry/react-native';

export type CallPhase = 'create' | 'credentials' | 'permission' | 'connect' | 'reconnect' | 'leave' | 'end' | 'incoming';

export function recordCallBreadcrumb(phase: CallPhase, data: Record<string, string | number | boolean | undefined> = {}) {
  Sentry.addBreadcrumb({ category: 'mobile.call', level: 'info', message: phase, data: sanitize(data) });
}

export function captureCallError(error: unknown, phase: CallPhase, data: Record<string, string | number | boolean | undefined> = {}) {
  Sentry.withScope((scope) => {
    scope.setTag('mobile.call.phase', phase);
    scope.setContext('mobile.call', sanitize(data));
    Sentry.captureException(error);
  });
}

function sanitize(data: Record<string, string | number | boolean | undefined>) {
  return Object.fromEntries(Object.entries(data).filter(([key, value]) => value !== undefined && !/token|message|body/i.test(key)));
}
