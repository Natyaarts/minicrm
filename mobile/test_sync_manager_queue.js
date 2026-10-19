const assert = require('assert');

// Mock AsyncStorage in-memory store simulating phone restart / persist
const storage = new Map();
const AsyncStorage = {
  getItem: async (key) => storage.get(key) || null,
  setItem: async (key, val) => { storage.set(key, String(val)); },
  removeItem: async (key) => { storage.delete(key); },
  clear: async () => { storage.clear(); },
};

// Queue constants
const PENDING_RECORDINGS_STORAGE_KEY = '@pending_recordings_queue';
const UNLINKED_RECORDINGS_STORAGE_KEY = '@unlinked_recordings_archive';
const CONSUMED_RECORDINGS_STORAGE_KEY = '@consumed_recordings_set';

// Testable implementations mirroring SyncManager.ts
const getPendingRecordings = async () => {
  try {
    const raw = await AsyncStorage.getItem(PENDING_RECORDINGS_STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    return [];
  }
};

const getUnlinkedRecordings = async () => {
  try {
    const raw = await AsyncStorage.getItem(UNLINKED_RECORDINGS_STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    return [];
  }
};

const archiveUnlinkedRecording = async (item) => {
  const current = await getUnlinkedRecordings();
  const exists = current.some((p) => String(p.interactionId) === String(item.interactionId));
  if (!exists) {
    current.push(item);
    await AsyncStorage.setItem(UNLINKED_RECORDINGS_STORAGE_KEY, JSON.stringify(current));
  }
};

const queuePendingRecording = async (item) => {
  const current = await getPendingRecordings();
  const exists = current.some(
    (p) => (item.interactionId && String(p.interactionId) === String(item.interactionId)) ||
           (item.mobileCallId && p.mobileCallId === item.mobileCallId)
  );
  if (!exists) {
    current.push({
      ...item,
      queued_at: item.queued_at || Date.now(),
    });
    await AsyncStorage.setItem(PENDING_RECORDINGS_STORAGE_KEY, JSON.stringify(current));
  }
};

const removePendingRecording = async (interactionId) => {
  const current = await getPendingRecordings();
  const filtered = current.filter((p) => String(p.interactionId) !== String(interactionId));
  await AsyncStorage.setItem(PENDING_RECORDINGS_STORAGE_KEY, JSON.stringify(filtered));
};

const getConsumedRecordings = async () => {
  const raw = await AsyncStorage.getItem(CONSUMED_RECORDINGS_STORAGE_KEY);
  if (!raw) return new Set();
  const list = JSON.parse(raw);
  return new Set(Array.isArray(list) ? list : []);
};

const markRecordingConsumed = async (identifiers) => {
  const items = Array.isArray(identifiers) ? identifiers : [identifiers];
  const currentSet = await getConsumedRecordings();
  items.filter(Boolean).forEach((item) => {
    currentSet.add(item);
    const basename = item.split('/').pop();
    if (basename) currentSet.add(basename);
  });
  await AsyncStorage.setItem(CONSUMED_RECORDINGS_STORAGE_KEY, JSON.stringify(Array.from(currentSet)));
};

// Concurrency locks
const activeUploadsSet = new Set();
let isSyncingPendingRecordingsInProgress = false;

const makeMockUploadSingleRecording = (mockClient, mockFileSystem) => {
  return async (item) => {
    if (!item || !item.interactionId || !item.fileUri) return { success: false };

    const uploadKey = String(item.interactionId);
    if (activeUploadsSet.has(uploadKey)) {
      return { success: false, error: 'Upload in progress' };
    }
    activeUploadsSet.add(uploadKey);

    try {
      // Check file existence
      if (mockFileSystem) {
        const fileInfo = await mockFileSystem.getInfoAsync(item.fileUri);
        if (fileInfo && fileInfo.exists === false) {
          await removePendingRecording(item.interactionId);
          return { success: false, permanentError: true };
        }
      }

      await mockClient.patch(`/crm/interactions/${item.interactionId}/`, {});
      await markRecordingConsumed(item.fileUri);
      await removePendingRecording(item.interactionId);
      return { success: true };
    } catch (err) {
      if (err && err.status === 404) {
        await archiveUnlinkedRecording({
          interactionId: item.interactionId,
          mobileCallId: item.mobileCallId,
          fileUri: item.fileUri,
          statusCode: 404,
          failedAt: Date.now(),
        });
        await removePendingRecording(item.interactionId);
        return { success: false, permanentError: true, statusCode: 404 };
      }
      return { success: false, permanentError: false };
    } finally {
      activeUploadsSet.delete(uploadKey);
    }
  };
};

async function runSyncManagerQueueTests() {
  console.log('--- Starting Mobile SyncManager Queue Correctness Tests ---');

  // Test 1: Queue persistence survives simulated process restart
  {
    await AsyncStorage.clear();
    await queuePendingRecording({
      interactionId: 101,
      mobileCallId: 'mob_test_101',
      fileUri: 'file:///data/rec1.m4a',
      mimeType: 'audio/m4a',
      fileName: 'rec1.m4a'
    });

    // Verify stored
    const queueBeforeRestart = await getPendingRecordings();
    assert.strictEqual(queueBeforeRestart.length, 1);
    assert.strictEqual(queueBeforeRestart[0].interactionId, 101);

    // Simulate restart (in-memory variables cleared, AsyncStorage survives)
    activeUploadsSet.clear();
    isSyncingPendingRecordingsInProgress = false;

    const queueAfterRestart = await getPendingRecordings();
    assert.strictEqual(queueAfterRestart.length, 1);
    assert.strictEqual(queueAfterRestart[0].interactionId, 101);
    assert.strictEqual(queueAfterRestart[0].fileUri, 'file:///data/rec1.m4a');
    console.log('✓ Test 1 Passed: Queue persistence survives process restart');
  }

  // Test 2: Duplicate queue entry prevention
  {
    await AsyncStorage.clear();
    const item = {
      interactionId: 102,
      mobileCallId: 'mob_test_102',
      fileUri: 'file:///data/rec2.m4a',
      mimeType: 'audio/m4a',
      fileName: 'rec2.m4a'
    };

    await queuePendingRecording(item);
    await queuePendingRecording(item); // Duplicate queue call
    await queuePendingRecording({ ...item, fileUri: 'file:///data/diff.m4a' }); // Same interaction ID

    const queue = await getPendingRecordings();
    assert.strictEqual(queue.length, 1, 'Duplicate item must not create duplicate queue entries');
    console.log('✓ Test 2 Passed: Duplicate queue entries prevented');
  }

  // Test 3: Failed upload leaves item in queue for retry and does not mark consumed
  {
    await AsyncStorage.clear();
    const item = {
      interactionId: 103,
      mobileCallId: 'mob_test_103',
      fileUri: 'file:///data/rec3.m4a',
      mimeType: 'audio/m4a',
      fileName: 'rec3.m4a'
    };
    await queuePendingRecording(item);

    // Mock client that fails (e.g. network timeout)
    const failingClient = {
      patch: async () => { throw new Error('Network timeout'); }
    };
    const uploadFn = makeMockUploadSingleRecording(failingClient, { getInfoAsync: async () => ({ exists: true }) });

    const result = await uploadFn(item);
    assert.strictEqual(result.success, false, 'Upload must return success: false on error');
    assert.strictEqual(result.permanentError, false, 'Temporary error must not be marked permanent');

    // Queue must STILL contain the item
    const queue = await getPendingRecordings();
    assert.strictEqual(queue.length, 1, 'Failed item must remain in queue');
    assert.strictEqual(queue[0].interactionId, 103);

    // Recording must NOT be consumed
    const consumed = await getConsumedRecordings();
    assert.strictEqual(consumed.has('file:///data/rec3.m4a'), false, 'Failed file must not be marked consumed');
    console.log('✓ Test 3 Passed: Failed upload remains queued and unconsumed');
  }

  // Test 4: Successful upload removes item and marks consumed
  {
    await AsyncStorage.clear();
    const item = {
      interactionId: 104,
      mobileCallId: 'mob_test_104',
      fileUri: 'file:///data/rec4.m4a',
      mimeType: 'audio/m4a',
      fileName: 'rec4.m4a'
    };
    await queuePendingRecording(item);

    const successClient = {
      patch: async () => ({ status: 200 })
    };
    const uploadFn = makeMockUploadSingleRecording(successClient, { getInfoAsync: async () => ({ exists: true }) });

    const result = await uploadFn(item);
    assert.strictEqual(result.success, true, 'Upload must return success: true on success');

    // Queue must now be empty
    const queue = await getPendingRecordings();
    assert.strictEqual(queue.length, 0, 'Successful item must be removed from queue');

    // Recording must be consumed
    const consumed = await getConsumedRecordings();
    assert.strictEqual(consumed.has('file:///data/rec4.m4a'), true, 'Uploaded file must be marked consumed');
    assert.strictEqual(consumed.has('rec4.m4a'), true, 'Basename must also be marked consumed');
    console.log('✓ Test 4 Passed: Successful upload removes from queue and marks consumed');
  }

  // Test 5: Missing recording file is cleaned up from queue without throwing
  {
    await AsyncStorage.clear();
    const item = {
      interactionId: 105,
      mobileCallId: 'mob_test_105',
      fileUri: 'file:///data/deleted.m4a',
      mimeType: 'audio/m4a',
      fileName: 'deleted.m4a'
    };
    await queuePendingRecording(item);

    // Mock file system where file does NOT exist
    const missingFileSystem = {
      getInfoAsync: async () => ({ exists: false })
    };
    const uploadFn = makeMockUploadSingleRecording({ patch: async () => {} }, missingFileSystem);

    const result = await uploadFn(item);
    assert.strictEqual(result.success, false, 'Missing file upload returns success: false');
    assert.strictEqual(result.permanentError, true);

    // Queue must have cleaned up the missing file
    const queue = await getPendingRecordings();
    assert.strictEqual(queue.length, 0, 'Missing recording file must be cleaned from queue');
    console.log('✓ Test 5 Passed: Missing recording file removed from queue safely');
  }

  // Test 6: Concurrency lock prevents parallel duplicate uploads for same interaction
  {
    await AsyncStorage.clear();
    const item = {
      interactionId: 106,
      mobileCallId: 'mob_test_106',
      fileUri: 'file:///data/rec6.m4a',
      mimeType: 'audio/m4a',
      fileName: 'rec6.m4a'
    };
    await queuePendingRecording(item);

    let clientCalls = 0;
    const slowClient = {
      patch: async () => {
        clientCalls++;
        await new Promise((r) => setTimeout(r, 50));
        return { status: 200 };
      }
    };
    const uploadFn = makeMockUploadSingleRecording(slowClient, { getInfoAsync: async () => ({ exists: true }) });

    // Fire two uploads concurrently for the same item
    const [p1, p2] = await Promise.all([uploadFn(item), uploadFn(item)]);

    assert.strictEqual(clientCalls, 1, 'Server must only be called once, second concurrent upload is locked out');
    const successes = [p1.success, p2.success].filter(Boolean);
    assert.strictEqual(successes.length, 1, 'Exactly one concurrent upload succeeds');
    console.log('✓ Test 6 Passed: Concurrency lock prevents parallel uploads of same interaction');
  }

  // Test 7: Non-retryable 404 error cleans up item from pending queue and archives safely
  {
    await AsyncStorage.clear();
    const item = {
      interactionId: 107,
      mobileCallId: 'mob_test_107',
      fileUri: 'file:///data/rec7.m4a',
      mimeType: 'audio/m4a',
      fileName: 'rec7.m4a'
    };
    await queuePendingRecording(item);

    const notFoundClient = {
      patch: async () => {
        const err = new Error('Not found');
        err.status = 404;
        throw err;
      }
    };
    const uploadFn = makeMockUploadSingleRecording(notFoundClient, { getInfoAsync: async () => ({ exists: true }) });

    const result = await uploadFn(item);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.permanentError, true);
    assert.strictEqual(result.statusCode, 404);

    const queue = await getPendingRecordings();
    assert.strictEqual(queue.length, 0, '404 not-found item must be removed from pending queue');

    const unlinked = await getUnlinkedRecordings();
    assert.strictEqual(unlinked.length, 1, '404 item must be archived into unlinked recordings');
    assert.strictEqual(unlinked[0].interactionId, 107);
    assert.strictEqual(unlinked[0].statusCode, 404);

    const consumed = await getConsumedRecordings();
    assert.strictEqual(consumed.has('file:///data/rec7.m4a'), false, '404 item must NOT be marked consumed');
    console.log('✓ Test 7 Passed: Non-retryable 404 error archives unlinked recording safely');
  }

  console.log('--- ALL MOBILE SYNCMANAGER QUEUE TESTS PASSED ---');
}

runSyncManagerQueueTests().catch((e) => {
  console.error('Test failure:', e);
  process.exit(1);
});
