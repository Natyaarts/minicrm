// Pure matching rules for picking the phone's own call recording for a call session.
// No React Native imports, so it can be unit-tested with `node --test` (see mobile/tests/).
//
// One scoring function (evaluateCandidate) and one assignment function (assignRecordings) are shared by
// the live matcher (Call Review), the pending late-recording retry and the background backfill.

export interface RecordingCandidate {
  uri: string;
  /** Decoded file name (no folder) */
  name: string;
  /** Best known time of the file in ms (legacy): filename timestamp or modified time; null if unknown */
  timeMs: number | null;
  /** Time parsed from the file name. Recorders usually name the file with the call START time. */
  nameTimeMs?: number | null;
  /** Last-modified time. Usually the call END time (the recorder closes the file at hang-up). */
  modifiedMs?: number | null;
  /** Size in bytes if known */
  sizeBytes?: number | null;
  /** Audio duration in seconds, read only for the few final candidates; null/undefined if unknown */
  durationSec?: number | null;
}

export interface MatchContext {
  /** Identifies the call in assignRecordings results and logs */
  key?: string;
  phone: string;
  callStartMs: number;
  callEndMs: number;
  /** End of the previous call session; files that end before this belong to an earlier call */
  prevSessionEndMs?: number;
  consumed?: Set<string>;
  /** Files reserved for OTHER calls (must not contain this call's own reservation) */
  reserved?: Set<string>;
  /** Connected duration in seconds (size and duration checks); 0/unknown disables them */
  connectedSeconds?: number;
  /** Start of the next call made on this phone, if known: the window never extends past it */
  nextCallStartMs?: number;
  /** Start times of other known calls: a name time closer to one of them belongs to that call */
  otherCallStartsMs?: number[];
  /** Window around the call for files known only by `timeMs` (and number-matched files). Default 10s / 60s */
  windowBeforeMs?: number;
  windowAfterMs?: number;
  /** Only accept files whose name has the dialled number (used when the call's real times are unknown) */
  requireNumberMatch?: boolean;
}

export const WINDOW_BEFORE_MS = 10_000;
export const WINDOW_AFTER_MS = 60_000;
// Name timestamp ≈ call start: allow it 10s before and 30s after the start (or after the connect time,
// callEnd - connected duration, when that is known: the phone may ring for a while before connecting)
export const NAME_BEFORE_START_MS = 10_000;
export const NAME_AFTER_START_MS = 30_000;
// Longest ringing assumed between dialling and connecting
export const MAX_RING_MS = 60_000;
// Last-modified ≈ call end: allow it 10s before and 60s after the end
export const MODIFIED_BEFORE_END_MS = 10_000;
export const MODIFIED_AFTER_END_MS = 60_000;
// Near-empty file guard. ~1 KB per connected second (AMR-NB at 12.2 kbps is ~1.5 KB/s, so a
// higher floor would reject genuine AMR call recordings), with a 2 KB minimum.
export const MIN_BYTES_PER_SECOND = 1024;
export const MIN_BYTES = 2048;
// Audio duration vs CallLog connected duration: within max(3s, 10%); the recorder may start up to
// 2s late, so the file may be that much shorter on top of the tolerance.
export const DURATION_TOLERANCE_MIN_SEC = 3;
export const DURATION_TOLERANCE_RATIO = 0.1;
export const DURATION_LATE_START_SEC = 2;
// Two candidates whose scores differ by less than this are "equally good" (ambiguous)
export const AMBIGUITY_MARGIN_MS = 5_000;
// A file whose name has no phone number always ranks after any file with the dialled number
const NUMBERLESS_PENALTY = 1e9;

export const last10Digits = (value: string): string => (value || '').replace(/\D/g, '').slice(-10);

/** Last 4 digits only, for logs */
export const maskPhone = (value: string): string => {
  const d = (value || '').replace(/\D/g, '');
  return d ? `…${d.slice(-4)}` : '?';
};

/** First 3 characters only, for logs (file names can contain contact names) */
export const maskName = (name: string): string => {
  const n = name || '';
  return n.length <= 3 ? n : `${n.slice(0, 3)}…`;
};

/**
 * 10-digit Indian mobile numbers in a file name, with any +91 / 91 / 0 prefix removed. A number must not
 * be part of a longer digit run, so the digits of a timestamp like 20261124120301 are never read as one.
 */
export const phoneNumbersInName = (name: string): string[] => {
  const found: string[] = [];
  // (?:^|\D) instead of a lookbehind: it works on every JS engine
  const re = /(?:^|\D)(?:\+?91|0)?([6-9]\d{9})(?!\d)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(name || '')) !== null) found.push(m[1]);
  return found;
};

const localTime = (y: number, mo: number, d: number, h: number, mi: number, s: number, nowMs: number): number | null => {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  if (Math.abs(y - new Date(nowMs).getFullYear()) > 1) return null;
  const t = new Date(y, mo - 1, d, h, mi, s);
  if (t.getFullYear() !== y || t.getMonth() !== mo - 1 || t.getDate() !== d) return null; // e.g. 31 Feb
  return t.getTime();
};

const firstValid = (name: string, re: RegExp, build: (m: RegExpExecArray) => number | null): number | null => {
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(name)) !== null) {
    const t = build(m);
    if (t !== null) return t;
  }
  return null;
};

/**
 * Time (ms, device local time) encoded in a call-recording file name, or null:
 *  - yyyy-MM-dd HH-mm-ss with optional - _ . separators, e.g. Rec_2026-11-24_12-03-01, 20261124_120301
 *  - compact yyyyMMddHHmmss, e.g. Rahul Sharma_20261124120301 (MIUI)
 *  - Samsung yyMMdd_HHmmss, e.g. Call recording Rahul Sharma_261124_120301
 *  - 13-digit epoch ms
 * Ranges are validated (month 1-12, day 1-31, hour 0-23, min/sec 0-59, year within ±1 of now), so a
 * phone number is never read as a date.
 */
export const extractTimestampFromFileName = (fileName: string, nowMs: number = Date.now()): number | null => {
  if (!fileName) return null;
  const n = Number;
  return (
    firstValid(fileName, /(?:^|\D)(20\d{2})[-_.]?(\d{2})[-_.]?(\d{2})[-_.\sT]+(\d{2})[-_.]?(\d{2})[-_.]?(\d{2})(?!\d)/g,
      (m) => localTime(n(m[1]), n(m[2]), n(m[3]), n(m[4]), n(m[5]), n(m[6]), nowMs)) ??
    firstValid(fileName, /(?:^|\D)(20\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?!\d)/g,
      (m) => localTime(n(m[1]), n(m[2]), n(m[3]), n(m[4]), n(m[5]), n(m[6]), nowMs)) ??
    firstValid(fileName, /(?:^|\D)(\d{2})(\d{2})(\d{2})[-_\s](\d{2})(\d{2})(\d{2})(?!\d)/g,
      (m) => localTime(2000 + n(m[1]), n(m[2]), n(m[3]), n(m[4]), n(m[5]), n(m[6]), nowMs)) ??
    firstValid(fileName, /(?:^|\D)(1\d{12})(?!\d)/g, (m) => {
      const ts = n(m[1]);
      return Math.abs(ts - nowMs) <= 366 * 24 * 3600 * 1000 ? ts : null;
    })
  );
};

const baseName = (uriOrName: string): string => {
  const decoded = (() => { try { return decodeURIComponent(uriOrName); } catch { return uriOrName; } })();
  return decoded.split('/').pop()?.split(':').pop() || decoded;
};

/** Identifiers a recording can be listed under in the consumed / reserved sets */
export const recordingKeys = (uriOrName: string): string[] => {
  if (!uriOrName) return [];
  const keys = new Set<string>([uriOrName]);
  const plain = uriOrName.split('/').pop();
  if (plain) keys.add(plain);
  keys.add(baseName(uriOrName));
  return [...keys];
};

const inSet = (c: RecordingCandidate, set?: Set<string>): boolean => {
  if (!set || set.size === 0) return false;
  return set.has(c.uri) || set.has(c.name) || set.has(baseName(c.uri));
};

const finite = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

export type RejectReason =
  | 'consumed' | 'reserved' | 'other number' | 'no number' | 'too small' | 'no time' | 'before previous session'
  | 'outside window' | 'after next call' | 'other call' | 'duration mismatch';

export type CandidateEvaluation =
  | { ok: true; score: number; numberMatch: boolean; distanceMs: number; durationDiffSec: number | null }
  | { ok: false; reason: RejectReason };

/**
 * Scores one file for one call (lower is better), or says why it can't be this call's recording.
 *  - never a consumed file, a file reserved for another call, or a file whose name has a DIFFERENT number;
 *  - never a file that ends before the previous session ended, or that is past the next call's start;
 *  - name time is compared to the call start, last-modified to the call end (files with only `timeMs`
 *    use the legacy window [start - 10s, end + 60s]; number-matched files may also use it);
 *  - a name time closer to another known call's start belongs to that call;
 *  - near-empty files and files whose audio duration doesn't fit the connected duration are rejected;
 *  - a file with the dialled number in its name always beats one without a number.
 */
export const evaluateCandidate = (c: RecordingCandidate, ctx: MatchContext): CandidateEvaluation => {
  if (inSet(c, ctx.consumed)) return { ok: false, reason: 'consumed' };
  if (inSet(c, ctx.reserved)) return { ok: false, reason: 'reserved' };

  const target = last10Digits(ctx.phone);
  const numbers = phoneNumbersInName(c.name);
  const numberMatch = target.length === 10 && numbers.includes(target);
  if (numbers.length > 0 && !numberMatch) return { ok: false, reason: 'other number' };
  if (ctx.requireNumberMatch && !numberMatch) return { ok: false, reason: 'no number' };

  const connected = ctx.connectedSeconds && ctx.connectedSeconds > 0 ? ctx.connectedSeconds : 0;
  const minBytes = connected ? Math.max(MIN_BYTES, connected * MIN_BYTES_PER_SECOND) : 0;
  if (minBytes && typeof c.sizeBytes === 'number' && c.sizeBytes >= 0 && c.sizeBytes < minBytes) {
    return { ok: false, reason: 'too small' };
  }

  const start = ctx.callStartMs;
  const end = ctx.callEndMs;
  const floor = ctx.prevSessionEndMs && ctx.prevSessionEndMs > 0 ? ctx.prevSessionEndMs : 0;
  const cap = finite(ctx.nextCallStartMs) && ctx.nextCallStartMs > start ? ctx.nextCallStartMs : Infinity;
  const before = ctx.windowBeforeMs ?? WINDOW_BEFORE_MS;
  const after = ctx.windowAfterMs ?? WINDOW_AFTER_MS;

  // Distance from the call itself for a single time: 0 while the call was running
  const callDistance = (t: number) => (t < start ? start - t : t > end ? t - end : 0);
  const legacyCheck = (t: number): RejectReason | null => {
    if (t < floor) return 'before previous session';
    if (t > cap) return 'after next call';
    if (t < start - before || t > end + after) return 'outside window';
    return null;
  };

  const nameT = finite(c.nameTimeMs) ? c.nameTimeMs : null;
  const modT = finite(c.modifiedMs) ? c.modifiedMs : null;
  let distanceMs: number;

  if (nameT === null && modT === null) {
    // Legacy candidate: only one "best known" time
    if (!finite(c.timeMs)) return { ok: false, reason: 'no time' };
    const bad = legacyCheck(c.timeMs);
    if (bad) return { ok: false, reason: bad };
    distanceMs = callDistance(c.timeMs);
  } else {
    // The file must not END before the previous session ended
    const endT = modT ?? nameT!;
    if (endT < floor) return { ok: false, reason: 'before previous session' };

    const options: number[] = [];
    let hitCap = false;

    if (nameT !== null) {
      // Connect time = end - connected duration, assuming at most MAX_RING_MS of ringing before it
      const connectAt = connected ? Math.min(Math.max(start, end - connected * 1000), start + MAX_RING_MS) : start;
      const lo = start - NAME_BEFORE_START_MS;
      const hiRaw = Math.min(Math.max(start, connectAt) + NAME_AFTER_START_MS, end + WINDOW_BEFORE_MS);
      const hi = Math.min(hiRaw, cap);
      if (nameT > cap && nameT <= hiRaw) hitCap = true;
      if (nameT >= lo && nameT <= hi && nameT >= floor) {
        const dName = nameT >= start && nameT <= Math.max(start, connectAt)
          ? 0
          : Math.min(Math.abs(nameT - start), Math.abs(nameT - connectAt));
        // A name time closer to another known call's start belongs to that call
        const closerElsewhere = (ctx.otherCallStartsMs || []).some((s) => Math.abs(nameT - s) < dName);
        if (closerElsewhere) return { ok: false, reason: 'other call' };
        options.push(dName);
      }
    }
    if (modT !== null) {
      const lo = end - MODIFIED_BEFORE_END_MS;
      const hiRaw = end + Math.max(after, MODIFIED_AFTER_END_MS);
      const hi = Math.min(hiRaw, cap);
      if (modT > cap && modT <= hiRaw) hitCap = true;
      if (modT >= lo && modT <= hi) options.push(Math.abs(modT - end));
    }
    if (numberMatch && options.length === 0) {
      // The dialled number already identifies the call: the legacy window is enough
      const t = finite(c.timeMs) ? c.timeMs : (nameT ?? modT!);
      if (!legacyCheck(t)) options.push(callDistance(t));
    }
    if (options.length === 0) return { ok: false, reason: hitCap ? 'after next call' : 'outside window' };
    distanceMs = Math.min(...options);
  }

  let durationDiffSec: number | null = null;
  if (connected && finite(c.durationSec) && c.durationSec > 0) {
    const tol = Math.max(DURATION_TOLERANCE_MIN_SEC, connected * DURATION_TOLERANCE_RATIO);
    if (c.durationSec < connected - tol - DURATION_LATE_START_SEC || c.durationSec > connected + tol) {
      return { ok: false, reason: 'duration mismatch' };
    }
    durationDiffSec = Math.abs(c.durationSec - connected);
  }

  const score = (numberMatch ? 0 : NUMBERLESS_PENALTY) + distanceMs + (durationDiffSec ?? 0) * 1000;
  return { ok: true, score, numberMatch, distanceMs, durationDiffSec };
};

export interface CallAssignment {
  file: RecordingCandidate | null;
  /** Why nothing was picked: 'no candidate' or 'ambiguous' */
  reason?: 'no candidate' | 'ambiguous';
  /** Candidates that passed evaluateCandidate for this call */
  passing: number;
}

export interface AssignmentResult {
  byCall: Map<string, CallAssignment>;
  rejections: { callKey: string; name: string; reason: RejectReason }[];
}

/**
 * Assigns files to calls jointly: one file per call, one call per file.
 *  1. Every file is scored for every call (evaluateCandidate).
 *  2. A file that passes for several calls goes to the call it scores best for; if two calls score it
 *     within AMBIGUITY_MARGIN_MS of each other it is "contested" and goes to neither.
 *  3. A call whose best remaining candidate is contested, or whose two best candidates are within the
 *     margin, gets nothing (ambiguous): better no recording than the wrong one.
 * Pass the calls oldest first; nextCallStartMs / otherCallStartsMs should already be set on each.
 */
export const assignRecordings = (calls: MatchContext[], candidates: RecordingCandidate[]): AssignmentResult => {
  const rejections: AssignmentResult['rejections'] = [];
  const keys = calls.map((c, i) => c.key ?? String(i));
  const passing: { cand: RecordingCandidate; score: number }[][] = calls.map((ctx, i) => {
    const list: { cand: RecordingCandidate; score: number }[] = [];
    for (const cand of candidates) {
      const ev = evaluateCandidate(cand, ctx);
      if (ev.ok) list.push({ cand, score: ev.score });
      else rejections.push({ callKey: keys[i], name: cand.name, reason: ev.reason });
    }
    return list.sort((a, b) => a.score - b.score);
  });

  // Owner of each file: the call it scores best for (or contested)
  const owner = new Map<string, number | 'contested'>();
  const byFile = new Map<string, { call: number; score: number }[]>();
  passing.forEach((list, ci) => list.forEach(({ cand, score }) => {
    const arr = byFile.get(cand.uri) || [];
    arr.push({ call: ci, score });
    byFile.set(cand.uri, arr);
  }));
  for (const [uri, arr] of byFile) {
    arr.sort((a, b) => a.score - b.score);
    owner.set(uri, arr.length > 1 && arr[1].score - arr[0].score < AMBIGUITY_MARGIN_MS ? 'contested' : arr[0].call);
  }

  const byCall = new Map<string, CallAssignment>();
  passing.forEach((list, ci) => {
    // Files owned by another call are out; contested files stay in so they can make this call ambiguous
    const mine = list.filter(({ cand }) => {
      const o = owner.get(cand.uri);
      return o === ci || o === 'contested';
    });
    if (mine.length === 0) {
      byCall.set(keys[ci], { file: null, reason: 'no candidate', passing: list.length });
      return;
    }
    const top = mine[0];
    const contested = owner.get(top.cand.uri) === 'contested';
    const tooClose = mine.length > 1 && mine[1].score - top.score < AMBIGUITY_MARGIN_MS;
    if (contested || tooClose) {
      byCall.set(keys[ci], { file: null, reason: 'ambiguous', passing: list.length });
      return;
    }
    byCall.set(keys[ci], { file: top.cand, passing: list.length });
  });
  return { byCall, rejections };
};

/** Picks the recording for a single call, or null (see evaluateCandidate / assignRecordings). */
export const pickBestRecording = (
  candidates: RecordingCandidate[],
  ctx: MatchContext
): RecordingCandidate | null => {
  const key = ctx.key ?? '_';
  return assignRecordings([{ ...ctx, key }], candidates).byCall.get(key)?.file ?? null;
};

export interface FolderEntryLike {
  uri: string;
  /** Decoded file name (no folder) */
  name: string;
  modifiedMs: number | null;
  sizeBytes: number | null;
}

// Broad prefilter around each call; the exact windows are applied by evaluateCandidate
export const PREFILTER_BEFORE_MS = 60_000;
export const PREFILTER_AFTER_MS = 4 * 60_000;

/**
 * Cheap, in-memory step before any per-file metadata read:
 *  - drops consumed files, files whose name has a number none of the calls dialled, and files whose name
 *    timestamp (or, without one, last-modified time) is far outside every call's window;
 *  - orders the rest so the right file is inside the checked set: dialled-number files first, then files
 *    whose name timestamp falls in a window, then the rest newest-first by last-modified (unknown last);
 *  - caps at `max`.
 */
export const selectCandidateEntries = <E extends FolderEntryLike>(
  entries: E[],
  calls: MatchContext[],
  consumed: Set<string> | undefined,
  max: number,
  nowMs: number = Date.now()
): {
  selected: { entry: E; nameTimeMs: number | null }[];
  stats: { total: number; byNumber: number; namedInWindow: number; others: number; eligible: number; drops: Record<string, number> };
} => {
  const targets = new Set(calls.map((c) => last10Digits(c.phone)).filter((t) => t.length === 10));
  const windows = calls.map((c) => ({
    lo: Math.max(c.callStartMs - PREFILTER_BEFORE_MS, (c.prevSessionEndMs || 0) - PREFILTER_BEFORE_MS),
    hi: c.callEndMs + PREFILTER_AFTER_MS,
  }));
  const inAnyWindow = (t: number) => windows.some((w) => t >= w.lo && t <= w.hi);

  const drops: Record<string, number> = {};
  const drop = (why: string) => { drops[why] = (drops[why] || 0) + 1; };
  const byNumber: { entry: E; nameTimeMs: number | null }[] = [];
  const namedInWindow: { entry: E; nameTimeMs: number | null }[] = [];
  const others: { entry: E; nameTimeMs: number | null }[] = [];
  for (const e of entries) {
    if (consumed && recordingKeys(e.uri).concat(e.name).some((k) => consumed.has(k))) { drop('consumed'); continue; }
    const numbers = phoneNumbersInName(e.name);
    if (numbers.length > 0 && !numbers.some((n) => targets.has(n))) { drop('other number'); continue; }
    const nameTimeMs = extractTimestampFromFileName(e.name, nowMs);
    if (nameTimeMs !== null && !inAnyWindow(nameTimeMs)) { drop('outside window (name)'); continue; }
    if (nameTimeMs === null && e.modifiedMs !== null && !inAnyWindow(e.modifiedMs)) { drop('outside window (modified)'); continue; }
    if (numbers.length > 0) byNumber.push({ entry: e, nameTimeMs });
    else if (nameTimeMs !== null) namedInWindow.push({ entry: e, nameTimeMs });
    else others.push({ entry: e, nameTimeMs });
  }
  // Newest first by last-modified BEFORE the cap (unknown times last, in listing order)
  others.sort((a, b) => {
    const ta = a.entry.modifiedMs, tb = b.entry.modifiedMs;
    if (ta === null && tb === null) return 0;
    if (ta === null) return 1;
    if (tb === null) return -1;
    return tb - ta;
  });
  const ordered = [...byNumber, ...namedInWindow, ...others];
  return {
    selected: ordered.slice(0, max),
    stats: {
      total: entries.length, byNumber: byNumber.length, namedInWindow: namedInWindow.length,
      others: others.length, eligible: ordered.length, drops,
    },
  };
};

/**
 * Sets nextCallStartMs and otherCallStartsMs on calls sorted oldest first. All calls are on this phone,
 * so the next call of any number caps the window of the previous one.
 */
export const linkNeighbouringCalls = <T extends MatchContext>(calls: T[]): T[] => {
  const sorted = [...calls].sort((a, b) => a.callStartMs - b.callStartMs);
  return sorted.map((c, i) => {
    const next = sorted.slice(i + 1).find((n) => n.callStartMs > c.callStartMs);
    const capped = next ? Math.min(next.callStartMs, c.nextCallStartMs ?? Infinity) : c.nextCallStartMs;
    return {
      ...c,
      nextCallStartMs: Number.isFinite(capped as number) ? capped : undefined,
      otherCallStartsMs: [...(c.otherCallStartsMs || []), ...sorted.filter((_, j) => j !== i).map((o) => o.callStartMs)],
    };
  });
};
