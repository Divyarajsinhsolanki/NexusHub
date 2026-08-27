import * as Application from 'expo-application';
import * as Sentry from '@sentry/react-native';
import { AppState } from 'react-native';

type DiagnosticValue = string | number | boolean | null | undefined;
type ChatPhase = {
  conversationId: number;
  phase: string;
  at: number;
  details: Record<string, DiagnosticValue>;
};

const MAX_PHASES = 20;
const phases: ChatPhase[] = [];

export function recordChatPhase(
  conversationId: number,
  phase: string,
  details: Record<string, DiagnosticValue> = {},
) {
  const entry: ChatPhase = {
    conversationId,
    phase,
    at: Date.now(),
    details: {
      ...details,
      app_state: AppState.currentState,
      build: Application.nativeBuildVersion || null,
      version: Application.nativeApplicationVersion || null,
    },
  };

  phases.push(entry);
  if (phases.length > MAX_PHASES) phases.splice(0, phases.length - MAX_PHASES);

  Sentry.addBreadcrumb({
    category: 'mobile.chat',
    level: 'info',
    message: phase,
    data: { conversation_id: conversationId, ...entry.details },
  });
}

export function recentChatPhases(conversationId?: number) {
  return phases
    .filter((entry) => conversationId === undefined || entry.conversationId === conversationId)
    .map((entry) => ({ ...entry, details: { ...entry.details } }));
}

export function resetChatPhasesForTests() {
  phases.splice(0, phases.length);
}
