// Pure matching rules for picking the phone's own call recording for a call session.
// No React Native imports, so it can be unit-tested with `node --test` (see mobile/tests/).

export interface RecordingCandidate {
  uri: string;
  /** Decoded file name (no folder) */
  name: string;
  /** Best known time of the file in ms: filename timestamp or modified time; null if unknown */
  timeMs: number | null;
  /** Size in bytes if known */
  sizeBytes?: number | null;
}

export interface MatchContext {
  phone: string;
  callStartMs: number;
  callEndMs: number;
  /** End of the previous call session; files older than this belong to an earlier call */
  prevSessionEndMs?: number;
  consumed?: Set<string>;
  /** Connected duration in seconds (for the size sanity check); 0/unknown disables it */
  connectedSeconds?: number;
}

export const WINDOW_BEFORE_MS = 10_000;
export const WINDOW_AFTER_MS = 60_000;
// Near-empty file guard. ~1 KB per connected second (AMR-NB at 12.2 kbps is ~1.5 KB/s, so a
// higher floor would reject genuine AMR call recordings), with a 2 KB minimum.
export const MIN_BYTES_PER_SECOND = 1024;
export const MIN_BYTES = 2048;

export const last10Digits = (value: string): string => (value || '').replace(/\D/g, '').slice(-10);

/** 10-digit Indian mobile numbers in a file name, with any +91 / 91 / 0 prefix removed */
export const phoneNumbersInName = (name: string): string[] => {
  const found: string[] = [];
  const re = /(?:\+?91|0)?([6-9]\d{9})(?!\d)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(name || '')) !== null) found.push(m[1]);
  return found;
};

const baseName = (uriOrName: string): string => {
  const decoded = (() => { try { return decodeURIComponent(uriOrName); } catch { return uriOrName; } })();
  return decoded.split('/').pop()?.split(':').pop() || decoded;
};

const isConsumed = (c: RecordingCandidate, consumed?: Set<string>): boolean => {
  if (!consumed || consumed.size === 0) return false;
  return consumed.has(c.uri) || consumed.has(c.name) || consumed.has(baseName(c.uri));
};

/**
 * Picks the recording for this call, or null.
 * - never a consumed file, a file from before the previous session ended, or a file outside
 *   [callStart - 10s, callEnd + 60s];
 * - a file whose name has a DIFFERENT phone number is rejected; one with the dialled number is preferred;
 * - near-empty files (smaller than ~1 KB per connected second) are rejected;
 * - the closest in time to the call wins.
 */
export const pickBestRecording = (
  candidates: RecordingCandidate[],
  ctx: MatchContext
): RecordingCandidate | null => {
  const target = last10Digits(ctx.phone);
  const windowStart = Math.max(ctx.callStartMs - WINDOW_BEFORE_MS, ctx.prevSessionEndMs || 0);
  const windowEnd = ctx.callEndMs + WINDOW_AFTER_MS;
  const minBytes = ctx.connectedSeconds && ctx.connectedSeconds > 0
    ? Math.max(MIN_BYTES, ctx.connectedSeconds * MIN_BYTES_PER_SECOND)
    : 0;

  let best: { c: RecordingCandidate; numberMatch: boolean; distance: number } | null = null;
  for (const c of candidates) {
    if (isConsumed(c, ctx.consumed)) continue;
    if (c.timeMs === null || c.timeMs === undefined || !Number.isFinite(c.timeMs)) continue;
    if (c.timeMs < windowStart || c.timeMs > windowEnd) continue;
    if (minBytes && typeof c.sizeBytes === 'number' && c.sizeBytes < minBytes) continue;

    const numbers = phoneNumbersInName(c.name);
    const numberMatch = target.length === 10 && numbers.includes(target);
    if (numbers.length > 0 && !numberMatch) continue; // recording of a different call

    // Distance from the call itself: 0 while the call was running
    const distance = c.timeMs < ctx.callStartMs ? ctx.callStartMs - c.timeMs
      : c.timeMs > ctx.callEndMs ? c.timeMs - ctx.callEndMs : 0;

    if (
      !best ||
      (numberMatch && !best.numberMatch) ||
      (numberMatch === best.numberMatch && distance < best.distance)
    ) {
      best = { c, numberMatch, distance };
    }
  }
  return best ? best.c : null;
};
