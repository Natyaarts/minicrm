import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';

const PENDING_CALLS_STORAGE_KEY = '@pending_call_queue';
const CONSUMED_RECORDINGS_STORAGE_KEY = '@consumed_recordings_set';

/**
 * Loads the set of consumed recording identifiers / paths / names from AsyncStorage.
 * Survives app restart.
 */
export const getConsumedRecordings = async (): Promise<Set<string>> => {
  try {
    const raw = await AsyncStorage.getItem(CONSUMED_RECORDINGS_STORAGE_KEY);
    if (!raw) return new Set<string>();
    const list = JSON.parse(raw);
    return new Set<string>(Array.isArray(list) ? list : []);
  } catch (err) {
    console.error('[SyncManager] Failed to load consumed recordings:', err);
    return new Set<string>();
  }
};

/**
 * Marks one or more recording identifiers/paths/names as consumed persistently.
 * The recording file physically remains on the phone, but cannot be reused for other calls.
 */
export const markRecordingConsumed = async (identifiers: string | string[]) => {
  try {
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
    await AsyncStorage.setItem(CONSUMED_RECORDINGS_STORAGE_KEY, JSON.stringify(arrayToSave));
  } catch (err) {
    console.error('[SyncManager] Failed to save consumed recording:', err);
  }
};

/**
 * Checks if a recording path or filename is already consumed.
 */
export const isRecordingConsumed = (filePathOrName: string, consumedSet: Set<string>): boolean => {
  if (!filePathOrName) return false;
  if (consumedSet.has(filePathOrName)) return true;
  const basename = filePathOrName.split('/').pop();
  if (basename && consumedSet.has(basename)) return true;
  return false;
};

/**
 * Generates a unique client-side mobile call event ID.
 * Ensures that the same call is never uploaded twice.
 */
export const generateMobileCallId = (phone?: string, direction?: string): string => {
  const ts = Date.now();
  const rand = Math.random().toString(36).substring(2, 8);
  const cleanPhone = (phone || '').replace(/\D/g, '').slice(-6);
  const dir = (direction || 'OUT').toUpperCase().slice(0, 3);
  return `mob_${ts}_${dir}_${cleanPhone}_${rand}`;
};

/**
 * Queues a call event locally in AsyncStorage if the BDE is offline or upload fails.
 */
export const queueOfflineCall = async (callData: any) => {
  try {
    const rawQueue = await AsyncStorage.getItem(PENDING_CALLS_STORAGE_KEY);
    const queue = rawQueue ? JSON.parse(rawQueue) : [];

    // Ensure mobile_call_id exists
    if (!callData.mobile_call_id) {
      callData.mobile_call_id = generateMobileCallId(callData.customer_number || callData.phoneNumber, callData.call_direction);
    }

    // Deduplicate by mobile_call_id in queue
    const exists = queue.some((item: any) => item.mobile_call_id === callData.mobile_call_id);
    if (!exists) {
      queue.push({
        ...callData,
        queued_at: Date.now()
      });
      await AsyncStorage.setItem(PENDING_CALLS_STORAGE_KEY, JSON.stringify(queue));
      console.log(`[SyncManager] Queued offline call: ${callData.mobile_call_id}`);
    }
  } catch (err) {
    console.error('[SyncManager] Failed to queue offline call:', err);
  }
};

/**
 * Syncs any pending calls stored in the local offline queue to the CRM backend.
 */
export const syncPendingCalls = async () => {
  try {
    const rawQueue = await AsyncStorage.getItem(PENDING_CALLS_STORAGE_KEY);
    if (!rawQueue) return;

    const queue = JSON.parse(rawQueue);
    if (!Array.isArray(queue) || queue.length === 0) return;

    console.log(`[SyncManager] Processing ${queue.length} pending offline calls...`);
    const remainingQueue: any[] = [];

    for (const item of queue) {
      try {
        const durNumber = Number(item.call_duration || 0);
        const isConnected = durNumber > 0 && (item.call_status || '').toUpperCase() === 'CONNECTED';
        const finalStatus = isConnected ? 'CONNECTED' : 'MISSED';
        const finalDuration = isConnected ? String(durNumber) : '0';

        const formData = new FormData();
        if (item.student && item.student !== '0') formData.append('student', String(item.student));
        formData.append('interaction_type', 'CALL');
        formData.append('mobile_call_id', item.mobile_call_id);
        if (item.customer_number) formData.append('customer_number', item.customer_number);
        if (item.caller_number) formData.append('caller_number', item.caller_number);
        if (item.receiver_number) formData.append('receiver_number', item.receiver_number);
        formData.append('call_direction', item.call_direction || 'OUTGOING');
        formData.append('call_status', finalStatus);
        formData.append('call_duration', finalDuration);
        formData.append('notes', item.notes || `Call Logged via Mobile Sync (${item.call_direction || 'OUTGOING'})`);
        if (item.pipeline_status) formData.append('pipeline_status', String(item.pipeline_status));
        if (item.next_followup_date) formData.append('next_followup_date', item.next_followup_date);

        // Only attach recording for genuine connected calls with duration > 0
        if (isConnected && item.recordedFilePath) {
          let finalUri = item.recordedFilePath;
          if (!finalUri.startsWith('file://') && !finalUri.startsWith('content://')) {
            finalUri = `file://${finalUri}`;
          }
          const extMatch = finalUri.match(/\.([a-zA-Z0-9]+)$/);
          const ext = extMatch ? extMatch[1].toLowerCase() : 'm4a';
          let mimeType = 'audio/m4a';
          if (ext === 'mp3') mimeType = 'audio/mpeg';
          else if (ext === 'wav') mimeType = 'audio/wav';

          const cleanPhone = (item.customer_number || item.caller_number || item.receiver_number || '').replace(/\D/g, '').slice(-10);
          const recName = `offline_rec_${cleanPhone ? cleanPhone + '_' : ''}${item.mobile_call_id}.${ext}`;
          formData.append('audio_recording', {
            uri: finalUri,
            type: mimeType,
            name: recName
          } as any);
        }

        await client.post('/crm/interactions/', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        console.log(`[SyncManager] Successfully synced offline call: ${item.mobile_call_id}`);

        // Mark recording consumed so it cannot be matched to another call; file remains on phone
        if (isConnected && item.recordedFilePath) {
          await markRecordingConsumed(item.recordedFilePath);
        }
      } catch (postErr: any) {
        console.warn(`[SyncManager] Sync failed for call ${item.mobile_call_id}, keeping in queue:`, postErr?.message);
        remainingQueue.push(item);
      }
    }

    await AsyncStorage.setItem(PENDING_CALLS_STORAGE_KEY, JSON.stringify(remainingQueue));
  } catch (err) {
    console.error('[SyncManager] Error syncing pending calls:', err);
  }
};

let isSyncingRecordingsInProgress = false;

/**
 * Scans local storage cache for audio recordings and links them to interactions missing recordings.
 * Strictly verifies identity: call ID or normalized phone number + tight timestamp window.
 * Never guesses or attaches arbitrary files.
 * Marks uploaded recordings as consumed in persistent storage without deleting from device.
 */
export const syncMissingRecordings = async () => {
  if (isSyncingRecordingsInProgress) {
    console.log('[SyncManager] Sync already in progress, skipping concurrent run.');
    return;
  }
  isSyncingRecordingsInProgress = true;

  try {
    // 1. Sync pending queued calls first
    await syncPendingCalls();

    console.log('[SyncManager] Starting background sync check for missing call recordings...');

    // 2. Fetch recent call interactions
    const res = await client.get('/crm/interactions/');
    const interactions = res.data.results || res.data || [];

    // Filter for CONNECTED CALL interactions with duration > 0 that are missing audio (Missed calls must not receive recordings)
    const missingAudioCalls = interactions.filter((item: any) => {
      const isConnected = (item.call_status || '').toUpperCase() === 'CONNECTED' && Number(item.call_duration || 0) > 0;
      return isConnected && item.interaction_type === 'CALL' && (!item.audio_recording || item.audio_recording === '') && (!item.recording_url || item.recording_url === '');
    });

    if (missingAudioCalls.length === 0) {
      console.log('[SyncManager] No missing audio recordings found.');
      return;
    }

    console.log(`[SyncManager] Found ${missingAudioCalls.length} calls missing audio recordings.`);

    // 3. Scan the app's cache directory
    if (!FileSystem.cacheDirectory) return;
    const files = await FileSystem.readDirectoryAsync(FileSystem.cacheDirectory);

    // Load persistent consumed recordings set
    const persistentConsumed = await getConsumedRecordings();
    const inMemoryConsumed = new Set<string>(persistentConsumed);

    for (const call of missingAudioCalls) {
      const targetPhone = (call.student_phone || call.customer_number || call.caller_number || call.receiver_number || '').replace(/\D/g, '').slice(-10);
      const callTime = call.start_time ? new Date(call.start_time).getTime() : new Date(call.date).getTime();

      // Find a matching file in the cache with strict phone/call identity
      let bestMatchingFile: string | null = null;
      let minDiff = 180000; // 3 minutes max tolerance around call time

      for (const fileName of files) {
        if (isRecordingConsumed(fileName, inMemoryConsumed)) continue;

        // Check if the file is a recognized call recording prefix
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
          const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
          if (isRecordingConsumed(fileUri, inMemoryConsumed)) continue;

          try {
            const fileInfo = await FileSystem.getInfoAsync(fileUri);

            if (fileInfo.exists) {
              const cleanFileName = fileName.replace(/\D/g, '');
              const hasCallIdMatch = Boolean(call.mobile_call_id && fileName.includes(call.mobile_call_id));

              // If the file contains a different 10-digit phone number, strictly reject
              const otherNumberMatch = fileName.match(/(?:\+?91|0)?([6-9]\d{9})/);
              const foundOtherPhone = otherNumberMatch ? otherNumberMatch[1] : null;
              if (targetPhone && targetPhone.length >= 6 && foundOtherPhone && foundOtherPhone !== targetPhone) {
                continue;
              }

              let isPhoneMatch = false;
              if (targetPhone && targetPhone.length >= 6) {
                isPhoneMatch = cleanFileName.includes(targetPhone) || fileName.includes(targetPhone);
              }

              // Strictly require explicit call ID or verified phone number match.
              // Never attach an arbitrary audio file based merely on proximity.
              if (hasCallIdMatch || isPhoneMatch) {
                const fileTime = fileInfo.modificationTime ? fileInfo.modificationTime * 1000 : 0;
                const timeDiff = fileTime && callTime ? Math.abs(fileTime - callTime) : 0;

                if (timeDiff < minDiff) {
                  bestMatchingFile = fileUri;
                  minDiff = timeDiff;
                }
              }
            }
          } catch (_) {}
        }
      }

      if (bestMatchingFile) {
        console.log(`[SyncManager] Found matching local recording for call ID ${call.id}: ${bestMatchingFile}`);

        try {
          // Prepare multipart upload
          const formData = new FormData();
          const extMatch = bestMatchingFile.match(/\.([a-zA-Z0-9]+)$/);
          const ext = extMatch ? extMatch[1].toLowerCase() : 'm4a';
          let mimeType = 'audio/m4a';
          if (ext === 'mp3') mimeType = 'audio/mpeg';
          else if (ext === 'wav') mimeType = 'audio/wav';

          formData.append('audio_recording', {
            uri: bestMatchingFile,
            type: mimeType,
            name: `sync_record_${targetPhone ? targetPhone + '_' : ''}${call.id}_${Date.now()}.${ext}`
          } as any);

          // Upload via PATCH
          await client.patch(`/crm/interactions/${call.id}/`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });

          console.log(`[SyncManager] Successfully uploaded missing recording for call ID ${call.id}`);

          // Mark consumed in persistent storage and in-memory set; original file remains on phone
          const basename = bestMatchingFile.split('/').pop() || '';
          inMemoryConsumed.add(bestMatchingFile);
          if (basename) inMemoryConsumed.add(basename);
          await markRecordingConsumed([bestMatchingFile, basename]);
        } catch (uploadErr) {
          console.warn(`[SyncManager] Upload failed for call ID ${call.id}, keeping eligible for retry:`, uploadErr);
        }
      } else {
        console.log(`[SyncManager] No matching local recording found for call ID ${call.id} (left unassigned safely)`);
      }
    }
  } catch (err) {
    console.error('[SyncManager] Error in background sync:', err);
  } finally {
    isSyncingRecordingsInProgress = false;
  }
};
