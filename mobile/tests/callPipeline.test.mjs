// Run: node --test "tests/*.test.mjs"   (Node 23.6+ strips TypeScript types natively)
// CallManager / SyncManager with React Native, Expo, storage and the API mocked (tests/support).
// The native CallRecordingModule is replaced by a model of its contract:
//   findCallLogEntry = pure read (DATE >= max(start - 10s, floor), newest, not consumed)
//   markCallLogRowConsumed = the only thing that consumes a row
// FIX 3: the JS side never consumes during lookups, passes a fixed floor, polls safely, and treats a
//        permission-denied CallLog as "unknown" without waiting.
// FIX 1/4: the live folder matcher finds a contact-named file past position 60 (native listing with
//          last-modified), and respects reservations.
// FIX 2/4: pending Sales recordings for two back-to-back calls each get their own file, consumed only
//          after upload; an ambiguous case uploads nothing; an interaction that already has audio is dropped.
import { register } from 'node:module';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

register('./support/rn-loader.mjs', import.meta.url);

// FormData that keeps the appended file object, so tests can see which file went to which interaction
globalThis.FormData = class {
  constructor() { this.parts = []; }
  append(k, v) { this.parts.push([k, v]); }
  get(k) { return this.parts.find(([n]) => n === k)?.[1]; }
};

const native = (globalThis.__nativeCallModule ??= {});
const CM = await import('../src/utils/CallManager.ts');
const SM = await import('../src/utils/SyncManager.ts');

const FOLDER = 'content://com.android.externalstorage.documents/tree/primary%3ARecordings%2FCall';
const fileUri = (name) => `${FOLDER}/document/primary%3ARecordings%2FCall%2F${encodeURIComponent(name)}`;
const pad = (n) => String(n).padStart(2, '0');
// Samsung style yyMMdd_HHmmss in device local time
const samsungStamp = (ms) => {
  const d = new Date(ms);
  return `${pad(d.getFullYear() % 100)}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
};
const silence = () => { const l = console.log; const w = console.warn; console.log = () => {}; console.warn = () => {}; return () => { console.log = l; console.warn = w; }; };

beforeEach(() => {
  globalThis.__storage.clear();
  globalThis.__clientCalls.length = 0;
  globalThis.__client = {};
  for (const k of Object.keys(native)) delete native[k];
});

const installCallLogModel = ({ permission = true } = {}) => {
  const rows = [];
  const consumed = new Set();
  const calls = { find: [], consume: [] };
  native.findCallLogEntry = async (phone, startMs, floorMs, dir) => {
    calls.find.push({ phone, startMs, floorMs, dir });
    if (!permission) return { status: 'no_permission' };
    const min = Math.max(startMs - 10_000, floorMs || 0);
    const match = rows
      .filter((r) => r.date >= min && r.dir === dir && r.phone.endsWith(String(phone).slice(-10)) && !consumed.has(r.id))
      .sort((a, b) => b.date - a.date)[0];
    return match
      ? { status: 'found', rowId: match.id, durationSec: match.dur, dateMs: match.date, type: 2, rowsScanned: rows.length, rowsConsidered: 1, consumedSkipped: 0 }
      : { status: 'none', rowsScanned: rows.length, rowsConsidered: 0, consumedSkipped: 0 };
  };
  native.markCallLogRowConsumed = async (id, end) => { calls.consume.push({ id, end }); consumed.add(id); return true; };
  return { rows, consumed, calls };
};

// ── FIX 3 ─────────────────────────────────────────────────────────────────────

test('FIX 3: a mid-call empty lookup does not stop the later lookup from finding the row', async () => {
  const restore = silence();
  try {
    const m = installCallLogModel();
    const start = Date.now() - 60_000;
    const floor = start - 5_000;
    // User switches back to the CRM mid-call: no row yet, and nothing is consumed or moved
    assert.equal((await CM.lookupCallLogEntry('9876543210', start, floor, 'OUTGOING')).kind, 'none');
    assert.equal(m.calls.consume.length, 0);

    // Hang-up: the phone writes the row (DATE = call start)
    m.rows.push({ id: 7, phone: '+919876543210', date: start + 1_500, dur: 45, dir: 'OUTGOING' });
    const found = await CM.waitForCallLogEntry('9876543210', start, floor, 'OUTGOING', { intervalMs: 5, timeoutMs: 200 });
    assert.equal(found.kind, 'found');
    assert.equal(found.entry.rowId, 7);
    assert.equal(found.entry.durationSec, 45);
    assert.equal(m.calls.consume.length, 0, 'lookups never consume');
    assert.ok(m.calls.find.every((c) => c.floorMs === floor && c.startMs === start), 'floor is fixed by JS, not moved');

    // "Tap to end" hands this entry to finalizeCallSession, which consumes it exactly once
    await CM.markCallLogRowConsumed(found.entry.rowId, Date.now());
    assert.deepEqual(m.calls.consume.map((c) => c.id), [7]);
    // ...after which no later call can claim the row
    assert.equal((await CM.lookupCallLogEntry('9876543210', start, floor, 'OUTGOING')).kind, 'none');
  } finally { restore(); }
});

test('FIX 3: a row written late is found by polling (repeated reads are safe)', async () => {
  const restore = silence();
  try {
    const m = installCallLogModel();
    const start = Date.now() - 30_000;
    const inner = native.findCallLogEntry;
    native.findCallLogEntry = async (...args) => {
      if (m.calls.find.length === 2) m.rows.push({ id: 9, phone: '9876543210', date: start, dur: 12, dir: 'OUTGOING' });
      return inner(...args);
    };
    const r = await CM.waitForCallLogEntry('9876543210', start, 0, 'OUTGOING', { intervalMs: 5, timeoutMs: 500 });
    assert.equal(r.kind, 'found');
    assert.equal(m.calls.find.length, 3);
  } finally { restore(); }
});

test('FIX 3: CallLog permission denied -> "unreadable" at once (no 10s wait), legacy helper returns null', async () => {
  const restore = silence();
  try {
    const m = installCallLogModel({ permission: false });
    const t0 = Date.now();
    const r = await CM.waitForCallLogEntry('9876543210', Date.now(), 0, 'OUTGOING', { timeoutMs: 10_000 });
    assert.equal(r.kind, 'unreadable');
    assert.equal(r.reason, 'no_permission');
    assert.equal(m.calls.find.length, 1);
    assert.ok(Date.now() - t0 < 1_000);
    assert.equal(await CM.getLatestCallLogDuration('9876543210', Date.now(), 'OUTGOING'), null);
  } finally { restore(); }
});

test('FIX 3: polling stops when a newer call session starts', async () => {
  const restore = silence();
  try {
    const m = installCallLogModel();
    const r = await CM.waitForCallLogEntry('9876543210', Date.now(), 0, 'OUTGOING', { intervalMs: 5, timeoutMs: 5_000, shouldAbort: () => true });
    assert.equal(r.kind, 'none');
    assert.equal(m.calls.find.length, 1);
  } finally { restore(); }
});

// ── FIX 1 / 4: live matcher ───────────────────────────────────────────────────

test('FIX 1: live matcher finds a contact-named Samsung file at position 150 of an unsorted listing', async () => {
  const restore = silence();
  try {
    await globalThis.__storage.set('@mapped_recording_folder_uri', FOLDER);
    const end = Date.now() - 5_000;
    const start = end - 120_000;
    const listing = [];
    for (let i = 0; i < 150; i++) {
      listing.push({ uri: fileUri(`Call recording Contact ${i}.m4a`), name: `Call recording Contact ${i}.m4a`, lastModified: start - 50_000 + i, size: 900_000 });
    }
    const rightName = `Call recording Rahul Sharma_${samsungStamp(start + 4_000)}.m4a`;
    listing.splice(150, 0, { uri: fileUri(rightName), name: rightName, lastModified: end + 1_000, size: 900_000 });
    for (let i = 0; i < 49; i++) listing.push({ uri: fileUri(`Old ${i}.m4a`), name: `Old ${i}.m4a`, lastModified: -1, size: -1 });
    native.listRecordingFolder = async () => listing;
    native.getAudioDurationMs = async (uri) => (decodeURIComponent(uri).includes('Rahul') ? 114_000 : 30_000);

    const found = await CM.findRecentRecordingInMappedFolder('+919876543210', start, end, new Set(), start - 60_000, 115);
    assert.equal(found, fileUri(rightName));

    // Reserved for another call: not picked
    const reserved = new Set([fileUri(rightName)]);
    assert.equal(await CM.findRecentRecordingInMappedFolder('+919876543210', start, end, new Set(), start - 60_000, 115, { reserved }), null);
  } finally { restore(); }
});

// ── FIX 2 / 4: pending Sales recordings ───────────────────────────────────────

const setupBackToBack = async () => {
  await globalThis.__storage.set('@mapped_recording_folder_uri', FOLDER);
  const now = Date.now();
  const A = { s: now - 600_000, e: now - 480_000 };        // 2 min call
  const B = { s: now - 450_000, e: now - 360_000 };        // 30s later, 1.5 min call
  await SM.queuePendingSalesRecording({ interactionId: 101, mobileCallId: 'mA', phone: '9876543210', callStartMs: A.s, callEndMs: A.e, prevSessionEndMs: A.s - 60_000, connectedSeconds: 115 });
  await SM.queuePendingSalesRecording({ interactionId: 102, mobileCallId: 'mB', phone: '9123456789', callStartMs: B.s, callEndMs: B.e, prevSessionEndMs: A.e + 5_000, connectedSeconds: 85 });
  const nameA = `Call recording Asha K_${samsungStamp(A.s + 5_000)}.m4a`;
  const nameB = `Call recording Ravi M_${samsungStamp(B.s + 5_000)}.m4a`;
  return { A, B, nameA, nameB };
};

test('FIX 2/4: two back-to-back Sales calls each get their own contact-named recording', async () => {
  const restore = silence();
  try {
    const { A, B, nameA, nameB } = await setupBackToBack();
    native.listRecordingFolder = async () => [
      { uri: fileUri(nameB), name: nameB, lastModified: B.e + 1_000, size: 900_000 },
      { uri: fileUri(nameA), name: nameA, lastModified: A.e + 1_000, size: 900_000 },
    ];
    native.getAudioDurationMs = async (uri) => (decodeURIComponent(uri).includes('Asha') ? 114_000 : 84_000);
    globalThis.__client.get = async (url) => ({ data: { id: url, audio_recording: null } });
    const uploads = {};
    globalThis.__client.patch = async (url, form) => { uploads[url] = form.get('audio_recording').uri; return { data: {} }; };

    await SM.syncPendingCallRecordings();

    assert.equal(uploads['/crm/interactions/101/'], fileUri(nameA));
    assert.equal(uploads['/crm/interactions/102/'], fileUri(nameB));
    const consumed = await SM.getConsumedRecordings();
    assert.ok(consumed.has(fileUri(nameA)) && consumed.has(fileUri(nameB)), 'consumed after upload');
    assert.deepEqual(await SM.getPendingSalesRecordings(), []);
    assert.deepEqual(await SM.getReservations(), []);
  } finally { restore(); }
});

test('FIX 4: an ambiguous match uploads nothing and keeps the item pending', async () => {
  const restore = silence();
  try {
    const { A } = await setupBackToBack();
    // Two contact-named files with the same times and unknown durations, both fitting call A only
    native.listRecordingFolder = async () => [
      { uri: fileUri('Asha K.m4a'), name: 'Asha K.m4a', lastModified: A.e + 1_000, size: 900_000 },
      { uri: fileUri('Asha K (1).m4a'), name: 'Asha K (1).m4a', lastModified: A.e + 2_000, size: 900_000 },
    ];
    native.getAudioDurationMs = async () => null;
    globalThis.__client.get = async () => ({ data: { audio_recording: null } });
    let patched = 0;
    globalThis.__client.patch = async () => { patched++; return { data: {} }; };

    await SM.syncPendingCallRecordings();

    assert.equal(patched, 0);
    const pending = (await SM.getPendingSalesRecordings()).map((p) => p.mobileCallId).sort();
    assert.deepEqual(pending, ['mA', 'mB']);
    assert.equal((await SM.getConsumedRecordings()).size, 0);
  } finally { restore(); }
});

test('FIX 2: a pending item is dropped when the interaction already got a recording', async () => {
  const restore = silence();
  try {
    const { A, nameA } = await setupBackToBack();
    native.listRecordingFolder = async () => [{ uri: fileUri(nameA), name: nameA, lastModified: A.e + 1_000, size: 900_000 }];
    native.getAudioDurationMs = async () => 114_000;
    globalThis.__client.get = async () => ({ data: { audio_recording: 'https://x/rec.m4a' } });
    let patched = 0;
    globalThis.__client.patch = async () => { patched++; return { data: {} }; };

    await SM.syncPendingCallRecordings();

    assert.equal(patched, 0);
    assert.deepEqual((await SM.getPendingSalesRecordings()).map((p) => p.mobileCallId), ['mB']);
    assert.equal((await SM.getConsumedRecordings()).size, 0);
  } finally { restore(); }
});

test('FIX 2: reservations are per call and released on demand', async () => {
  await SM.reserveRecording('content://x/a.m4a', 'call1');
  await SM.reserveRecording('content://x/b.m4a', 'call1');           // one reservation per call
  await SM.reserveRecording('content://x/a.m4a', 'call2');
  const list = await SM.getReservations();
  assert.deepEqual(list.map((r) => [r.key, r.mobileCallId]).sort(), [['content://x/a.m4a', 'call2'], ['content://x/b.m4a', 'call1']]);
  assert.ok((await SM.getReservedRecordings('call2')).has('b.m4a'));
  assert.ok(!(await SM.getReservedRecordings('call2')).has('content://x/a.m4a'));
  await SM.releaseRecordingReservation({ mobileCallId: 'call1' });
  assert.deepEqual((await SM.getReservations()).map((r) => r.mobileCallId), ['call2']);
});
