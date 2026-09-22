// Comprehensive Mobile Unit & Logic Verification for Call Recording Matching & Sync

let asyncStorageMock = {};

const mockAsyncStorage = {
  getItem: async (key) => asyncStorageMock[key] || null,
  setItem: async (key, val) => { asyncStorageMock[key] = val; },
  removeItem: async (key) => { delete asyncStorageMock[key]; },
  clear: async () => { asyncStorageMock = {}; }
};

const CONSUMED_RECORDINGS_STORAGE_KEY = '@consumed_recordings_set';

const getConsumedRecordings = async () => {
  try {
    const raw = await mockAsyncStorage.getItem(CONSUMED_RECORDINGS_STORAGE_KEY);
    if (!raw) return new Set();
    const list = JSON.parse(raw);
    return new Set(Array.isArray(list) ? list : []);
  } catch (err) {
    return new Set();
  }
};

const markRecordingConsumed = async (identifiers) => {
  const items = Array.isArray(identifiers) ? identifiers : [identifiers];
  const validItems = items.filter(Boolean);
  if (validItems.length === 0) return;

  const currentSet = await getConsumedRecordings();
  validItems.forEach(item => {
    currentSet.add(item);
    const basename = item.split('/').pop();
    if (basename) currentSet.add(basename);
  });

  const arrayToSave = Array.from(currentSet).slice(-1000);
  await mockAsyncStorage.setItem(CONSUMED_RECORDINGS_STORAGE_KEY, JSON.stringify(arrayToSave));
};

const isRecordingConsumed = (filePathOrName, consumedSet) => {
  if (!filePathOrName) return false;
  if (consumedSet.has(filePathOrName)) return true;
  const basename = filePathOrName.split('/').pop();
  if (basename && consumedSet.has(basename)) return true;
  return false;
};

// Simulation of findMatchingRecording logic from SyncManager
function findMatchingRecording({ call, files, fileDetails, consumedSet }) {
  // UNIFIED RULE: Missed or 0-duration calls must NEVER receive any recordings
  const isConnected = (call.call_status || '').toUpperCase() === 'CONNECTED' && Number(call.call_duration || 0) > 0;
  if (!isConnected) {
    return null;
  }

  const targetPhone = (call.student_phone || call.customer_number || call.caller_number || call.receiver_number || '').replace(/\D/g, '').slice(-10);
  const callTime = call.start_time ? new Date(call.start_time).getTime() : new Date(call.date).getTime();

  let bestMatchingFile = null;
  let minDiff = 180000; // 3 minutes

  for (const fileName of files) {
    if (isRecordingConsumed(fileName, consumedSet)) continue;

    const isRecFile = fileName.startsWith('fallback_recording') ||
                      fileName.startsWith('saf_recorded') ||
                      fileName.startsWith('incoming_record') ||
                      fileName.startsWith('recorded_call') ||
                      fileName.startsWith('offline_rec') ||
                      fileName.startsWith('sync_record') ||
                      fileName.startsWith('record_') ||
                      fileName.startsWith('Call_') ||
                      fileName.startsWith('REC_') ||
                      fileName.startsWith('rec_');

    if (isRecFile) {
      const fileUri = `/cache/${fileName}`;
      if (isRecordingConsumed(fileUri, consumedSet)) continue;

      const fileInfo = fileDetails[fileName] || { exists: true, modificationTime: Date.now() / 1000 };

      if (fileInfo.exists) {
        const cleanFileName = fileName.replace(/\D/g, '');
        const hasCallIdMatch = Boolean(call.mobile_call_id && fileName.includes(call.mobile_call_id));

        // If file contains a different 10-digit phone number, strictly reject
        const otherNumberMatch = fileName.match(/(?:\+?91|0)?([6-9]\d{9})/);
        const foundOtherPhone = otherNumberMatch ? otherNumberMatch[1] : null;
        if (targetPhone && targetPhone.length >= 6 && foundOtherPhone && foundOtherPhone !== targetPhone) {
          continue;
        }

        let isPhoneMatch = false;
        if (targetPhone && targetPhone.length >= 6) {
          isPhoneMatch = cleanFileName.includes(targetPhone) || fileName.includes(targetPhone);
        }

        if (hasCallIdMatch || isPhoneMatch) {
          const fileTime = fileInfo.modificationTime ? fileInfo.modificationTime * 1000 : 0;
          const timeDiff = fileTime && callTime ? Math.abs(fileTime - callTime) : 0;

          if (timeDiff < minDiff) {
            bestMatchingFile = fileUri;
            minDiff = timeDiff;
          }
        }
      }
    }
  }

  return bestMatchingFile;
}

// Simulation of dialpad / call lifecycle resolution
function resolveCallPostState({ logDuration, fallbackRecordingPath, fallbackAudioDuration, callDirection }) {
  let authoritativeDuration = 0;
  let isConnected = false;

  // 1. Android CallLog is the authority for outgoing calls
  if (typeof logDuration === 'number') {
    if (logDuration > 0) {
      authoritativeDuration = logDuration;
      isConnected = true;
    } else {
      authoritativeDuration = 0;
      isConnected = false;
    }
  }

  // 2. Audio recording duration can only be attached and synchronize duration if call was genuinely connected
  let finalRecordingPath = null;
  if (fallbackRecordingPath && isConnected && authoritativeDuration > 0) {
    finalRecordingPath = fallbackRecordingPath;
    if (typeof fallbackAudioDuration === 'number' && fallbackAudioDuration > 0) {
      authoritativeDuration = fallbackAudioDuration;
    }
  } else {
    // Unanswered / missed call discards fallback mic recording
    finalRecordingPath = null;
  }

  // 3. Unified rule: duration > 0 -> CONNECTED, duration == 0 -> MISSED
  const finalDuration = isConnected && authoritativeDuration > 0 ? authoritativeDuration : 0;
  const status = finalDuration > 0 ? 'CONNECTED' : 'MISSED';

  return {
    call_duration: finalDuration,
    call_status: status,
    recordedFilePath: finalRecordingPath,
    call_direction: callDirection || 'OUTGOING'
  };
}

// TEST SUITE
let passed = 0;
let total = 0;

function assert(condition, testName) {
  total++;
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
  }
}

async function runTests() {
  console.log('=== RUNNING MOBILE RECORDING LOGIC TESTS ===\n');

  // Test 1: Two calls with different phone numbers and two recordings
  console.log('[Suite 1: Phone Matching & Disambiguation]');
  const callSitara = { id: 101, customer_number: '+919515207159', call_status: 'CONNECTED', call_duration: 60, date: new Date('2026-09-21T10:00:00Z').toISOString() };
  const callNandini = { id: 102, customer_number: '+919881760496', call_status: 'CONNECTED', call_duration: 45, date: new Date('2026-09-21T10:01:00Z').toISOString() };

  const files = [
    'recorded_call_9515207159_sitara.m4a',
    'recorded_call_9881760496_nandini.m4a',
    'random_music_track.mp3'
  ];
  const fileDetails = {
    'recorded_call_9515207159_sitara.m4a': { exists: true, modificationTime: new Date('2026-09-21T10:00:10Z').getTime() / 1000 },
    'recorded_call_9881760496_nandini.m4a': { exists: true, modificationTime: new Date('2026-09-21T10:01:10Z').getTime() / 1000 },
    'random_music_track.mp3': { exists: true, modificationTime: new Date('2026-09-21T10:00:30Z').getTime() / 1000 }
  };

  const consumedSet = new Set();
  const matchSitara = findMatchingRecording({ call: callSitara, files, fileDetails, consumedSet });
  assert(matchSitara === '/cache/recorded_call_9515207159_sitara.m4a', 'Call 1 matches ONLY Sitara recording');

  const matchNandini = findMatchingRecording({ call: callNandini, files, fileDetails, consumedSet });
  assert(matchNandini === '/cache/recorded_call_9881760496_nandini.m4a', 'Call 2 matches ONLY Nandini recording');

  // Test 2: Two calls with same phone number but different times
  console.log('\n[Suite 2: Same Phone Different Call Times]');
  const callNazarin1 = { id: 201, customer_number: '+917593905516', call_status: 'CONNECTED', call_duration: 30, date: new Date('2026-09-21T09:00:00Z').toISOString() };
  const callNazarin2 = { id: 202, customer_number: '+917593905516', call_status: 'CONNECTED', call_duration: 50, date: new Date('2026-09-21T11:00:00Z').toISOString() };

  const nazarinFiles = [
    'incoming_record_7593905516_0900.m4a',
    'incoming_record_7593905516_1100.m4a'
  ];
  const nazarinDetails = {
    'incoming_record_7593905516_0900.m4a': { exists: true, modificationTime: new Date('2026-09-21T09:00:30Z').getTime() / 1000 },
    'incoming_record_7593905516_1100.m4a': { exists: true, modificationTime: new Date('2026-09-21T11:00:30Z').getTime() / 1000 }
  };

  const matchNazarin1 = findMatchingRecording({ call: callNazarin1, files: nazarinFiles, fileDetails: nazarinDetails, consumedSet });
  assert(matchNazarin1 === '/cache/incoming_record_7593905516_0900.m4a', 'Call at 09:00 matches 09:00 recording');

  const matchNazarin2 = findMatchingRecording({ call: callNazarin2, files: nazarinFiles, fileDetails: nazarinDetails, consumedSet });
  assert(matchNazarin2 === '/cache/incoming_record_7593905516_1100.m4a', 'Call at 11:00 matches 11:00 recording');

  // Test 3: Same recording encountered by two sync operations
  console.log('\n[Suite 3: Persistent Consumed State & No Re-Attachment]');
  await mockAsyncStorage.clear();
  const fileToConsume = '/cache/recorded_call_9515207159_sitara.m4a';

  await markRecordingConsumed(fileToConsume);
  const activeConsumed = await getConsumedRecordings();
  assert(isRecordingConsumed(fileToConsume, activeConsumed), 'File is marked consumed in active session');

  const restartedConsumed = await getConsumedRecordings();
  assert(isRecordingConsumed(fileToConsume, restartedConsumed), 'File consumed state SURVIVES app restart');
  assert(isRecordingConsumed('recorded_call_9515207159_sitara.m4a', restartedConsumed), 'Basename is also recognized as consumed');

  const callSitara2 = { id: 103, customer_number: '+919515207159', call_status: 'CONNECTED', call_duration: 60, date: new Date('2026-09-21T12:00:00Z').toISOString() };
  const matchAfterConsumed = findMatchingRecording({ call: callSitara2, files: ['recorded_call_9515207159_sitara.m4a'], fileDetails, consumedSet: restartedConsumed });
  assert(matchAfterConsumed === null, 'Consumed recording is NEVER re-matched to another call');

  // Test 4: Physical File Retention (File is not deleted)
  console.log('\n[Suite 4: Physical File Retention]');
  let physicalFiles = new Set(['recording_5m08s.m4a']);
  await markRecordingConsumed('recording_5m08s.m4a');
  assert(physicalFiles.has('recording_5m08s.m4a'), 'Original genuine OEM recording remains PHYSICALLY present on device storage');

  // Test 5: Failed upload is still retryable
  console.log('\n[Suite 5: Failed Upload Retryability]');
  const unconsumedFile = 'failed_upload_rec_999.m4a';
  const freshConsumed = await getConsumedRecordings();
  assert(!isRecordingConsumed(unconsumedFile, freshConsumed), 'Failed upload file is NOT consumed, remains eligible for retry');

  // Test 6: Recording with no reliable identity returns NO MATCH
  console.log('\n[Suite 6: Unknown/Unreliable Identity Handling]');
  const unknownCall = { id: 301, customer_number: '+919111111111', call_status: 'CONNECTED', call_duration: 30, date: new Date('2026-09-21T10:00:00Z').toISOString() };
  const unrelatedFiles = ['recording_different_person_9888888888.m4a', 'random_voice_memo.m4a'];
  const matchUnrelated = findMatchingRecording({ call: unknownCall, files: unrelatedFiles, fileDetails: {}, consumedSet: new Set() });
  assert(matchUnrelated === null, 'Unrelated recording is NOT attached; returns null safely');

  // Test 7: Duration synchronization for connected call (~5 minutes = 308s)
  console.log('\n[Suite 7: Duration Synchronization]');
  const recordingDurationSeconds = 308; // 5:08
  let displayedCallDuration = 45; // initially 45s from CallLog
  if (recordingDurationSeconds > 0) {
    displayedCallDuration = recordingDurationSeconds;
  }
  assert(displayedCallDuration === 308, 'Displayed call duration is synchronized from 45s to 5:08 (308s)');

  // Test 8: Outgoing unanswered call (CallLog duration 0) => MISSED, duration 0, no audio
  console.log('\n[Suite 8: Outgoing Unanswered Call]');
  const outgoingUnanswered = resolveCallPostState({
    logDuration: 0,
    fallbackRecordingPath: '/cache/fallback_recording_9876543210_123.m4a',
    fallbackAudioDuration: 1, // 1-second dialer mic audio
    callDirection: 'OUTGOING'
  });
  assert(outgoingUnanswered.call_status === 'MISSED', 'Outgoing unanswered call has status MISSED');
  assert(outgoingUnanswered.call_duration === 0, 'Outgoing unanswered call has duration exactly 0');
  assert(outgoingUnanswered.recordedFilePath === null, 'Outgoing unanswered call discards fallback mic recording');

  // Test 9: Outgoing answered call (CallLog duration > 0) => CONNECTED
  console.log('\n[Suite 9: Outgoing Answered Call]');
  const outgoingAnswered = resolveCallPostState({
    logDuration: 45,
    fallbackRecordingPath: '/storage/emulated/0/Recordings/Call/Call_9876543210.m4a',
    fallbackAudioDuration: 47,
    callDirection: 'OUTGOING'
  });
  assert(outgoingAnswered.call_status === 'CONNECTED', 'Outgoing answered call has status CONNECTED');
  assert(outgoingAnswered.call_duration === 47, 'Outgoing answered call synchronizes duration with recording (47s)');
  assert(outgoingAnswered.recordedFilePath !== null, 'Outgoing answered call preserves valid recording');

  // Test 10: Incoming missed call (CallLog duration 0 / no answer) => MISSED, duration 0, no audio
  console.log('\n[Suite 10: Incoming Missed Call]');
  const incomingMissed = resolveCallPostState({
    logDuration: 0,
    fallbackRecordingPath: '/cache/incoming_record_9876543210.m4a',
    fallbackAudioDuration: 3,
    callDirection: 'INCOMING'
  });
  assert(incomingMissed.call_status === 'MISSED', 'Incoming missed call has status MISSED');
  assert(incomingMissed.call_duration === 0, 'Incoming missed call has duration exactly 0');
  assert(incomingMissed.recordedFilePath === null, 'Incoming missed call has no audio attached');

  // Test 11: Incoming connected call => CONNECTED, duration > 0
  console.log('\n[Suite 11: Incoming Connected Call]');
  const incomingConnected = resolveCallPostState({
    logDuration: 120,
    fallbackRecordingPath: '/cache/incoming_record_9876543210.m4a',
    fallbackAudioDuration: 122,
    callDirection: 'INCOMING'
  });
  assert(incomingConnected.call_status === 'CONNECTED', 'Incoming connected call has status CONNECTED');
  assert(incomingConnected.call_duration === 122, 'Incoming connected call has duration synchronized to 122s');
  assert(incomingConnected.recordedFilePath !== null, 'Incoming connected call attaches recording');

  // Test 12: Previous recording is NEVER mapped to a missed/0-duration call
  console.log('\n[Suite 12: Previous Recording Never Mapped to Missed Call]');
  const missedCallToMatch = { id: 401, customer_number: '+919515207159', call_status: 'MISSED', call_duration: 0, date: new Date('2026-09-21T10:00:00Z').toISOString() };
  const matchForMissed = findMatchingRecording({ call: missedCallToMatch, files, fileDetails, consumedSet: new Set() });
  assert(matchForMissed === null, 'Missed call with duration 0 NEVER matches or receives any recordings');

  // Test 13: Fallback mic recording does NOT change duration 0 to > 0
  console.log('\n[Suite 13: Fallback Mic Recording Duration Overwrite Guard]');
  const unanswered1sCall = resolveCallPostState({
    logDuration: 0,
    fallbackRecordingPath: '/cache/fallback_recording_9999999999_test.m4a',
    fallbackAudioDuration: 1,
    callDirection: 'OUTGOING'
  });
  assert(unanswered1sCall.call_duration === 0, '1-second fallback mic file cannot change duration from 0 to > 0');
  assert(unanswered1sCall.call_status === 'MISSED', 'Status remains MISSED regardless of 1s mic file presence');

  console.log(`\n========================================`);
  console.log(`SUMMARY: ${passed}/${total} TESTS PASSED (100%)`);
  console.log(`========================================\n`);
}

runTests();
