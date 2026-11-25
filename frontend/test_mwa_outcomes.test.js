// Unit tests for mentor WhatsApp logging helpers. Run: node --test test_mwa_outcomes.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    WA_OUTCOMES, buildWhatsAppPayload, toWaDigits, parseMmSs, whatsAppEntryLabel, isLatestWhatsAppConnected,
} from './src/components/mentor/mwaOutcomes.js';

test('payload mapping matches the agreed table', () => {
    assert.deepEqual(buildWhatsAppPayload('SENT', { notes: ' hi ' }), { feedback_type: 'WHATSAPP', status: 'MESSAGE_SENT', feedback: 'hi' });
    assert.deepEqual(buildWhatsAppPayload('CONNECTED'), { feedback_type: 'WHATSAPP', status: 'CALL_DONE', feedback: '' });
    assert.equal(buildWhatsAppPayload('NO_REPLY').status, 'NO_ANSWER');
    assert.equal(buildWhatsAppPayload('NOT_ON_WHATSAPP').status, 'NOT_REACHABLE');
    assert.deepEqual(buildWhatsAppPayload('CALL_CONNECTED', { durationSec: 205, followupYMD: '2026-12-01' }), {
        feedback_type: 'WHATSAPP', status: 'CALL_DONE', feedback: '', call_direction: 'OUTGOING', call_duration: 205,
        next_followup_date: '2026-12-01',
    });
    assert.equal(buildWhatsAppPayload('CALL_NOT_CONNECTED', { durationSec: 99 }).call_duration, 0);
});

test('never sends mobile_call_id or call_status (they would force feedback_type=CALL)', () => {
    for (const o of WA_OUTCOMES) {
        const p = buildWhatsAppPayload(o.key, { durationSec: 5 });
        assert.ok(!('mobile_call_id' in p) && !('call_status' in p), o.key);
        assert.equal('call_direction' in p, o.isCall, o.key);
    }
});

test('toWaDigits', () => {
    assert.equal(toWaDigits('+919876543210'), '919876543210');
    assert.equal(toWaDigits('9876543210'), '919876543210');
    assert.equal(toWaDigits('+1 (415) 555-0100'), '14155550100');
    assert.equal(toWaDigits('+971501234567'), '971501234567');
    assert.equal(toWaDigits('12345'), null);
    assert.equal(toWaDigits(''), null);
    assert.equal(toWaDigits(null), null);
});

test('parseMmSs', () => {
    assert.equal(parseMmSs('3:25'), 205);
    assert.equal(parseMmSs('45'), 45);
    assert.equal(parseMmSs('1:02:03'), 3723);
    assert.equal(parseMmSs('3:75'), null);
    assert.equal(parseMmSs('abc'), null);
});

test('reverse labels', () => {
    assert.equal(whatsAppEntryLabel({ feedback_type: 'CALL', status: 'CALL_DONE' }), null);
    assert.equal(whatsAppEntryLabel({ feedback_type: 'WHATSAPP', status: 'CALL_DONE' }).label, 'WhatsApp connected');
    assert.equal(whatsAppEntryLabel({ feedback_type: 'WHATSAPP', status: 'NO_ANSWER' }).label, 'No reply');
    assert.equal(whatsAppEntryLabel({ feedback_type: 'WHATSAPP', status: 'NOT_REACHABLE' }).label, 'Not on WhatsApp');
    assert.equal(whatsAppEntryLabel({ feedback_type: 'WHATSAPP', status: 'MESSAGE_SENT' }).label, 'Message sent');
    const call = whatsAppEntryLabel({ feedback_type: 'WHATSAPP', status: 'CALL_DONE', call_direction: 'OUTGOING' });
    assert.deepEqual(call, { label: 'WhatsApp call', isCall: true });
});

test('latest WhatsApp connected', () => {
    assert.equal(isLatestWhatsAppConnected([{ feedback_type: 'CALL' }, { feedback_type: 'WHATSAPP', status: 'CALL_DONE' }]), true);
    assert.equal(isLatestWhatsAppConnected([{ feedback_type: 'WHATSAPP', status: 'NO_ANSWER' }, { feedback_type: 'WHATSAPP', status: 'CALL_DONE' }]), false);
});
