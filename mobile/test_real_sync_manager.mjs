import assert from 'node:assert';
import AsyncStorage from './mock_storage.mjs';
import client from './mock_client.mjs';
import {
  getPendingRecordings,
  queuePendingRecording,
  removePendingRecording,
  getUnlinkedRecordings,
  archiveUnlinkedRecording,
  uploadSingleRecording,
  uploadCallRecordingAsync,
  getConsumedRecordings,
  isRecordingConsumed,
  markRecordingConsumed,
} from './src/utils/SyncManager.ts';

async function runRealSyncManagerTests() {
  console.log('=== Running REAL SyncManager.ts Implementation Tests ===');

  // Test 1: Queue Persistence
  {
    await AsyncStorage.clear();
    const item = {
      interactionId: 201,
      mobileCallId: 'mob_real_201',
      fileUri: 'file:///data/real_rec1.m4a',
      mimeType: 'audio/m4a',
      fileName: 'real_rec1.m4a',
    };
    await queuePendingRecording(item);
    const queue = await getPendingRecordings();
    assert.strictEqual(queue.length, 1);
    assert.strictEqual(queue[0].interactionId, 201);
    console.log('✓ Test 1 Passed: Real queuePendingRecording writes to AsyncStorage');
  }

  // Test 2: Duplicate Prevention
  {
    const duplicate = {
      interactionId: 201,
      mobileCallId: 'mob_real_201',
      fileUri: 'file:///data/real_rec1.m4a',
      mimeType: 'audio/m4a',
      fileName: 'real_rec1.m4a',
    };
    await queuePendingRecording(duplicate);
    const queue = await getPendingRecordings();
    assert.strictEqual(queue.length, 1, 'Duplicate item must not be added');
    console.log('✓ Test 2 Passed: Real queue prevents duplicate entries');
  }

  // Test 3: Temporary Failure Keeps Item in Queue
  {
    await AsyncStorage.clear();
    const item = {
      interactionId: 202,
      mobileCallId: 'mob_real_202',
      fileUri: 'file:///data/real_rec2.m4a',
      mimeType: 'audio/m4a',
      fileName: 'real_rec2.m4a',
    };
    await queuePendingRecording(item);

    // Mock network error
    client._setPatchHandler(async () => {
      const err = new Error('Network Timeout');
      err.response = { status: 504 };
      throw err;
    });

    const result = await uploadSingleRecording(item);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.permanentError, false);

    const queue = await getPendingRecordings();
    assert.strictEqual(queue.length, 1, 'Failed upload must remain in pending queue');

    const consumedSet = await getConsumedRecordings();
    const consumed = isRecordingConsumed(item.fileUri, consumedSet);
    assert.strictEqual(consumed, false, 'Failed upload must not be marked consumed');
    console.log('✓ Test 3 Passed: Real uploadSingleRecording retains item in queue on temporary network error');
  }

  // Test 4: Successful Upload Removes from Queue and Marks Consumed
  {
    const item = {
      interactionId: 202,
      mobileCallId: 'mob_real_202',
      fileUri: 'file:///data/real_rec2.m4a',
      mimeType: 'audio/m4a',
      fileName: 'real_rec2.m4a',
    };

    // Mock successful server patch
    client._setPatchHandler(async (url) => {
      assert.strictEqual(url, `/crm/interactions/202/`);
      return { status: 200, data: { id: 202 } };
    });

    const result = await uploadSingleRecording(item);
    assert.strictEqual(result.success, true);

    const queue = await getPendingRecordings();
    assert.strictEqual(queue.length, 0, 'Successful upload must be removed from queue');

    const consumedSet = await getConsumedRecordings();
    const consumed = isRecordingConsumed(item.fileUri, consumedSet);
    assert.strictEqual(consumed, true, 'Successful upload must be marked consumed');
    console.log('✓ Test 4 Passed: Real uploadSingleRecording marks consumed and cleans queue on success');
  }

  // Test 5: Missing Physical File Eviction
  {
    await AsyncStorage.clear();
    const item = {
      interactionId: 203,
      mobileCallId: 'mob_real_203',
      fileUri: 'file:///data/missing_file_rec3.m4a', // mock_filesystem returns exists: false for this
      mimeType: 'audio/m4a',
      fileName: 'missing_file_rec3.m4a',
    };
    await queuePendingRecording(item);

    const result = await uploadSingleRecording(item);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.permanentError, true);

    const queue = await getPendingRecordings();
    assert.strictEqual(queue.length, 0, 'Missing file must be removed from queue to prevent infinite retry loops');
    console.log('✓ Test 5 Passed: Real uploadSingleRecording safely evicts missing local file from queue');
  }

  // Test 6: Permanent Error HTTP 404/410 Handling & Archiving
  {
    await AsyncStorage.clear();
    const item = {
      interactionId: 204,
      mobileCallId: 'mob_real_204',
      fileUri: 'file:///data/perm_fail_rec4.m4a',
      mimeType: 'audio/m4a',
      fileName: 'perm_fail_rec4.m4a',
    };
    await queuePendingRecording(item);

    // Mock 404 response
    client._setPatchHandler(async () => {
      const err = new Error('Not Found');
      err.response = { status: 404 };
      throw err;
    });

    let statusCallback = null;
    const result = await uploadCallRecordingAsync(item, (status) => {
      statusCallback = status;
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.permanentError, true);
    assert.strictEqual(result.statusCode, 404);
    assert.strictEqual(statusCallback, 'permanent_failure', 'Status callback must notify permanent_failure');

    // 1. Must be removed from pending queue to avoid infinite retry loops
    const queue = await getPendingRecordings();
    assert.strictEqual(queue.length, 0, 'Item must be removed from pending queue');

    // 2. Must NOT be marked consumed
    const consumedSet = await getConsumedRecordings();
    const consumed = isRecordingConsumed(item.fileUri, consumedSet);
    assert.strictEqual(consumed, false, 'Item must NOT be marked consumed');

    // 3. Must be archived in unlinked recordings archive with failure info
    const unlinked = await getUnlinkedRecordings();
    assert.strictEqual(unlinked.length, 1, 'Recording must be archived in unlinked recordings');
    assert.strictEqual(unlinked[0].interactionId, 204);
    assert.strictEqual(unlinked[0].statusCode, 404);
    assert.strictEqual(unlinked[0].fileUri, item.fileUri);
    console.log('✓ Test 6 Passed: Real HTTP 404 archives unlinked recording without infinite looping');
  }

  // Test 7: Concurrency Lock in Real Implementation
  {
    await AsyncStorage.clear();
    const item = {
      interactionId: 205,
      mobileCallId: 'mob_real_205',
      fileUri: 'file:///data/slow_rec5.m4a',
      mimeType: 'audio/m4a',
      fileName: 'slow_rec5.m4a',
    };

    let serverCalls = 0;
    client._setPatchHandler(async () => {
      serverCalls++;
      await new Promise((r) => setTimeout(r, 60));
      return { status: 200, data: {} };
    });

    // Launch two parallel uploads for the exact same interaction
    const [res1, res2] = await Promise.all([
      uploadSingleRecording(item),
      uploadSingleRecording(item),
    ]);

    assert.strictEqual(serverCalls, 1, 'Only one upload request must hit the server');
    const successes = [res1.success, res2.success].filter(Boolean);
    assert.strictEqual(successes.length, 1, 'Exactly one concurrent upload must succeed, the other locked out');
    console.log('✓ Test 7 Passed: Real concurrency lock prevents parallel upload requests');
  }

  console.log('=== ALL REAL SyncManager.ts TESTS PASSED ===\n');
}

runRealSyncManagerTests().catch((e) => {
  console.error('Real SyncManager test failed:', e);
  process.exit(1);
});
