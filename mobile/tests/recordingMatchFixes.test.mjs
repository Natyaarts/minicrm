// Run: node --test tests/   (Node 23.6+ strips TypeScript types natively)
// FIX 1 (contact-named files, timestamp parser, number regex, ordering before the cap) and
// FIX 4 (shared scoring: name time vs start, modified vs end, duration, next-call cap, reservations,
// joint assignment, ambiguity).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractTimestampFromFileName, phoneNumbersInName, selectCandidateEntries, evaluateCandidate,
  assignRecordings, pickBestRecording, linkNeighbouringCalls,
} from '../src/utils/recordingMatch.ts';

// Name timestamps are device-local time, so build expectations with the local Date constructor
const local = (h, m, s, d = 24) => new Date(2026, 10, d, h, m, s).getTime();
const NOW = local(12, 10, 0);
const T = local(12, 3, 1);

test('timestamp parser: Samsung, MIUI compact, Oppo/Vivo, dashed, epoch', () => {
  assert.equal(extractTimestampFromFileName('Call recording Rahul Sharma_261124_120301.m4a', NOW), T);
  assert.equal(extractTimestampFromFileName('Rahul Sharma_20261124120301.mp3', NOW), T);
  assert.equal(extractTimestampFromFileName('Rahul Sharma_20261124_120301.m4a', NOW), T);
  assert.equal(extractTimestampFromFileName('Rec_2026-11-24_12-03-01.m4a', NOW), T);
  assert.equal(extractTimestampFromFileName('Rahul Sharma 2026-11-24 12-03-01.m4a', NOW), T);
  assert.equal(extractTimestampFromFileName('Rahul(9876543210)_20261124120301.mp3', NOW), T);
  assert.equal(extractTimestampFromFileName('Call recording 9876543210_261124_120301.m4a', NOW), T);
  assert.equal(extractTimestampFromFileName(`rec_${T}.m4a`, NOW), T);
});

test('timestamp parser: phone numbers and invalid ranges are not dates', () => {
  for (const name of [
    '9876543210.m4a', 'Call_+919876543210.amr', '09876543210 call.mp3', '98765_43210.m4a',
    '987654_321098.m4a',            // yy=98 -> 2098, outside ±1 year
    '261399_120301.m4a',            // month 13
    '261124_250301.m4a',            // hour 25
    '20261131120301.mp3',           // 31 Nov
    '20201124_120301.m4a',          // 2020, outside ±1 year
    'Rahul Sharma.m4a', '',
  ]) {
    assert.equal(extractTimestampFromFileName(name, NOW), null, name);
  }
});

test('number regex: digits inside a timestamp are never a phone number', () => {
  assert.deepEqual(phoneNumbersInName('Rahul Sharma_20261124120301.mp3'), []);       // was the fake 6112412030
  assert.deepEqual(phoneNumbersInName('Rahul(9876543210)_20261124120301.mp3'), ['9876543210']);
  assert.deepEqual(phoneNumbersInName('+919876543210_20261124120301.mp3'), ['9876543210']);
  assert.deepEqual(phoneNumbersInName(`rec_1796612345678.m4a`), []);                 // epoch ms
  assert.deepEqual(phoneNumbersInName('9876543210_9123456789.m4a'), ['9876543210', '9123456789']);
});

// ── Candidate selection ────────────────────────────────────────────────────────
const S = local(12, 3, 0);
const E = local(12, 5, 0);
const call = (over = {}) => ({ phone: '+919876543210', callStartMs: S, callEndMs: E, connectedSeconds: 115, ...over });
const entry = (name, modifiedMs = null, sizeBytes = 500_000) =>
  ({ uri: `content://x/tree/primary%3ACall/document/primary%3ACall%2F${encodeURIComponent(name)}`, name, modifiedMs, sizeBytes });
const toCandidates = (selected) => selected.map(({ entry: e, nameTimeMs }) =>
  ({ uri: e.uri, name: e.name, nameTimeMs, modifiedMs: e.modifiedMs, sizeBytes: e.sizeBytes, timeMs: nameTimeMs ?? e.modifiedMs }));

test('a contact-named file beyond position 60 in an unsorted listing is still checked and picked', () => {
  const entries = [];
  // 100 older files still inside the broad prefilter, 50 with unknown modified time
  for (let i = 0; i < 100; i++) entries.push(entry(`Old Contact ${i}.m4a`, S - 55_000 + (i % 7) * 1000));
  for (let i = 0; i < 50; i++) entries.push(entry(`Unknown time ${i}.m4a`, null));
  const right = entry('Rahul Sharma.m4a', E + 1_000);                  // no number, no timestamp in name
  entries.splice(150, 0, right);
  entries.push(entry('Someone_20261123_120000.m4a', null));            // name time a day off: dropped cheaply
  entries.push(entry('Call 9123456789.m4a', E));                        // different number: dropped

  const { selected, stats } = selectCandidateEntries(entries, [call()], new Set(), 60, NOW);
  assert.equal(selected.length, 60);
  assert.equal(selected[0].entry.name, right.name);                    // newest first before the cap
  assert.equal(stats.drops['outside window (name)'], 1);
  assert.equal(stats.drops['other number'], 1);
  assert.equal(pickBestRecording(toCandidates(selected), call())?.name, right.name);
});

test('selection order: dialled-number files, then name-in-window, then newest by modified', () => {
  const entries = [
    entry('zzz.m4a', E),
    entry('Asha_20261124_120305.m4a', null),
    entry('Call 9876543210.m4a', null),
  ];
  const names = selectCandidateEntries(entries, [call()], new Set(), 10, NOW).selected.map((s) => s.entry.name);
  assert.deepEqual(names, ['Call 9876543210.m4a', 'Asha_20261124_120305.m4a', 'zzz.m4a']);
});

test('a file that ends before the previous session ended is rejected', () => {
  const c = { uri: 'u1', name: 'Rahul.m4a', nameTimeMs: null, modifiedMs: S - 1_000, timeMs: S - 1_000, sizeBytes: 500_000 };
  const ev = evaluateCandidate(c, call({ prevSessionEndMs: S - 500 }));
  assert.equal(ev.ok, false);
  assert.equal(ev.reason, 'before previous session');
});

// ── FIX 4: back-to-back calls ─────────────────────────────────────────────────
const A = { key: 'A', phone: '9876543210', callStartMs: local(12, 3, 0), callEndMs: local(12, 5, 0), connectedSeconds: 115 };
const B = { key: 'B', phone: '9123456789', callStartMs: local(12, 5, 30), callEndMs: local(12, 7, 0), connectedSeconds: 85 };
const cand = (uri, name, { nameTimeMs = null, modifiedMs = null, durationSec = null } = {}) =>
  ({ uri, name, nameTimeMs, modifiedMs, durationSec, sizeBytes: 900_000, timeMs: nameTimeMs ?? modifiedMs });

test('back-to-back calls: each gets its own contact-named file (name time vs start, mtime vs end)', () => {
  const fA = cand('fA', 'Call recording Asha K_261124_120305.m4a', { nameTimeMs: local(12, 3, 5), modifiedMs: local(12, 5, 1) });
  const fB = cand('fB', 'Call recording Ravi M_261124_120535.m4a', { nameTimeMs: local(12, 5, 35), modifiedMs: local(12, 7, 1) });
  const res = assignRecordings(linkNeighbouringCalls([B, A]), [fB, fA]);
  assert.equal(res.byCall.get('A').file?.uri, 'fA');
  assert.equal(res.byCall.get('B').file?.uri, 'fB');
});

test('back-to-back calls: modified time alone separates them', () => {
  const fA = cand('fA', 'Asha K.m4a', { modifiedMs: local(12, 5, 1) });
  const fB = cand('fB', 'Ravi M.m4a', { modifiedMs: local(12, 7, 1) });
  const res = assignRecordings(linkNeighbouringCalls([A, B]), [fA, fB]);
  assert.equal(res.byCall.get('A').file?.uri, 'fA');
  assert.equal(res.byCall.get('B').file?.uri, 'fB');
});

test('window is capped at the next call start', () => {
  // Without the cap, a file modified at 12:05:40 would still be inside A's [end-10s, end+60s]
  const late = cand('late', 'X.m4a', { modifiedMs: local(12, 5, 40) });
  const [a] = linkNeighbouringCalls([A, B]);
  const ev = evaluateCandidate(late, a);
  assert.equal(ev.ok, false);
  assert.equal(ev.reason, 'after next call');
});

test('a name time closer to another call start belongs to that call', () => {
  // A: 12:03:00-12:04:00, 50s connected (connect ~12:03:10). Name 12:03:19 is inside A's name window
  // (9s after A's connect) but 1s from another known call's start
  const shortA = { ...A, callEndMs: local(12, 4, 0), connectedSeconds: 50 };
  const f = cand('f', 'Y_261124_120319.m4a', { nameTimeMs: local(12, 3, 19) });
  assert.equal(evaluateCandidate(f, shortA).ok, true);
  const ev = evaluateCandidate(f, { ...shortA, otherCallStartsMs: [local(12, 3, 20)] });
  assert.equal(ev.ok, false);
  assert.equal(ev.reason, 'other call');
});

test('ringing is capped: a name time minutes after the start is outside the window', () => {
  const longA = { ...A, callEndMs: local(12, 7, 0), connectedSeconds: 60 };   // would imply a 3 min ring
  const f = cand('f', 'Y_261124_120529.m4a', { nameTimeMs: local(12, 5, 29) });
  assert.equal(evaluateCandidate(f, longA).reason, 'outside window');
});

test('duration decides between two files in the same window; without it the call is ambiguous', () => {
  const real = cand('real', 'Asha K.m4a', { modifiedMs: local(12, 5, 2), durationSec: 114 });
  const memo = cand('memo', 'Voice memo.m4a', { modifiedMs: local(12, 5, 3), durationSec: 20 });
  assert.equal(pickBestRecording([real, memo], A)?.uri, 'real');
  const ev = evaluateCandidate(memo, A);
  assert.equal(ev.ok, false);
  assert.equal(ev.reason, 'duration mismatch');

  const r2 = { ...real, durationSec: null };
  const m2 = { ...memo, durationSec: null };
  const res = assignRecordings([A], [r2, m2]);
  assert.equal(res.byCall.get('A').file, null);
  assert.equal(res.byCall.get('A').reason, 'ambiguous');
});

test('duration tolerance: max(3s, 10%), file may be up to 2s shorter on top', () => {
  const ok = (d) => evaluateCandidate(cand('d', 'D.m4a', { modifiedMs: A.callEndMs, durationSec: d }), A).ok;
  // connected 115 -> tolerance 11.5s; accepted range [115 - 11.5 - 2, 115 + 11.5]
  assert.equal(ok(102), true);
  assert.equal(ok(101), false);
  assert.equal(ok(126), true);
  assert.equal(ok(127), false);
  const short = { ...A, connectedSeconds: 10 };   // tolerance 3s -> [5, 13]
  assert.equal(evaluateCandidate(cand('d', 'D.m4a', { modifiedMs: A.callEndMs, durationSec: 5 }), short).ok, true);
  assert.equal(evaluateCandidate(cand('d', 'D.m4a', { modifiedMs: A.callEndMs, durationSec: 4 }), short).ok, false);
});

test('a file reserved for another call is skipped', () => {
  const fA = cand('fA', 'Asha K.m4a', { modifiedMs: local(12, 5, 1) });
  assert.equal(pickBestRecording([fA], { ...A, reserved: new Set(['fA']) }), null);
  assert.equal(evaluateCandidate(fA, { ...A, reserved: new Set(['Asha K.m4a']) }).reason, 'reserved');
  const other = cand('fA2', 'Asha K (2).m4a', { modifiedMs: local(12, 5, 4) });
  assert.equal(pickBestRecording([fA, other], { ...A, reserved: new Set(['fA']) })?.uri, 'fA2');
});

test('one file that fits two calls equally well is given to neither', () => {
  const A2 = { ...A, key: 'A2', phone: '9000000001' };            // same window, e.g. a duplicate pending item
  const f = cand('f', 'Asha K.m4a', { modifiedMs: local(12, 5, 1) });
  const res = assignRecordings([A, A2], [f]);
  assert.equal(res.byCall.get('A').file, null);
  assert.equal(res.byCall.get('A2').file, null);
  assert.equal(res.byCall.get('A').reason, 'ambiguous');
});

test('a file with the dialled number beats a contact-named file; never shared between calls', () => {
  const named = cand('n', 'Call 9876543210.m4a', { modifiedMs: local(12, 5, 30) });
  const contact = cand('c', 'Asha K.m4a', { modifiedMs: local(12, 5, 1) });
  const res = assignRecordings([A], [contact, named]);
  assert.equal(res.byCall.get('A').file?.uri, 'n');
});

test('requireNumberMatch: contact-named files are not used when the call times are unknown', () => {
  const contact = cand('c', 'Asha K.m4a', { modifiedMs: local(12, 5, 1) });
  assert.equal(evaluateCandidate(contact, { ...A, requireNumberMatch: true }).reason, 'no number');
});
