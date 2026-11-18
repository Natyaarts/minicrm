// Run: node --test tests/   (Node 23.6+ strips TypeScript types natively)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickBestRecording, phoneNumbersInName, last10Digits } from '../src/utils/recordingMatch.ts';

const START = Date.UTC(2026, 10, 18, 8, 30, 0);
const END = START + 22_000;
const ctx = (over = {}) => ({ phone: '+919876543210', callStartMs: START, callEndMs: END, connectedSeconds: 22, ...over });
const rec = (name, timeMs, sizeBytes = 200_000) => ({ uri: `content://x/document/primary%3ACall%2F${encodeURIComponent(name)}`, name, timeMs, sizeBytes });

test('number helpers handle +91 / 91 / 0 prefixes', () => {
  assert.equal(last10Digits('+91 98765 43210'), '9876543210');
  assert.equal(last10Digits('09876543210'), '9876543210');
  assert.deepEqual(phoneNumbersInName('Call_+919876543210_20261118.m4a'), ['9876543210']);
  assert.deepEqual(phoneNumbersInName('09876543210 (2026-11-18).mp3'), ['9876543210']);
  assert.deepEqual(phoneNumbersInName('919876543210.amr'), ['9876543210']);
  assert.deepEqual(phoneNumbersInName('Rec_2026-11-18_14-00-00.m4a'), []);
});

test('time window is [callStart - 10s, callEnd + 60s]', () => {
  assert.equal(pickBestRecording([rec('a.m4a', START - 10_000)], ctx())?.name, 'a.m4a');
  assert.equal(pickBestRecording([rec('a.m4a', END + 60_000)], ctx())?.name, 'a.m4a');
  assert.equal(pickBestRecording([rec('a.m4a', START - 10_001)], ctx()), null);
  assert.equal(pickBestRecording([rec('a.m4a', END + 60_001)], ctx()), null);
  assert.equal(pickBestRecording([rec('a.m4a', null)], ctx()), null);
});

test('dialled number is preferred; a different number is rejected', () => {
  const generic = rec('Rec_2026-11-18.m4a', END);              // no number, same time
  const match = rec('Call recording 09876543210.m4a', END + 30_000);
  const other = rec('Call recording +919123456789.m4a', END);
  assert.equal(pickBestRecording([generic, match, other], ctx())?.name, match.name);
  assert.equal(pickBestRecording([other], ctx()), null);
  assert.equal(pickBestRecording([generic], ctx())?.name, generic.name); // timestamp-only names still match
});

test('consumed recordings are never picked (by uri or by name)', () => {
  const a = rec('Call 9876543210 a.m4a', END);
  const b = rec('Call 9876543210 b.m4a', END + 20_000);
  assert.equal(pickBestRecording([a, b], ctx({ consumed: new Set([a.uri]) }))?.name, b.name);
  assert.equal(pickBestRecording([a, b], ctx({ consumed: new Set([a.name, b.name]) })), null);
});

test('files from before the previous session ended are excluded', () => {
  const prevCall = rec('Call 9876543210 prev.m4a', START - 5_000);
  const thisCall = rec('Call 9876543210 now.m4a', END + 5_000);
  assert.equal(pickBestRecording([prevCall], ctx({ prevSessionEndMs: START - 2_000 })), null);
  assert.equal(pickBestRecording([prevCall, thisCall], ctx({ prevSessionEndMs: START - 2_000 }))?.name, thisCall.name);
});

test('closest in time wins among equal number matches', () => {
  const during = rec('Call 9876543210 1.m4a', START + 5_000);
  const after = rec('Call 9876543210 2.m4a', END + 40_000);
  const before = rec('Call 9876543210 3.m4a', START - 8_000);
  assert.equal(pickBestRecording([after, before, during], ctx())?.name, during.name);
  assert.equal(pickBestRecording([after, before], ctx())?.name, before.name);
});

test('near-empty files are rejected (size sanity)', () => {
  const tiny = rec('Call 9876543210.m4a', END, 1_500);
  const amr = rec('Call 9876543210.amr', END, 22 * 1_525); // AMR-NB 12.2 kbps for 22 s
  assert.equal(pickBestRecording([tiny], ctx()), null);
  assert.equal(pickBestRecording([amr], ctx())?.name, amr.name);
  assert.equal(pickBestRecording([tiny], ctx({ connectedSeconds: 0 }))?.name, tiny.name); // unknown duration: no check
  assert.equal(pickBestRecording([rec('Call 9876543210.m4a', END, null)], ctx())?.name, 'Call 9876543210.m4a'); // unknown size
});
