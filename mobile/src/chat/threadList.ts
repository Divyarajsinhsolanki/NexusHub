import type { Message } from '../api/types';

export function messageKey(message: Message) {
  return String(message.id);
}

/**
 * Allows one history request for each deliberate upward gesture and cursor.
 * Initial layout/onScroll events therefore cannot recursively drain history.
 */
export class OlderPageRequestGate {
  private inFlight = false;
  private requestedCursors = new Set<number>();
  private userGesture = false;

  markUserGesture() {
    this.userGesture = true;
  }

  begin(cursor: unknown) {
    const normalizedCursor = Number(cursor);
    if (
      !this.userGesture ||
      this.inFlight ||
      !Number.isFinite(normalizedCursor) ||
      normalizedCursor <= 0 ||
      this.requestedCursors.has(normalizedCursor)
    ) {
      return false;
    }

    this.userGesture = false;
    this.inFlight = true;
    this.requestedCursors.add(normalizedCursor);
    return true;
  }

  finish(cursor: unknown, succeeded: boolean) {
    const normalizedCursor = Number(cursor);
    this.inFlight = false;
    if (!succeeded && Number.isFinite(normalizedCursor)) {
      this.requestedCursors.delete(normalizedCursor);
    }
  }

  reset() {
    this.inFlight = false;
    this.requestedCursors.clear();
    this.userGesture = false;
  }
}
