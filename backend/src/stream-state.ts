/**
 * Shared in-memory state for the stream Redis subscriber.
 *
 * The Redis subscriber (index.ts) updates the current session id for
 * each channel off status payloads, and the Live monitor route
 * (routes/stream.ts) reads it to know which YUNA session to pull from
 * yuna-api. Kept here (not in index.ts) to avoid a circular import.
 */

export type StreamChannel = "ja" | "en";

const currentSessionId: Record<StreamChannel, string | null> = {
  ja: null,
  en: null,
};

export function getCurrentStreamSessionId(ch: StreamChannel): string | null {
  return currentSessionId[ch];
}

export function setCurrentStreamSessionId(
  ch: StreamChannel,
  sessionId: string | null,
): void {
  currentSessionId[ch] = sessionId;
}
