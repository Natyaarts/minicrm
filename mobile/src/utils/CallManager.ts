import { Platform, Alert, NativeModules, NativeEventEmitter, PermissionsAndroid, Permission } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Directory, File as ExpoFile } from 'expo-file-system';
import {
    assignRecordings, evaluateCandidate, selectCandidateEntries, last10Digits,
    maskName, maskPhone, WINDOW_BEFORE_MS, WINDOW_AFTER_MS,
    type RecordingCandidate, type MatchContext, type AssignmentResult,
} from './recordingMatch';

export { extractTimestampFromFileName } from './recordingMatch';

const { CallRecordingModule } = NativeModules;
export const MAPPED_RECORDING_FOLDER_KEY = '@mapped_recording_folder_uri';
const callRecordingEmitter = CallRecordingModule ? new NativeEventEmitter(CallRecordingModule) : null;

const AUDIO_EXTENSIONS = ['.m4a', '.mp4', '.3gp', '.wav', '.mp3', '.amr', '.aac', '.ogg', '.opus'];

// Session boundary tracking to prevent previous call duration or recording from leaking into a new call
let lastCallSessionEndTimeMs = 0;

export const markCallSessionEnded = (endTimeMs: number = Date.now()) => {
    if (endTimeMs > lastCallSessionEndTimeMs) {
        lastCallSessionEndTimeMs = endTimeMs;
    }
};

export const getLastCallSessionEndTimeMs = (): number => lastCallSessionEndTimeMs;

// Short-lived cache for folder scans to avoid redundant SAF directory reads within 5 seconds
let folderScanCache: {
    uri: string;
    timestamp: number;
    info: MappedRecordingFolderInfo;
} | null = null;

export const invalidateRecordingFolderCache = () => {
    folderScanCache = null;
};

export interface MappedRecordingFolderInfo {
    uri: string;
    folderName: string;
    accessible: boolean;
    totalFiles: number;
    audioRecordingsCount: number;
    recordingFiles: string[];
}

export interface SelectRecordingFolderResult {
    status: 'selected' | 'cancelled' | 'denied' | 'unsupported' | 'error';
    uri: string | null;
    folderInfo: MappedRecordingFolderInfo | null;
    errorMessage?: string;
}

export const isAudioRecordingFileName = (fileNameOrUri: string): boolean => {
    if (!fileNameOrUri) return false;
    const decoded = decodeURIComponent(fileNameOrUri).toLowerCase();
    return AUDIO_EXTENSIONS.some((ext) => decoded.endsWith(ext));
};

export const formatMappedFolderName = (uri: string | null | undefined): string => {
    if (!uri) return 'Not Mapped';
    try {
        const decoded = decodeURIComponent(uri);
        // Handle Android SAF tree/document URIs such as:
        // content://com.android.externalstorage.documents/tree/primary:Recordings/Call
        if (decoded.includes('/document/')) {
            const docPart = decoded.split('/document/').pop() || '';
            if (docPart.includes(':')) {
                const [vol, relPath] = docPart.split(':');
                const volLabel = vol === 'primary' ? 'Internal Storage' : vol;
                return relPath ? `${volLabel} / ${relPath}` : volLabel;
            }
            return docPart;
        }
        if (decoded.includes('/tree/')) {
            const treePart = decoded.split('/tree/').pop() || '';
            if (treePart.includes(':')) {
                const [vol, relPath] = treePart.split(':');
                const volLabel = vol === 'primary' ? 'Internal Storage' : vol;
                return relPath ? `${volLabel} / ${relPath}` : volLabel;
            }
            return treePart;
        }
        const cleaned = decoded.replace(/^file:\/\//, '').replace(/\/+$/, '');
        const parts = cleaned.split('/').filter(Boolean);
        return parts.slice(-2).join(' / ') || cleaned;
    } catch (_) {
        return uri;
    }
};

export const requestCallPermissions = async () => {
    if (Platform.OS !== 'android') return true;
    try {
        const permissionsToRequest: Permission[] = [
            PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
            PermissionsAndroid.PERMISSIONS.READ_CALL_LOG,
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
            PermissionsAndroid.PERMISSIONS.CALL_PHONE,
        ];
        
        if (Number(Platform.Version) >= 33) {
            permissionsToRequest.push(PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO);
        } else {
            permissionsToRequest.push(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE);
        }

        const ungranted: Permission[] = [];
        for (const p of permissionsToRequest) {
            const granted = await PermissionsAndroid.check(p);
            if (!granted) ungranted.push(p);
        }

        let grants: Record<string, string> = {};
        if (ungranted.length > 0) {
            grants = await PermissionsAndroid.requestMultiple(ungranted);
        }
        
        return true; 
    } catch (err) {
        console.warn('Permission request error:', err);
        return true; 
    }
};

export const listenToCallState = (onStateChanged: (event: { state: string; phoneNumber: string }) => void) => {
    if (!callRecordingEmitter) return () => {};
    
    const sub = callRecordingEmitter.addListener('onCallStateChanged', (event) => {
        console.log('Call state changed event:', event);
        onStateChanged(event);
    });
    
    return () => {
        sub.remove();
    };
};

export const listenToMissedCalls = (onMissedCall: (event: { phoneNumber: string; timestamp: number }) => void) => {
    if (!callRecordingEmitter) return () => {};
    
    const sub = callRecordingEmitter.addListener('onMissedCall', (event) => {
        console.log('Missed call event received:', event);
        onMissedCall(event);
    });
    
    return () => {
        sub.remove();
    };
};

export const requestDefaultDialerRole = async () => {
    if (Platform.OS !== 'android') {
        Alert.alert('Not Supported', 'Call recording is only supported on Android devices.');
        return false;
    }
    
    // In a full implementation, you would launch an Intent to ask for RolexManager.ROLE_DIALER
    // For now, we alert the user that this requires native compilation to test.
    Alert.alert(
        'Android Permissions', 
        'In the compiled Android build, this will trigger the system prompt: "Set Natya ERP as your default phone app?"'
    );
    return true;
};

export const checkIsDefaultDialer = async () => {
    if (Platform.OS !== 'android') return false;
    return false;
};

export const getMappedRecordingFolder = async (): Promise<string | null> => {
    try {
        return await AsyncStorage.getItem(MAPPED_RECORDING_FOLDER_KEY);
    } catch (e) {
        return null;
    }
};

export const scanRecordingFolder = async (
    folderUri?: string | null,
    forceRefresh: boolean = false
): Promise<MappedRecordingFolderInfo | null> => {
    try {
        const targetUri = folderUri || (await getMappedRecordingFolder());
        if (!targetUri) return null;

        // Return cached scan result if fresh (< 5s old) and not forced
        if (
            !forceRefresh &&
            folderScanCache &&
            folderScanCache.uri === targetUri &&
            Date.now() - folderScanCache.timestamp < 5000
        ) {
            return folderScanCache.info;
        }

        const folderName = formatMappedFolderName(targetUri);
        let entries: string[] = [];

        if (targetUri.startsWith('content://') && FileSystem.StorageAccessFramework) {
            entries = await FileSystem.StorageAccessFramework.readDirectoryAsync(targetUri);
        } else if (targetUri.startsWith('file://') || targetUri.startsWith('/')) {
            const normalized = targetUri.startsWith('file://') ? targetUri : `file://${targetUri}`;
            const names = await FileSystem.readDirectoryAsync(normalized);
            entries = names.map((name) => `${normalized.replace(/\/+$/, '')}/${name}`);
        } else if (typeof Directory !== 'undefined') {
            const dir = new Directory(targetUri);
            const listed = dir.list();
            entries = listed.map((item) => item.uri);
        }

        const recordingFiles: string[] = [];
        for (const entryUri of entries) {
            if (isAudioRecordingFileName(entryUri)) {
                recordingFiles.push(entryUri);
            } else if (entryUri.startsWith('content://') && FileSystem.StorageAccessFramework) {
                // Only attempt 1-level subdirectory scan if the entry name does NOT have a file extension
                // (avoids expensive native SAF queries on .txt, .jpg, .pdf, etc.)
                const decodedBase = decodeURIComponent(entryUri).split('/').pop()?.split(':').pop() || '';
                const hasFileExtension = /\.[a-z0-9]{2,5}$/i.test(decodedBase);
                if (!hasFileExtension) {
                    try {
                        const subEntries = await FileSystem.StorageAccessFramework.readDirectoryAsync(entryUri);
                        for (const subUri of subEntries) {
                            if (isAudioRecordingFileName(subUri)) {
                                recordingFiles.push(subUri);
                            }
                        }
                    } catch (_) {
                        // Not a directory or unreadable; ignore
                    }
                }
            }
        }

        const result: MappedRecordingFolderInfo = {
            uri: targetUri,
            folderName,
            accessible: true,
            totalFiles: entries.length,
            audioRecordingsCount: recordingFiles.length,
            recordingFiles,
        };
        folderScanCache = {
            uri: targetUri,
            timestamp: Date.now(),
            info: result,
        };
        return result;
    } catch (err) {
        console.warn('[CallManager] Unable to read mapped recording folder:', err);
        const fallbackUri = folderUri || '';
        if (!fallbackUri) return null;
        return {
            uri: fallbackUri,
            folderName: formatMappedFolderName(fallbackUri),
            accessible: false,
            totalFiles: 0,
            audioRecordingsCount: 0,
            recordingFiles: [],
        };
    }
};

export const pickAndMapRecordingFolder = async (): Promise<SelectRecordingFolderResult> => {
    if (Platform.OS !== 'android') {
        return {
            status: 'unsupported',
            uri: null,
            folderInfo: null,
            errorMessage: 'Folder mapping for call recordings is only supported on Android devices.',
        };
    }

    try {
        // 1. If custom native CallRecordingModule is available with selectRecordingFolder
        if (CallRecordingModule && typeof CallRecordingModule.selectRecordingFolder === 'function') {
            const nativeUri = await CallRecordingModule.selectRecordingFolder();
            if (nativeUri) {
                const uriStr = String(nativeUri);
                await AsyncStorage.setItem(MAPPED_RECORDING_FOLDER_KEY, uriStr);
                const folderInfo = await scanRecordingFolder(uriStr);
                return {
                    status: 'selected',
                    uri: uriStr,
                    folderInfo,
                };
            }
        }

        // 2. Standard Android SAF directory picker via expo-file-system/legacy StorageAccessFramework
        if (FileSystem.StorageAccessFramework && typeof FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync === 'function') {
            const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
            if (permissions && permissions.granted && permissions.directoryUri) {
                const selectedUri = permissions.directoryUri;
                const folderInfo = await scanRecordingFolder(selectedUri);
                if (folderInfo && !folderInfo.accessible) {
                    return {
                        status: 'denied',
                        uri: null,
                        folderInfo: null,
                        errorMessage: 'Directory permission was not granted or the selected folder could not be accessed.',
                    };
                }
                await AsyncStorage.setItem(MAPPED_RECORDING_FOLDER_KEY, selectedUri);
                return {
                    status: 'selected',
                    uri: selectedUri,
                    folderInfo,
                };
            }
            // User backed out or cancelled the system folder picker
            return {
                status: 'cancelled',
                uri: null,
                folderInfo: null,
            };
        }

        // 3. Fallback to Expo SDK 54 Directory.pickDirectoryAsync() if StorageAccessFramework is unavailable
        if (typeof Directory !== 'undefined' && typeof Directory.pickDirectoryAsync === 'function') {
            try {
                const pickedDir = await Directory.pickDirectoryAsync();
                if (pickedDir && pickedDir.uri) {
                    const selectedUri = pickedDir.uri;
                    await AsyncStorage.setItem(MAPPED_RECORDING_FOLDER_KEY, selectedUri);
                    const folderInfo = await scanRecordingFolder(selectedUri);
                    return {
                        status: 'selected',
                        uri: selectedUri,
                        folderInfo,
                    };
                }
                return {
                    status: 'cancelled',
                    uri: null,
                    folderInfo: null,
                };
            } catch (pickerErr: any) {
                const msg = String(pickerErr?.message || pickerErr || '').toLowerCase();
                if (msg.includes('cancel')) {
                    return {
                        status: 'cancelled',
                        uri: null,
                        folderInfo: null,
                    };
                }
                throw pickerErr;
            }
        }

        return {
            status: 'error',
            uri: null,
            folderInfo: null,
            errorMessage: 'Android folder picker is not available in this environment.',
        };
    } catch (e: any) {
        const msg = String(e?.message || e || '');
        if (msg.toLowerCase().includes('cancel')) {
            return {
                status: 'cancelled',
                uri: null,
                folderInfo: null,
            };
        }
        if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('denied')) {
            return {
                status: 'denied',
                uri: null,
                folderInfo: null,
                errorMessage: 'Permission to access the selected folder was denied.',
            };
        }
        console.error('Failed to select recording folder:', e);
        return {
            status: 'error',
            uri: null,
            folderInfo: null,
            errorMessage: msg || 'Failed to open the system folder picker.',
        };
    }
};

export const selectRecordingFolder = async (): Promise<string | null> => {
    const result = await pickAndMapRecordingFolder();
    return result.uri;
};

export const startNativeRecording = async (phoneNumber?: string) => {
    if (!CallRecordingModule) return null;
    try {
        const filePath = await CallRecordingModule.startRecording(phoneNumber || "");
        return filePath;
    } catch (e) {
        console.error(e);
        return null;
    }
};

// ── App (MIC) fallback recordings ──────────────────────────────────────────
// Android 10+ silences MIC capture for third-party apps during a call, so the app's own
// "fallback_recording_*.m4a" is digital silence there. Only the phone's built-in call recorder
// (mapped folder / MediaStore copy) has real call audio.
const FALLBACK_SILENCE_PEAK = 100; // MediaRecorder.getMaxAmplitude() is 0..32767; 0 = digital silence

export const isAppFallbackRecording = (pathOrUri?: string | null): boolean =>
    !!pathOrUri && decodeURIComponent(String(pathOrUri)).split('/').pop()!.startsWith('fallback_recording_');

// Decoded peak below this is treated as silence (digital silence measures about -91 dB)
export const SILENCE_PEAK_DBFS = -60;

/** Peak level of the first seconds of an audio file in dBFS (-200 = digital silence), or null if unknown. */
export const getAudioPeakDbfs = async (pathOrUri: string, seconds = 5): Promise<number | null> => {
    try {
        if (Platform.OS === 'android' && CallRecordingModule && typeof CallRecordingModule.getAudioPeakDbfs === 'function') {
            const v = await CallRecordingModule.getAudioPeakDbfs(String(pathOrUri), seconds);
            return typeof v === 'number' && Number.isFinite(v) ? v : null;
        }
    } catch (_) {}
    return null;
};

/** Deletes the app's own fallback recording (never touches the phone's recordings). */
export const deleteAppFallbackRecording = async (pathOrUri?: string | null) => {
    if (!pathOrUri || !isAppFallbackRecording(pathOrUri)) return;
    const uri = String(pathOrUri).startsWith('file://') ? String(pathOrUri) : `file://${pathOrUri}`;
    try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch (_) {}
};

/** true when the file is the app's own fallback recording and has no usable audio (or can't be verified on Android 10+). */
export const isSilentAppRecording = async (pathOrUri?: string | null): Promise<boolean> => {
    if (!isAppFallbackRecording(pathOrUri)) return false;
    // 1. Decode the start of the file and measure it
    const dbfs = await getAudioPeakDbfs(String(pathOrUri));
    if (dbfs !== null) return dbfs < SILENCE_PEAK_DBFS;
    // 2. Peak amplitude tracked by the recorder while it ran
    let peak = -1;
    try {
        if (CallRecordingModule && typeof CallRecordingModule.getFallbackPeakAmplitude === 'function') {
            peak = Number(await CallRecordingModule.getFallbackPeakAmplitude(String(pathOrUri)));
        }
    } catch (_) {}
    if (peak >= 0) return peak < FALLBACK_SILENCE_PEAK;
    // Peak unknown: on Android 10+ the MIC is silenced during calls, so treat it as silent
    return Platform.OS === 'android' && Number(Platform.Version) >= 29;
};

export const cancelNativeRecording = async () => {
    markCallSessionEnded(Date.now());
    if (!CallRecordingModule) return null;
    try {
        if (typeof CallRecordingModule.cancelRecording === 'function') {
            await CallRecordingModule.cancelRecording();
            return null;
        }
        await CallRecordingModule.stopRecording(0);
        return null;
    } catch (e) {
        console.warn('[CallManager] cancelNativeRecording error:', e);
        return null;
    }
};

/**
 * Stops the app recorder and returns the phone's own call recording found natively, the app's fallback
 * file, or null. `prevSessionEndMs` is the end of the PREVIOUS call session, captured before the CallLog
 * lookup (defaults to the current floor, which is that value until this call is concluded): files that
 * end before it belong to an earlier call.
 */
export const stopNativeRecording = async (prevSessionEndMs?: number) => {
    if (!CallRecordingModule) {
        markCallSessionEnded(Date.now());
        return null;
    }
    try {
        const floor = typeof prevSessionEndMs === 'number' ? prevSessionEndMs : lastCallSessionEndTimeMs;
        const filePath = await CallRecordingModule.stopRecording(floor);
        markCallSessionEnded(Date.now());
        return filePath;
    } catch (e) {
        console.error(e);
        markCallSessionEnded(Date.now());
        return null;
    }
};

export const makeDirectCall = async (phoneNumber: string): Promise<boolean> => {
    if (!CallRecordingModule) return false;
    try {
        await CallRecordingModule.makeDirectCall(phoneNumber);
        return true;
    } catch (e) {
        console.error("Direct call failed:", e);
        return false;
    }
};

// ── CallLog (connection status + duration) ─────────────────────────────────
// Lookups are pure reads. A row is consumed only once its call is concluded (markCallLogRowConsumed).

export interface CallLogEntry {
    rowId: number;
    /** Connected seconds; 0 for missed / rejected rows */
    durationSec: number;
    /** CallLog.DATE: when the call started */
    dateMs: number;
    type: number;
}

/** found: the call's CallLog row; none: no row (yet); unreadable: READ_CALL_LOG off or lookup failed */
export type CallLogLookup =
    | { kind: 'found'; entry: CallLogEntry }
    | { kind: 'none' }
    | { kind: 'unreadable'; reason: string };

const iso = (ms: number) => (ms > 0 ? new Date(ms).toISOString() : '0');

/**
 * The newest CallLog row for this call: matching direction and number, DATE >= callStartMs - 10s,
 * DATE >= prevSessionEndMs (end of the PREVIOUS call session), not consumed. No side effects.
 */
export const lookupCallLogEntry = async (
    phoneNumber: string,
    callStartMs: number,
    prevSessionEndMs: number,
    direction: 'OUTGOING' | 'INCOMING'
): Promise<CallLogLookup> => {
    if (Platform.OS !== 'android' || !CallRecordingModule || typeof CallRecordingModule.findCallLogEntry !== 'function') {
        return { kind: 'unreadable', reason: 'unsupported' };
    }
    try {
        const r: any = await CallRecordingModule.findCallLogEntry(phoneNumber || '', callStartMs || 0, prevSessionEndMs || 0, direction);
        const counts = `scanned ${r?.rowsScanned ?? '?'}, considered ${r?.rowsConsidered ?? '?'}, consumed-skipped ${r?.consumedSkipped ?? '?'}`;
        const query = `${maskPhone(phoneNumber)} ${direction} start=${iso(callStartMs)} floor=${iso(prevSessionEndMs)}`;
        if (r?.status === 'found') {
            const entry: CallLogEntry = {
                rowId: Number(r.rowId), durationSec: Number(r.durationSec) || 0, dateMs: Number(r.dateMs) || 0, type: Number(r.type) || 0,
            };
            console.log(`[calllog] lookup ${query} -> row ${entry.rowId}, ${entry.durationSec}s, date=${iso(entry.dateMs)} (${counts})`);
            return { kind: 'found', entry };
        }
        if (r?.status === 'none') {
            console.log(`[calllog] lookup ${query} -> no row (${counts})`);
            return { kind: 'none' };
        }
        const reason = r?.status === 'no_permission' ? 'no_permission' : `error: ${r?.message || 'unknown'}`;
        console.warn(`[calllog] lookup ${query} -> unreadable (${reason})`);
        return { kind: 'unreadable', reason };
    } catch (e: any) {
        console.warn('[calllog] lookup failed:', e?.message || e);
        return { kind: 'unreadable', reason: `error: ${e?.message || 'unknown'}` };
    }
};

/**
 * Polls lookupCallLogEntry until the row appears (the phone may write it a few seconds after hang-up),
 * the CallLog is unreadable, `shouldAbort()` returns true, or `timeoutMs` passes. Safe because lookups
 * are pure reads.
 */
export const waitForCallLogEntry = async (
    phoneNumber: string,
    callStartMs: number,
    prevSessionEndMs: number,
    direction: 'OUTGOING' | 'INCOMING',
    opts: { timeoutMs?: number; intervalMs?: number; shouldAbort?: () => boolean } = {}
): Promise<CallLogLookup> => {
    const deadline = Date.now() + (opts.timeoutMs ?? 10_000);
    const interval = opts.intervalMs ?? 750;
    let last: CallLogLookup = { kind: 'none' };
    for (let attempt = 0; ; attempt++) {
        last = await lookupCallLogEntry(phoneNumber, callStartMs, prevSessionEndMs, direction);
        if (last.kind !== 'none') return last;
        if (opts.shouldAbort?.() || Date.now() + interval > deadline) {
            console.log(`[calllog] no row for ${maskPhone(phoneNumber)} after ${attempt + 1} lookup(s)`);
            return last;
        }
        await new Promise(r => setTimeout(r, interval));
    }
};

/** Marks the CallLog row as used by its concluded call. Call exactly once per concluded call. */
export const markCallLogRowConsumed = async (rowId: number, callEndMs: number) => {
    if (!CallRecordingModule || typeof CallRecordingModule.markCallLogRowConsumed !== 'function') return;
    if (!Number.isFinite(rowId) || rowId < 0) return;
    try {
        await CallRecordingModule.markCallLogRowConsumed(rowId, callEndMs);
        console.log(`[calllog] consumed row ${rowId} (call end ${iso(callEndMs)})`);
    } catch (e: any) {
        console.warn('[calllog] markCallLogRowConsumed failed:', e?.message || e);
    }
};

/**
 * Legacy helper: connected seconds of the matching CallLog row, 0 when there is none, null when the
 * CallLog can't be read. A pure read (wraps lookupCallLogEntry); the floor is the current session floor.
 */
export const getLatestCallLogDuration = async (
    phoneNumber?: string,
    startTimeMs?: number,
    direction?: string
): Promise<number | null> => {
    const r = await lookupCallLogEntry(
        phoneNumber || '', startTimeMs || 0, lastCallSessionEndTimeMs,
        (direction || 'INCOMING').toUpperCase() === 'OUTGOING' ? 'OUTGOING' : 'INCOMING'
    );
    if (r.kind === 'found') return r.entry.durationSec;
    if (r.kind === 'none') return 0;
    return null;
};

// ── Mapped-folder recording search ─────────────────────────────────────────

/** Audio duration in whole seconds (native metadata, else expo-av), or null if unknown. */
export const getAudioDurationSec = async (uri: string): Promise<number | null> => {
    try {
        if (Platform.OS === 'android' && CallRecordingModule && typeof CallRecordingModule.getAudioDurationMs === 'function') {
            const ms = await CallRecordingModule.getAudioDurationMs(uri);
            if (typeof ms === 'number' && ms > 0) return Math.round(ms / 1000);
        }
    } catch (_) {}
    return extractDurationFromAudio(uri);
};

/** Modified time (ms) and size of a file:// or content:// URI; nulls when unknown. */
const statRecording = async (uri: string): Promise<{ timeMs: number | null; sizeBytes: number | null }> => {
    let timeMs: number | null = null;
    let sizeBytes: number | null = null;
    try {
        const info: any = await FileSystem.getInfoAsync(uri);
        if (info && info.exists) {
            if (info.modificationTime) timeMs = info.modificationTime > 1e12 ? info.modificationTime : info.modificationTime * 1000;
            if (typeof info.size === 'number') sizeBytes = info.size;
        }
    } catch (_) {}
    if ((timeMs === null || sizeBytes === null) && uri.startsWith('content://') && typeof ExpoFile !== 'undefined') {
        try {
            const ef: any = new ExpoFile(uri);
            if (timeMs === null && ef.modificationTime) timeMs = ef.modificationTime > 1e12 ? ef.modificationTime : ef.modificationTime * 1000;
            if (sizeBytes === null && typeof ef.size === 'number') sizeBytes = ef.size;
        } catch (_) {}
    }
    return { timeMs, sizeBytes };
};

export interface FolderEntry {
    uri: string;
    /** Decoded file name (no folder) */
    name: string;
    modifiedMs: number | null;
    sizeBytes: number | null;
}

const decodedBaseName = (uri: string): string => {
    let decoded = uri;
    try { decoded = decodeURIComponent(uri); } catch (_) {}
    return decoded.split('/').pop()?.split(':').pop() || uri;
};

/**
 * Audio files of the mapped folder (and its direct subfolders). Uses the native DocumentsContract listing,
 * which returns last-modified and size in one query per folder; falls back to the SAF listing without
 * metadata (`withMeta: false`) when the native method isn't available.
 */
export const listMappedFolderEntries = async (folderUri?: string | null): Promise<{ entries: FolderEntry[]; withMeta: boolean } | null> => {
    const uri = folderUri || (await getMappedRecordingFolder());
    if (!uri) return null;
    if (uri.startsWith('content://') && CallRecordingModule && typeof CallRecordingModule.listRecordingFolder === 'function') {
        try {
            const raw: any[] = await CallRecordingModule.listRecordingFolder(uri);
            const entries = (raw || []).map((e) => ({
                uri: String(e.uri),
                name: String(e.name || decodedBaseName(String(e.uri))),
                modifiedMs: typeof e.lastModified === 'number' && e.lastModified > 0 ? e.lastModified : null,
                sizeBytes: typeof e.size === 'number' && e.size >= 0 ? e.size : null,
            }));
            return { entries, withMeta: true };
        } catch (e: any) {
            console.warn('[recmatch] native folder listing failed, falling back to SAF listing:', e?.message || e);
        }
    }
    const info = await scanRecordingFolder(uri, true);
    if (!info || !info.accessible) return null;
    return {
        entries: info.recordingFiles.map((u) => ({ uri: u, name: decodedBaseName(u), modifiedMs: null, sizeBytes: null })),
        withMeta: false,
    };
};

// Upper bound on files whose metadata / duration is read per lookup (SAF stat is a native round trip)
const MAX_STAT_CANDIDATES = 60;
const MAX_DURATION_READS_PER_CALL = 5;

const countBy = (items: string[]) => items.reduce<Record<string, number>>((acc, k) => { acc[k] = (acc[k] || 0) + 1; return acc; }, {});

/**
 * Turns folder entries into candidates for one or more calls. The cheap prefilter and the ordering before
 * the cap live in recordingMatch.selectCandidateEntries (dialled-number files first, then files whose name
 * timestamp is in a window, then newest first by last-modified). Time/size are read only for capped files
 * that the listing didn't describe.
 */
export const buildRecordingCandidates = async (
    entries: FolderEntry[],
    calls: MatchContext[],
    consumed?: Set<string>,
    label = 'match',
    maxCandidates = MAX_STAT_CANDIDATES
): Promise<RecordingCandidate[]> => {
    const { selected, stats } = selectCandidateEntries(entries, calls, consumed, maxCandidates);

    const candidates: RecordingCandidate[] = [];
    for (const { entry: e, nameTimeMs } of selected) {
        let modifiedMs = e.modifiedMs;
        let sizeBytes = e.sizeBytes;
        if (modifiedMs === null || sizeBytes === null) {
            const stat = await statRecording(e.uri);
            modifiedMs = modifiedMs ?? stat.timeMs;
            sizeBytes = sizeBytes ?? stat.sizeBytes;
        }
        candidates.push({ uri: e.uri, name: e.name, nameTimeMs, modifiedMs, sizeBytes, timeMs: nameTimeMs ?? modifiedMs });
    }

    const dropSummary = Object.entries(stats.drops).map(([k, v]) => `${k}: ${v}`).join(', ') || 'none';
    console.log(
        `[recmatch] ${label}: ${stats.total} files; priority (number) ${stats.byNumber}, named-in-window ${stats.namedInWindow}, ` +
        `others ${stats.others}; checked ${selected.length}${stats.eligible > selected.length ? ` (capped from ${stats.eligible})` : ''}; ` +
        `dropped: ${dropSummary}`
    );
    return candidates;
};

/**
 * Reads the audio duration of the few best candidates per call (only for calls with a known connected
 * duration), so evaluateCandidate can compare it. Never reads more than MAX_DURATION_READS_PER_CALL per call.
 */
export const readTopCandidateDurations = async (calls: MatchContext[], candidates: RecordingCandidate[]) => {
    const toRead = new Set<RecordingCandidate>();
    for (const ctx of calls) {
        if (!ctx.connectedSeconds || ctx.connectedSeconds <= 0) continue;
        const scored = candidates
            .map((c) => ({ c, ev: evaluateCandidate(c, ctx) }))
            .filter((x) => x.ev.ok)
            .sort((a, b) => (a.ev as any).score - (b.ev as any).score)
            .slice(0, MAX_DURATION_READS_PER_CALL);
        scored.forEach(({ c }) => toRead.add(c));
    }
    for (const c of toRead) {
        if (c.durationSec === undefined || c.durationSec === null) {
            c.durationSec = await getAudioDurationSec(c.uri);
        }
    }
};

/** Logs an assignment result with [recmatch] (names masked). */
export const logAssignment = (label: string, result: AssignmentResult, candidates: RecordingCandidate[]) => {
    for (const [key, a] of result.byCall) {
        const rej = result.rejections.filter((r) => r.callKey === key);
        const reasons = Object.entries(countBy(rej.map((r) => r.reason))).map(([k, v]) => `${k}: ${v}`).join(', ') || 'none';
        const examples = rej.slice(0, 5).map((r) => `${maskName(r.name)}=${r.reason}`).join('; ');
        if (a.file) {
            const d = a.file.durationSec ? `, ${a.file.durationSec}s audio` : '';
            console.log(`[recmatch] ${label} ${key}: chose "${maskName(a.file.name)}"${d} (${a.passing} passing of ${candidates.length}); rejected: ${reasons}${examples ? ` [${examples}]` : ''}`);
        } else {
            console.log(`[recmatch] ${label} ${key}: no file (${a.reason}, ${a.passing} passing of ${candidates.length}); rejected: ${reasons}${examples ? ` [${examples}]` : ''}`);
        }
    }
};

/**
 * Matches files of the mapped folder to one or more calls of this phone jointly (FIX 4 rules:
 * one file per call, one call per file, ambiguous -> nothing). Each call's `reserved` must already
 * exclude that call's own reservation. Returns the assignment, or null if the folder can't be read.
 */
export const matchMappedFolderRecordings = async (
    calls: MatchContext[],
    consumed?: Set<string>,
    label = 'match'
): Promise<AssignmentResult | null> => {
    if (calls.length === 0) return { byCall: new Map(), rejections: [] };
    const listing = await listMappedFolderEntries();
    if (!listing) {
        console.log(`[recmatch] ${label}: mapped folder not set or not readable`);
        return null;
    }
    const cap = Math.min(MAX_STAT_CANDIDATES * Math.max(1, calls.length), 200);
    const candidates = await buildRecordingCandidates(listing.entries, calls, consumed, label, cap);
    await readTopCandidateDurations(calls, candidates);
    const result = assignRecordings(calls, candidates);
    logAssignment(label, result, candidates);
    return result;
};

/**
 * Finds the phone's own call recording for a call in the mapped SAF folder.
 * Rules live in recordingMatch (evaluateCandidate / assignRecordings): name time vs call start, modified
 * time vs call end, not before the previous session ended, not past the next call, not consumed or reserved
 * for another call, dialled number preferred (a different number rejected), contact-name files allowed,
 * near-empty files and duration mismatches rejected, ambiguous -> null.
 */
export const findRecentRecordingInMappedFolder = async (
    phoneNumber: string,
    callStartTimeMs: number,
    callEndTimeMs: number = Date.now(),
    consumedSet?: Set<string>,
    // Previous-session boundary to use instead of lastCallSessionEndTimeMs. Pass it when calling this after
    // stopNativeRecording(), which has already moved lastCallSessionEndTimeMs to the end of the current call.
    sessionFloorMs?: number,
    connectedSeconds?: number,
    opts: { reserved?: Set<string>; nextCallStartMs?: number; label?: string } = {}
): Promise<string | null> => {
    try {
        const target = last10Digits(phoneNumber);
        if (!target || target.length < 6) return null;

        const callStart = callStartTimeMs > 0 ? callStartTimeMs : callEndTimeMs - 30000;
        const ctx: MatchContext = {
            key: maskPhone(phoneNumber),
            phone: phoneNumber,
            callStartMs: callStart,
            callEndMs: callEndTimeMs,
            prevSessionEndMs: typeof sessionFloorMs === 'number' ? sessionFloorMs : lastCallSessionEndTimeMs,
            consumed: consumedSet,
            reserved: opts.reserved,
            connectedSeconds,
            nextCallStartMs: opts.nextCallStartMs,
            windowBeforeMs: WINDOW_BEFORE_MS,
            windowAfterMs: WINDOW_AFTER_MS,
        };
        const result = await matchMappedFolderRecordings([ctx], consumedSet, opts.label || 'live');
        return result?.byCall.get(ctx.key!)?.file?.uri ?? null;
    } catch (err) {
        console.warn('[CallManager] findRecentRecordingInMappedFolder error:', err);
        return null;
    }
};

export const listenToCallEvents = (onRecordingStopped: (filePath: string) => void) => {
    if (!callRecordingEmitter) return () => {};

    const sub1 = callRecordingEmitter.addListener('onRecordingStarted', (path) => {
        console.log('Native Call Recording Started:', path);
    });

    const sub2 = callRecordingEmitter.addListener('onRecordingStopped', (path) => {
        console.log('Native Call Recording Stopped:', path);
        onRecordingStopped(path);
    });

    const sub3 = callRecordingEmitter.addListener('onCallAdded', (id) => {
        console.log('Native Call Added:', id);
    });

    return () => {
        sub1.remove();
        sub2.remove();
        sub3.remove();
    };
};

export const extractDurationFromAudio = async (fileUri: string): Promise<number | null> => {
    try {
        const { Audio } = require('expo-av');
        let uri = fileUri;
        if (!uri.startsWith('file://') && !uri.startsWith('content://') && !uri.startsWith('http')) {
            uri = `file://${uri}`;
        }
        const { sound, status } = await Audio.Sound.createAsync(
            { uri },
            { shouldPlay: false }
        );
        if (status.isLoaded && status.durationMillis && status.durationMillis > 0) {
            const durationSec = Math.round(status.durationMillis / 1000);
            await sound.unloadAsync();
            return durationSec;
        }
    } catch (err) {
        console.log('[CallManager] Failed to read audio file duration:', err);
    }
    return null;
};
