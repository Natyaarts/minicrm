import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';

const PENDING_CALLS_STORAGE_KEY = '@pending_call_queue';
const PENDING_RECORDINGS_STORAGE_KEY = '@pending_recordings_queue';
const UNLINKED_RECORDINGS_STORAGE_KEY = '@unlinked_recordings_archive';
const CONSUMED_RECORDINGS_STORAGE_KEY = '@consumed_recordings_set';

export interface PendingRecordingItem {
  interactionId: number | string;
  mobileCallId?: string;
  fileUri: string;
  mimeType: string;
  fileName: string;
  queued_at?: number;
}

export interface UnlinkedRecordingItem {
  interactionId: number | string;
  mobileCallId?: string;
  fileUri: string;
  mimeType: string;
  fileName: string;
  failedAt: number;
  statusCode: number;
  error: string;
}

export interface UploadRecordingResult {
  success: boolean;
  permanentError?: boolean;
  statusCode?: number;
  error?: string;
}

/**
 * Loads the queue of pending recording uploads from AsyncStorage.
 */
export const getPendingRecordings = async (): Promise<PendingRecordingItem[]> => {
  try {
    const raw = await AsyncStorage.getItem(PENDING_RECORDINGS_STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.error('[SyncManager] Failed to load pending recordings:', err);
    return [];
  }
};

/**
 * Loads archived unlinked recordings from AsyncStorage.
 * Retains recordings whose server interaction returned permanent errors (404/410).
 */
export const getUnlinkedRecordings = async (): Promise<UnlinkedRecordingItem[]> => {
  try {
    const raw = await AsyncStorage.getItem(UNLINKED_RECORDINGS_STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.error('[SyncManager] Failed to load unlinked recordings archive:', err);
    return [];
  }
};

/**
 * Archives a recording that permanently failed to attach to a server interaction (e.g. 404 / 410).
 * Preserves the file reference and call metadata for investigation and manual recovery without looping.
 */
export const archiveUnlinkedRecording = async (item: UnlinkedRecordingItem) => {
  try {
    const current = await getUnlinkedRecordings();
    const exists = current.some(
      (p) => String(p.interactionId) === String(item.interactionId) && p.fileUri === item.fileUri
    );
    if (!exists) {
      current.push(item);
      await AsyncStorage.setItem(UNLINKED_RECORDINGS_STORAGE_KEY, JSON.stringify(current));
      console.log(`[SyncManager] Safely archived unlinked recording for interaction ${item.interactionId}`);
    }
  } catch (err) {
    console.error('[SyncManager] Failed to archive unlinked recording:', err);
  }
};

/**
 * Queues a recording file for background upload linked to an interaction ID.
 */
export const queuePendingRecording = async (item: PendingRecordingItem) => {
  try {
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
      console.log(`[SyncManager] Queued pending recording for interaction ID: ${item.interactionId}`);
    }
  } catch (err) {
    console.error('[SyncManager] Failed to queue pending recording:', err);
  }
};

/**
 * Removes a successfully uploaded recording from the pending queue.
 */
export const removePendingRecording = async (interactionId: number | string) => {
  try {
    const current = await getPendingRecordings();
    const filtered = current.filter((p) => String(p.interactionId) !== String(interactionId));
    await AsyncStorage.setItem(PENDING_RECORDINGS_STORAGE_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.error('[SyncManager] Failed to remove pending recording:', err);
  }
};

const activeUploadsSet = new Set<string>();
let isSyncingPendingRecordingsInProgress = false;

/**
 * Uploads a single recording to its existing interaction via PATCH.
 * Returns UploadRecordingResult. Retains recording on temporary error.
 * Archives unlinked recording on permanent 404/410 error.
 */
export const uploadSingleRecording = async (item: PendingRecordingItem): Promise<UploadRecordingResult> => {
  if (!item || !item.interactionId || !item.fileUri) {
    return { success: false, error: 'Invalid recording item' };
  }

  const uploadKey = String(item.interactionId);
  if (activeUploadsSet.has(uploadKey)) {
    console.log(`[SyncManager] Upload already in progress for interaction ${item.interactionId}, skipping concurrent upload.`);
    return { success: false, error: 'Upload in progress' };
  }
  activeUploadsSet.add(uploadKey);

  try {
    let finalUri = item.fileUri;
    if (!finalUri.startsWith('file://') && !finalUri.startsWith('content://')) {
      finalUri = `file://${finalUri}`;
    }

    // Check if recording file physically exists on the device
    try {
      const fileInfo = await FileSystem.getInfoAsync(finalUri);
      if (fileInfo && fileInfo.exists === false) {
        console.warn(`[SyncManager] Recording file no longer exists at ${finalUri}. Removing from queue to prevent infinite retries.`);
        await removePendingRecording(item.interactionId);
        return { success: false, permanentError: true, error: 'File does not exist' };
      }
    } catch (_) {
      // Proceed if URI scheme cannot be checked via getInfoAsync
    }

    const formData = new FormData();
    formData.append('audio_recording', {
      uri: finalUri,
      type: item.mimeType || 'audio/m4a',
      name: item.fileName || `recording_${Date.now()}.m4a`,
    } as any);

    await client.patch(`/crm/interactions/${item.interactionId}/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    console.log(`[SyncManager] Successfully uploaded recording for interaction ${item.interactionId}`);

    // Mark consumed in persistent storage and remove from pending queue
    await markRecordingConsumed(item.fileUri);
    await removePendingRecording(item.interactionId);
    return { success: true };
  } catch (err: any) {
    const statusCode = err?.response?.status;
    console.warn(`[SyncManager] Upload failed for recording on interaction ${item.interactionId}:`, err?.message || err);

    // If interaction was deleted or not found on the server (404/410):
    // 1. Do NOT silently delete the file or mark it consumed.
    // 2. Archive into @unlinked_recordings_archive so it can be investigated/recovered.
    // 3. Remove from @pending_recordings_queue to prevent indefinite retry loops.
    if (statusCode === 404 || statusCode === 410) {
      console.warn(`[SyncManager] Interaction ${item.interactionId} not found on server (${statusCode}). Archiving unlinked recording.`);
      await archiveUnlinkedRecording({
        interactionId: item.interactionId,
        mobileCallId: item.mobileCallId,
        fileUri: item.fileUri,
        mimeType: item.mimeType,
        fileName: item.fileName,
        failedAt: Date.now(),
        statusCode,
        error: `Server interaction not found (${statusCode})`,
      });
      await removePendingRecording(item.interactionId);
      return { success: false, permanentError: true, statusCode, error: `Interaction not found (${statusCode})` };
    }

    return { success: false, permanentError: false, statusCode, error: err?.message || 'Upload error' };
  } finally {
    activeUploadsSet.delete(uploadKey);
  }
};

/**
 * Retries any pending recording uploads in AsyncStorage with concurrency protection.
 */
export const syncPendingRecordings = async () => {
  if (isSyncingPendingRecordingsInProgress) {
    console.log('[SyncManager] syncPendingRecordings already in progress, skipping concurrent run.');
    return;
  }
  isSyncingPendingRecordingsInProgress = true;

  try {
    const list = await getPendingRecordings();
    if (!Array.isArray(list) || list.length === 0) return;

    console.log(`[SyncManager] Processing ${list.length} pending recordings in background...`);
    for (const item of list) {
      await uploadSingleRecording(item);
    }
  } catch (err) {
    console.error('[SyncManager] Error syncing pending recordings:', err);
  } finally {
    isSyncingPendingRecordingsInProgress = false;
  }
};

/**
 * Asynchronously queues and uploads a call recording without blocking UI.
 */
export const uploadCallRecordingAsync = async (
  item: PendingRecordingItem,
  onStatusChange?: (status: 'uploading' | 'success' | 'failed' | 'permanent_failure') => void
): Promise<UploadRecordingResult> => {
  await queuePendingRecording(item);
  if (onStatusChange) onStatusChange('uploading');

  const result = await uploadSingleRecording(item);
  if (onStatusChange) {
    if (result.success) {
      onStatusChange('success');
    } else if (result.permanentError) {
      onStatusChange('permanent_failure');
    } else {
      onStatusChange('failed');
    }
  }
  return result;
};

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
export const isRecordingConsumed = (filePathOrName: string, consumedSet?: Set<string>): boolean => {
  if (!filePathOrName || !consumedSet) return false;
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

    // 2. Sync pending recording uploads
    await syncPendingRecordings();

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
