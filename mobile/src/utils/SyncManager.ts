import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import client from '../api/client';
import { getCurrentUserKey } from './ActiveCallSession';
import {
  recordingKeys, linkNeighbouringCalls, assignRecordings, maskName, maskPhone,
  type MatchContext, type RecordingCandidate,
} from './recordingMatch';

const PENDING_CALLS_STORAGE_KEY = '@pending_call_queue';
const PENDING_RECORDINGS_STORAGE_KEY = '@pending_recordings_queue';
const UNLINKED_RECORDINGS_STORAGE_KEY = '@unlinked_recordings_archive';
const CONSUMED_RECORDINGS_STORAGE_KEY = '@consumed_recordings_set';
const RESERVED_RECORDINGS_STORAGE_KEY = '@reserved_recordings';
const RESERVATION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// ── Reservations ─────────────────────────────────────────────────────────────
// A recording is reserved for a call as soon as it is attached on the Call Review screen or assigned to a
// pending item, so no other matcher can give it to another call. It becomes "consumed" only after a
// confirmed upload. Reservations are released when the user removes/replaces the file or discards the
// call, and expire after 24h.

export interface RecordingReservation {
  /** File path / URI as attached */
  key: string;
  mobileCallId: string;
  at: number;
}

let reservationQueue: Promise<unknown> = Promise.resolve();
const serializeReservations = <T>(op: () => Promise<T>): Promise<T> => {
  const run = reservationQueue.then(op, op);
  reservationQueue = run.catch(() => {});
  return run;
};

const readReservations = async (): Promise<RecordingReservation[]> => {
  try {
    const raw = await AsyncStorage.getItem(RESERVED_RECORDINGS_STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    const now = Date.now();
    return (Array.isArray(list) ? list : []).filter(
      (r: any) => r && typeof r.key === 'string' && r.key && now - Number(r.at || 0) <= RESERVATION_MAX_AGE_MS
    );
  } catch (_) {
    return [];
  }
};

export const getReservations = (): Promise<RecordingReservation[]> => serializeReservations(readReservations);

/** Reserves a file for a call. A call holds at most one reservation; a file belongs to at most one call. */
export const reserveRecording = (uriOrPath: string | null | undefined, mobileCallId: string) =>
  serializeReservations(async () => {
    if (!uriOrPath || !mobileCallId) return;
    const keys = new Set(recordingKeys(uriOrPath));
    const list = (await readReservations()).filter(
      (r) => r.mobileCallId !== mobileCallId && !recordingKeys(r.key).some((k) => keys.has(k))
    );
    list.push({ key: uriOrPath, mobileCallId, at: Date.now() });
    try { await AsyncStorage.setItem(RESERVED_RECORDINGS_STORAGE_KEY, JSON.stringify(list.slice(-300))); } catch (_) {}
  });

/** Releases the reservation of a call and/or of a file. */
export const releaseRecordingReservation = (by: { mobileCallId?: string | null; uri?: string | null }) =>
  serializeReservations(async () => {
    if (!by.mobileCallId && !by.uri) return;
    const keys = new Set(by.uri ? recordingKeys(by.uri) : []);
    const before = await readReservations();
    const list = before.filter(
      (r) => !(by.mobileCallId && r.mobileCallId === by.mobileCallId) && !recordingKeys(r.key).some((k) => keys.has(k))
    );
    try { await AsyncStorage.setItem(RESERVED_RECORDINGS_STORAGE_KEY, JSON.stringify(list)); } catch (_) {}
  });

/** Every identifier of the files reserved for calls OTHER than `excludeMobileCallId`. */
export const reservedKeysExcept = (reservations: RecordingReservation[], excludeMobileCallId?: string | null): Set<string> => {
  const set = new Set<string>();
  for (const r of reservations) {
    if (excludeMobileCallId && r.mobileCallId === excludeMobileCallId) continue;
    recordingKeys(r.key).forEach((k) => set.add(k));
  }
  return set;
};

export const getReservedRecordings = async (excludeMobileCallId?: string | null): Promise<Set<string>> =>
  reservedKeysExcept(await getReservations(), excludeMobileCallId);

export const AUDIO_MIME_BY_EXT: Record<string, string> = {
  m4a: 'audio/mp4', mp4: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', amr: 'audio/amr',
  aac: 'audio/aac', ogg: 'audio/ogg', opus: 'audio/ogg', '3gp': 'audio/3gpp',
};

const extOf = (uri: string): string => {
  let decoded = uri;
  try { decoded = decodeURIComponent(uri); } catch (_) {}
  return (decoded.match(/\.([a-zA-Z0-9]+)$/)?.[1] || 'm4a').toLowerCase();
};

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
 * Immediately reserves the recording file so concurrent calls or background syncs cannot attach the
 * same audio file to another call; it is marked consumed only after a confirmed upload.
 */
export const queuePendingRecording = async (item: PendingRecordingItem) => {
  try {
    if (item?.fileUri) {
      await reserveRecording(item.fileUri, item.mobileCallId || `interaction_${item.interactionId}`);
    }
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

    // Mark consumed in persistent storage (only now, after the confirmed upload), release the
    // reservation, and remove from pending queue
    await markRecordingConsumed(item.fileUri);
    await releaseRecordingReservation({ uri: item.fileUri, mobileCallId: item.mobileCallId });
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
    // Mentor / Sales calls whose phone recording hadn't been written yet when the call was saved
    syncPendingCallRecordings().catch(() => {});
  }
};

// ── Late-arriving call recordings (Mentor feedback and Sales interactions) ───────
// The phone's dialer can finish writing its recording after the call was saved. Those calls are queued
// and matched against the mapped folder later (app foreground, Mentors tab focus, sync) for up to 24h.
// Mentor and Sales items are matched together, oldest first, with the shared rules (recordingMatch):
// one file per call, one call per file, ambiguous -> nothing.
const PENDING_MENTOR_RECORDINGS_KEY = '@pending_mentor_recordings';
const PENDING_SALES_RECORDINGS_KEY = '@pending_sales_recordings';
const PENDING_LATE_RECORDING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Call window of a connected call whose recording should be attached when it appears */
export interface LateRecordingWindow {
  phone: string;
  callStartMs: number;
  callEndMs: number;
  prevSessionEndMs?: number;
  connectedSeconds?: number;
}

export interface PendingMentorRecording extends LateRecordingWindow {
  mobileCallId: string;
  studentId: string | number;
  queuedAt: number;
}

export interface PendingSalesRecording extends LateRecordingWindow {
  mobileCallId: string;
  interactionId: string | number;
  queuedAt: number;
}

const readList = async <T>(key: string): Promise<T[]> => {
  try {
    const raw = await AsyncStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (_) {
    return [];
  }
};

const writeList = async (key: string, list: unknown[]) => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(list));
  } catch (_) {}
};

export const getPendingMentorRecordings = () => readList<PendingMentorRecording>(PENDING_MENTOR_RECORDINGS_KEY);
export const getPendingSalesRecordings = () => readList<PendingSalesRecording>(PENDING_SALES_RECORDINGS_KEY);

export const queuePendingMentorRecording = async (item: Omit<PendingMentorRecording, 'queuedAt'>) => {
  const list = (await getPendingMentorRecordings()).filter(i => i.mobileCallId !== item.mobileCallId);
  list.push({ ...item, queuedAt: Date.now() });
  await writeList(PENDING_MENTOR_RECORDINGS_KEY, list);
  console.log(`[recmatch] queued late mentor recording ${item.mobileCallId} (${maskPhone(item.phone)})`);
};

export const queuePendingSalesRecording = async (item: Omit<PendingSalesRecording, 'queuedAt'>) => {
  const list = (await getPendingSalesRecordings()).filter(
    i => i.mobileCallId !== item.mobileCallId && String(i.interactionId) !== String(item.interactionId)
  );
  list.push({ ...item, queuedAt: Date.now() });
  await writeList(PENDING_SALES_RECORDINGS_KEY, list);
  console.log(`[recmatch] queued late sales recording ${item.mobileCallId} -> interaction ${item.interactionId} (${maskPhone(item.phone)})`);
};

type PendingEntry =
  | { kind: 'mentor'; item: PendingMentorRecording }
  | { kind: 'sales'; item: PendingSalesRecording };

type UploadOutcome = 'done' | 'drop' | 'retry';

/** Uploads a matched file for a pending item. Consumed only after a confirmed upload. */
const uploadPendingMatch = async (entry: PendingEntry, uri: string): Promise<UploadOutcome> => {
  const { mobileCallId } = entry.item;
  const ext = extOf(uri);
  const type = AUDIO_MIME_BY_EXT[ext] || 'audio/mp4';
  const name = `recording_${Date.now()}.${ext}`;

  if (entry.kind === 'mentor') {
    const { uploadFeedbackRecording } = await import('../api/mentors');
    try {
      await uploadFeedbackRecording(entry.item.studentId, { mobileCallId, uri, name, type });
      await markRecordingConsumed(uri);
      await releaseRecordingReservation({ mobileCallId, uri });
      console.log(`[recmatch] uploaded late mentor recording for ${mobileCallId}`);
      return 'done';
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 400 || status === 404) {
        // Permanent: unconnected/silent call or feedback missing. Don't retry; on 400 don't reuse the file.
        console.warn(`[recmatch] mentor recording for ${mobileCallId} rejected (${status}), dropping`, err?.response?.data);
        if (status === 400) await markRecordingConsumed(uri);
        await releaseRecordingReservation({ mobileCallId });
        return 'drop';
      }
      return 'retry'; // network / server error
    }
  }

  // Sales: skip if the interaction is gone or already got a recording (e.g. from syncMissingRecordings)
  const interactionId = entry.item.interactionId;
  try {
    const res = await client.get(`/crm/interactions/${interactionId}/`);
    const hasAudio = Boolean(res.data?.audio_recording || res.data?.recording_url);
    if (hasAudio) {
      console.log(`[recmatch] interaction ${interactionId} already has a recording, dropping pending ${mobileCallId}`);
      await releaseRecordingReservation({ mobileCallId });
      return 'drop';
    }
  } catch (err: any) {
    const status = err?.response?.status;
    if (status === 404 || status === 410) {
      console.warn(`[recmatch] interaction ${interactionId} not found (${status}), dropping pending ${mobileCallId}`);
      await releaseRecordingReservation({ mobileCallId });
      return 'drop';
    }
    return 'retry';
  }

  const result = await uploadSingleRecording({ interactionId, mobileCallId, fileUri: uri, mimeType: type, fileName: name });
  if (result.success) {
    console.log(`[recmatch] uploaded late sales recording for ${mobileCallId} -> interaction ${interactionId}`);
    return 'done';
  }
  if (result.permanentError || result.statusCode === 400) {
    console.warn(`[recmatch] sales recording for ${mobileCallId} rejected (${result.statusCode ?? result.error}), dropping`);
    if (result.statusCode === 400) await markRecordingConsumed(uri);
    await releaseRecordingReservation({ mobileCallId });
    return 'drop';
  }
  return 'retry';
};

let isSyncingLateRecordings = false;

/**
 * Matches and uploads late-arriving recordings for pending Mentor and Sales calls together.
 * Items older than 24h are dropped.
 */
export const syncPendingCallRecordings = async () => {
  if (isSyncingLateRecordings) return;
  isSyncingLateRecordings = true;
  try {
    const now = Date.now();
    const mentor = await getPendingMentorRecordings();
    const sales = await getPendingSalesRecordings();
    const entries: PendingEntry[] = [];
    for (const item of mentor) {
      if (now - item.queuedAt > PENDING_LATE_RECORDING_MAX_AGE_MS) {
        console.log(`[recmatch] dropping pending mentor recording ${item.mobileCallId}: not found within 24h`);
        await releaseRecordingReservation({ mobileCallId: item.mobileCallId });
      } else entries.push({ kind: 'mentor', item });
    }
    for (const item of sales) {
      if (now - item.queuedAt > PENDING_LATE_RECORDING_MAX_AGE_MS) {
        console.log(`[recmatch] dropping pending sales recording ${item.mobileCallId}: not found within 24h`);
        await releaseRecordingReservation({ mobileCallId: item.mobileCallId });
      } else entries.push({ kind: 'sales', item });
    }

    const keep = new Set<string>(entries.map(e => e.item.mobileCallId));
    if (entries.length > 0) {
      const { matchMappedFolderRecordings } = await import('./CallManager');
      const consumed = await getConsumedRecordings();
      const reservations = await getReservations();
      const calls = linkNeighbouringCalls(entries.map((e): MatchContext => ({
        key: e.item.mobileCallId,
        phone: e.item.phone,
        callStartMs: e.item.callStartMs,
        callEndMs: e.item.callEndMs,
        prevSessionEndMs: e.item.prevSessionEndMs ?? 0,
        connectedSeconds: e.item.connectedSeconds,
        consumed,
        reserved: reservedKeysExcept(reservations, e.item.mobileCallId),
      })));
      const result = await matchMappedFolderRecordings(calls, consumed, 'pending');

      if (result) {
        // Oldest first
        for (const ctx of calls) {
          const file = result.byCall.get(ctx.key!)?.file;
          if (!file) continue;
          const entry = entries.find(e => e.item.mobileCallId === ctx.key)!;
          await reserveRecording(file.uri, entry.item.mobileCallId);
          const outcome = await uploadPendingMatch(entry, file.uri);
          if (outcome !== 'retry') keep.delete(entry.item.mobileCallId);
        }
      }
    }

    // Save what is left, keeping entries queued by a concurrent save while this pass was running
    const handled = new Set([...mentor, ...sales].map(i => i.mobileCallId));
    const latestMentor = await getPendingMentorRecordings();
    const latestSales = await getPendingSalesRecordings();
    await writeList(PENDING_MENTOR_RECORDINGS_KEY, [
      ...mentor.filter(i => keep.has(i.mobileCallId)),
      ...latestMentor.filter(i => !handled.has(i.mobileCallId)),
    ]);
    await writeList(PENDING_SALES_RECORDINGS_KEY, [
      ...sales.filter(i => keep.has(i.mobileCallId)),
      ...latestSales.filter(i => !handled.has(i.mobileCallId)),
    ]);
  } catch (err) {
    console.warn('[recmatch] syncPendingCallRecordings error:', err);
  } finally {
    isSyncingLateRecordings = false;
  }
};

/** Kept for existing callers (Mentors tab): processes pending Mentor and Sales recordings. */
export const syncPendingMentorRecordings = syncPendingCallRecordings;

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
      try {
        const decodedBase = decodeURIComponent(item).split('/').pop()?.split(':').pop();
        if (decodedBase) currentSet.add(decodedBase);
      } catch (_) {}
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
  try {
    const decodedBase = decodeURIComponent(filePathOrName).split('/').pop()?.split(':').pop();
    if (decodedBase && consumedSet.has(decodedBase)) return true;
  } catch (_) {}
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
 * Optional fields: start_time / end_time (ISO), and late_recording (LateRecordingWindow without phone)
 * for a connected call with no file yet, so the phone's recording can be attached once the call has a
 * server id.
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
      if (callData.recordedFilePath && Number(callData.call_duration || 0) > 0 && (callData.call_status || '').toUpperCase() === 'CONNECTED') {
        // Reserved now, consumed once the call (with its recording) is synced
        await reserveRecording(callData.recordedFilePath, callData.mobile_call_id);
      }
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
        if (item.start_time) formData.append('start_time', item.start_time);
        if (item.end_time) formData.append('end_time', item.end_time);

        // Only attach recording for genuine connected calls with duration > 0
        if (isConnected && item.recordedFilePath) {
          let finalUri = item.recordedFilePath;
          if (!finalUri.startsWith('file://') && !finalUri.startsWith('content://')) {
            finalUri = `file://${finalUri}`;
          }
          const ext = extOf(finalUri);
          const mimeType = AUDIO_MIME_BY_EXT[ext] || 'audio/mp4';

          const cleanPhone = (item.customer_number || item.caller_number || item.receiver_number || '').replace(/\D/g, '').slice(-10);
          const recName = `offline_rec_${cleanPhone ? cleanPhone + '_' : ''}${item.mobile_call_id}.${ext}`;
          formData.append('audio_recording', {
            uri: finalUri,
            type: mimeType,
            name: recName
          } as any);
        }

        const res = await client.post('/crm/interactions/', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        console.log(`[SyncManager] Successfully synced offline call: ${item.mobile_call_id}`);

        if (isConnected && item.recordedFilePath) {
          // Mark recording consumed so it cannot be matched to another call; file remains on phone
          await markRecordingConsumed(item.recordedFilePath);
          await releaseRecordingReservation({ mobileCallId: item.mobile_call_id, uri: item.recordedFilePath });
        } else if (isConnected && item.late_recording && res?.data?.id) {
          // Connected call saved without a file: attach the phone's recording when it appears
          await queuePendingSalesRecording({
            interactionId: res.data.id,
            mobileCallId: item.mobile_call_id,
            phone: item.customer_number || item.receiver_number || item.caller_number || '',
            ...item.late_recording,
          });
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

const AUDIO_NAME_RE = /\.(m4a|mp4|3gp|wav|mp3|amr|aac|ogg|opus)$/i;

/**
 * Links local recordings to this user's CONNECTED call interactions that have no recording yet.
 * Sources: the app's cache directory and the mapped SAF recording folder.
 * Matching (shared rules in recordingMatch, FIX 4):
 *  - a file whose name has the interaction's mobile_call_id is taken directly;
 *  - otherwise calls are matched jointly, oldest first: name time vs call start, modified time vs call
 *    end, audio duration vs connected duration, window capped at the next known call, one file per call
 *    and one call per file; ambiguous calls get nothing;
 *  - a file without a phone number in its name is only considered for calls whose real start time is
 *    known (start_time); a file with a DIFFERENT number is always rejected.
 * Marks uploaded recordings as consumed in persistent storage without deleting them from the device.
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

    // 3. Fetch recent CONNECTED CALL interactions directly via query params
    const res = await client.get('/crm/interactions/', {
      params: { interaction_type: 'CALL', call_status: 'CONNECTED' }
    });
    const interactions: any[] = res.data?.results || res.data || [];

    // Only this user's calls can have their recording on this phone (managers also see team calls)
    const userKey = await getCurrentUserKey();
    const ownCalls = interactions.filter((item: any) => {
      if (item.interaction_type !== 'CALL') return false;
      if (!/^\d+$/.test(userKey) || item.author === null || item.author === undefined) return true;
      return String(item.author) === userKey;
    });

    // Exclude any interaction that already has a pending recording upload or a pending late-recording match
    const pendingList = await getPendingRecordings();
    const pendingSales = await getPendingSalesRecordings();
    const excludedIds = new Set<string>([
      ...pendingList.map((p) => String(p.interactionId)),
      ...pendingSales.map((p) => String(p.interactionId)),
    ]);

    // CONNECTED calls with duration > 0 that are missing audio (Missed calls must not receive recordings)
    const missingAudioCalls = ownCalls.filter((item: any) => {
      const isConnected = (item.call_status || '').toUpperCase() === 'CONNECTED' && Number(item.call_duration || 0) > 0;
      const hasAudio = Boolean((item.audio_recording && item.audio_recording !== '') || (item.recording_url && item.recording_url !== ''));
      return isConnected && !hasAudio && !excludedIds.has(String(item.id));
    });

    if (missingAudioCalls.length === 0) {
      console.log('[SyncManager] No missing audio recordings found.');
      return;
    }
    console.log(`[SyncManager] Found ${missingAudioCalls.length} calls missing audio recordings.`);

    // 4. Candidate files: the app's cache directory and the mapped SAF recording folder
    const { listMappedFolderEntries, buildRecordingCandidates, readTopCandidateDurations, logAssignment } = await import('./CallManager');
    const entries: { uri: string; name: string; modifiedMs: number | null; sizeBytes: number | null }[] = [];
    if (FileSystem.cacheDirectory) {
      const cacheFiles = await FileSystem.readDirectoryAsync(FileSystem.cacheDirectory).catch(() => [] as string[]);
      for (const f of cacheFiles) {
        if (!AUDIO_NAME_RE.test(f)) continue;
        // The app's own MIC fallback recording is digital silence on Android 10+ (MIC is muted for
        // third-party apps during calls), so never backfill it onto a call
        if (f.startsWith('fallback_recording') && Platform.OS === 'android' && Number(Platform.Version) >= 29) continue;
        entries.push({ uri: `${FileSystem.cacheDirectory}${f}`, name: f, modifiedMs: null, sizeBytes: null });
      }
    }
    const listing = await listMappedFolderEntries().catch(() => null);
    if (listing) entries.push(...listing.entries);
    if (entries.length === 0) return;

    const consumed = await getConsumedRecordings();
    const reservations = await getReservations();
    const timeOf = (v: any) => (v ? new Date(v).getTime() : NaN);

    // Real call start times on this phone cap the windows of neighbouring calls
    const knownStarts = ownCalls.map((it: any) => timeOf(it.start_time)).filter(Number.isFinite).sort((a, b) => a - b);

    type BackfillCall = MatchContext & { interaction: any };
    const calls: BackfillCall[] = missingAudioCalls.map((item: any): BackfillCall => {
      const targetPhone = (item.student_phone || item.customer_number || item.caller_number || item.receiver_number || '').replace(/\D/g, '').slice(-10);
      const realStart = timeOf(item.start_time);
      const hasRealStart = Number.isFinite(realStart);
      const callStartMs = hasRealStart ? realStart : timeOf(item.date);
      const durSec = Math.max(0, Number(item.call_duration || 0));
      const realEnd = timeOf(item.end_time);
      const callEndMs = hasRealStart && Number.isFinite(realEnd) && realEnd >= callStartMs ? realEnd : callStartMs + durSec * 1000;
      return {
        key: String(item.id),
        interaction: item,
        phone: targetPhone,
        callStartMs,
        callEndMs,
        connectedSeconds: durSec,
        consumed,
        reserved: reservedKeysExcept(reservations, item.mobile_call_id),
        windowBeforeMs: 15_000,
        windowAfterMs: 180_000,
        nextCallStartMs: hasRealStart ? knownStarts.find((s) => s > callStartMs + 1000) : undefined,
        otherCallStartsMs: hasRealStart ? knownStarts.filter((s) => Math.abs(s - callStartMs) > 1000) : [],
        // Without the real start time, only the number in the name can identify the call
        requireNumberMatch: !hasRealStart,
      };
    })
      .filter((c) => Number.isFinite(c.callStartMs))
      .sort((a, b) => a.callStartMs - b.callStartMs);

    // 5a. A file named with the interaction's mobile_call_id is that call's recording
    const assigned = new Map<string, string>();
    const usedUris = new Set<string>();
    for (const c of calls) {
      const id = c.interaction.mobile_call_id;
      if (!id) continue;
      const e = entries.find((x) => x.name.includes(id) && !usedUris.has(x.uri) &&
        !isRecordingConsumed(x.uri, consumed) && !isRecordingConsumed(x.name, consumed) &&
        !recordingKeysIn(x.uri, c.reserved));
      if (e) {
        assigned.set(c.key!, e.uri);
        usedUris.add(e.uri);
        console.log(`[recmatch] backfill ${c.key}: chose "${maskName(e.name)}" (mobile_call_id in name)`);
      }
    }

    // 5b. Joint matching for the rest
    const rest = calls.filter((c) => !assigned.has(c.key!));
    if (rest.length > 0) {
      const pool = entries.filter((e) => !usedUris.has(e.uri));
      const candidates: RecordingCandidate[] = await buildRecordingCandidates(pool, rest, consumed, 'backfill', 200);
      await readTopCandidateDurations(rest, candidates);
      const result = assignRecordings(rest, candidates);
      logAssignment('backfill', result, candidates);
      for (const [key, a] of result.byCall) {
        if (a.file) assigned.set(key, a.file.uri);
      }
    }

    // 6. Upload
    for (const c of calls) {
      const uri = assigned.get(c.key!);
      if (!uri) continue;
      const call = c.interaction;
      try {
        const ext = extOf(uri);
        const formData = new FormData();
        formData.append('audio_recording', {
          uri,
          type: AUDIO_MIME_BY_EXT[ext] || 'audio/mp4',
          name: `sync_record_${c.phone ? c.phone + '_' : ''}${call.id}_${Date.now()}.${ext}`
        } as any);

        await client.patch(`/crm/interactions/${call.id}/`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        console.log(`[SyncManager] Successfully uploaded missing recording for call ID ${call.id}`);

        // Mark consumed in persistent storage; original file remains on phone
        await markRecordingConsumed(uri);
        if (call.mobile_call_id) await releaseRecordingReservation({ mobileCallId: call.mobile_call_id });
      } catch (uploadErr) {
        console.warn(`[SyncManager] Upload failed for call ID ${call.id}, keeping eligible for retry:`, uploadErr);
      }
    }
  } catch (err) {
    console.error('[SyncManager] Error in background sync:', err);
  } finally {
    isSyncingRecordingsInProgress = false;
  }
};

const recordingKeysIn = (uri: string, set?: Set<string>): boolean =>
  !!set && recordingKeys(uri).some((k) => set.has(k));

// ── Mentor incoming calls (offline queue) ──────────────────────────────────────────────────────────
// A mentor's incoming call whose add_feedback POST failed (network / server) is kept here and retried.
// Separate key from the sales queues (queueOfflineCall / pending recordings are not involved). An item is
// only ever saved as the user who received the call: a different signed-in user drops it.
const PENDING_MENTOR_INCOMING_KEY = '@pending_mentor_incoming_feedback';
const PENDING_MENTOR_INCOMING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface PendingMentorIncomingFeedback {
  mobileCallId: string;
  studentId: string | number;
  /** getCurrentUserKey() of the mentor who received the call */
  userKey: string;
  /** add_feedback payload (call_direction INCOMING) */
  payload: Record<string, any>;
  /** Recording to upload once the feedback exists */
  recording?: { uri: string; name: string; type: string } | null;
  /** Connected call without a file yet: queued for the late-recording matcher after saving */
  lateRecording?: LateRecordingWindow | null;
  /** add_feedback already succeeded; only the recording upload is left */
  feedbackSaved?: boolean;
  queuedAt: number;
}

export const getPendingMentorIncomingFeedback = () => readList<PendingMentorIncomingFeedback>(PENDING_MENTOR_INCOMING_KEY);

export const queueMentorIncomingFeedback = async (item: Omit<PendingMentorIncomingFeedback, 'queuedAt'>) => {
  const list = (await getPendingMentorIncomingFeedback()).filter(i => i.mobileCallId !== item.mobileCallId);
  list.push({ ...item, queuedAt: Date.now() });
  await writeList(PENDING_MENTOR_INCOMING_KEY, list);
  if (item.recording?.uri) await reserveRecording(item.recording.uri, item.mobileCallId);
  console.log(`[mentor-incoming] queued ${item.mobileCallId}`);
};

let isSyncingMentorIncoming = false;

const isPermanentHttpError = (err: any) => {
  const status = err?.response?.status;
  return status === 400 || status === 403 || status === 404;
};

/** Retries queued mentor incoming-call feedback. No-op when the queue is empty. */
export const syncMentorIncomingFeedback = async () => {
  if (isSyncingMentorIncoming) return;
  isSyncingMentorIncoming = true;
  try {
    const items = await getPendingMentorIncomingFeedback();
    if (items.length === 0) return;
    const userKey = await getCurrentUserKey();
    const { addStudentFeedback, uploadFeedbackRecording } = await import('../api/mentors');
    const keep: PendingMentorIncomingFeedback[] = [];
    const handled = new Set<string>();

    for (const item of items) {
      handled.add(item.mobileCallId);
      const release = () => releaseRecordingReservation({ mobileCallId: item.mobileCallId });
      if (!item.userKey || item.userKey !== userKey) {
        // Never save a call as someone else
        console.warn(`[mentor-incoming] dropping ${item.mobileCallId}: queued by another user`);
        await release();
        continue;
      }
      if (Date.now() - item.queuedAt > PENDING_MENTOR_INCOMING_MAX_AGE_MS) {
        console.warn(`[mentor-incoming] dropping ${item.mobileCallId}: older than 7 days`);
        await release();
        continue;
      }
      let next: PendingMentorIncomingFeedback | null = item;
      try {
        if (!item.feedbackSaved) {
          await addStudentFeedback(item.studentId, item.payload);   // idempotent on mobile_call_id
          next = { ...item, feedbackSaved: true };
        }
        if (next.recording?.uri) {
          await uploadFeedbackRecording(item.studentId, {
            mobileCallId: item.mobileCallId, uri: next.recording.uri, name: next.recording.name, type: next.recording.type,
          });
          await markRecordingConsumed(next.recording.uri);
          await release();
        } else if (next.lateRecording) {
          await queuePendingMentorRecording({
            mobileCallId: item.mobileCallId, studentId: item.studentId, ...next.lateRecording,
          });
        }
        next = null;   // done
        console.log(`[mentor-incoming] synced ${item.mobileCallId}`);
      } catch (err: any) {
        if (isPermanentHttpError(err)) {
          console.warn(`[mentor-incoming] ${item.mobileCallId} rejected (${err?.response?.status}), dropping`, err?.response?.data);
          await release();
          next = null;
        }
        // otherwise keep `next` (network / server error) for the next run
      }
      if (next) keep.push(next);
    }

    // Keep items queued by a concurrent save while this pass was running
    const latest = await getPendingMentorIncomingFeedback();
    await writeList(PENDING_MENTOR_INCOMING_KEY, [...keep, ...latest.filter(i => !handled.has(i.mobileCallId))]);
  } catch (err) {
    console.warn('[mentor-incoming] sync error:', err);
  } finally {
    isSyncingMentorIncoming = false;
  }
};
