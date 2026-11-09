import { Platform, Alert, NativeModules, NativeEventEmitter, PermissionsAndroid, Permission } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Directory, File as ExpoFile } from 'expo-file-system';

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

/**
 * Extracts a timestamp (ms) from common OEM call recording filenames if encoded in the name:
 * e.g. Call_9876543210_20261109_143022.m4a, Rec_2026-11-09_14-30-22.m4a, or 13-digit epoch ms.
 */
export const extractTimestampFromFileName = (fileName: string): number | null => {
    if (!fileName) return null;
    // 1. Check 13-digit epoch ms (e.g., 1762678000000)
    const epochMatch = fileName.match(/(?:^|[^\d])(1[6-9]\d{11})(?:[^\d]|$)/);
    if (epochMatch) {
        const ts = Number(epochMatch[1]);
        if (!isNaN(ts) && ts > 1600000000000) return ts;
    }
    // 2. Check YYYY[-_.]?MM[-_.]?DD[-_.\s]+HH[-_.]?mm[-_.]?ss
    const dateMatch = fileName.match(/(20\d{2})[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])[-_.\sT]+([01]\d|2[0-3])[-_.]?([0-5]\d)[-_.]?([0-5]\d)/);
    if (dateMatch) {
        const [, year, month, day, hour, min, sec] = dateMatch;
        const parsed = new Date(
            Number(year),
            Number(month) - 1,
            Number(day),
            Number(hour),
            Number(min),
            Number(sec)
        ).getTime();
        if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return null;
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

export const cancelNativeRecording = async () => {
    markCallSessionEnded(Date.now());
    if (!CallRecordingModule) return null;
    try {
        if (typeof CallRecordingModule.cancelRecording === 'function') {
            await CallRecordingModule.cancelRecording();
            return null;
        }
        await CallRecordingModule.stopRecording();
        return null;
    } catch (e) {
        console.warn('[CallManager] cancelNativeRecording error:', e);
        return null;
    }
};

export const stopNativeRecording = async () => {
    if (!CallRecordingModule) {
        markCallSessionEnded(Date.now());
        return null;
    }
    try {
        const filePath = await CallRecordingModule.stopRecording();
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

export const getLatestCallLogDuration = async (
    phoneNumber?: string,
    startTimeMs?: number,
    direction?: string
): Promise<number | null> => {
    if (Platform.OS !== 'android' || !CallRecordingModule || !CallRecordingModule.getLatestCallLogDuration) {
        return null;
    }
    try {
        // Ensure startTimeMs is never earlier than the end of the previous call session
        const rawStart = startTimeMs || 0;
        const effectiveStartMs = rawStart > 0 ? Math.max(rawStart, lastCallSessionEndTimeMs) : lastCallSessionEndTimeMs;
        const dur = await CallRecordingModule.getLatestCallLogDuration(
            phoneNumber || "",
            effectiveStartMs,
            direction || "INCOMING"
        );
        if (typeof dur === 'number' && !isNaN(dur) && dur >= 0) {
            return dur;
        }
        return null;
    } catch (e) {
        console.warn('[CallManager] getLatestCallLogDuration error:', e);
        return null;
    }
};

/**
 * Fast, non-blocking lookup in the mapped SAF folder for a recording belonging strictly
 * to the current connected call session [max(callStartTimeMs - 2000, prevCallEnd), callEndTimeMs + 15000].
 * Pre-filters filenames in JS memory before querying native file metadata on 1-2 matches.
 */
export const findRecentRecordingInMappedFolder = async (
    phoneNumber: string,
    callStartTimeMs: number,
    callEndTimeMs: number = Date.now(),
    consumedSet?: Set<string>
): Promise<string | null> => {
    try {
        const cleanTarget = (phoneNumber || '').replace(/\D/g, '').slice(-10);
        if (!cleanTarget || cleanTarget.length < 6) return null;

        const minValidTime = Math.max(
            callStartTimeMs > 0 ? callStartTimeMs - 2000 : callEndTimeMs - 30000,
            lastCallSessionEndTimeMs
        );
        const maxValidTime = callEndTimeMs + 15000;

        const folderInfo = await scanRecordingFolder(undefined, true);
        if (!folderInfo || !folderInfo.accessible || folderInfo.recordingFiles.length === 0) {
            return null;
        }

        // Pre-filter in JS memory first (O(N) string check, 0 native bridge calls)
        const matchingCandidates: { uri: string; fileName: string; nameTs: number | null }[] = [];
        for (const fileUri of folderInfo.recordingFiles) {
            const decoded = decodeURIComponent(fileUri);
            const fileName = decoded.split('/').pop()?.split(':').pop() || fileUri;
            if (consumedSet && (consumedSet.has(fileUri) || consumedSet.has(fileName))) continue;

            // Reject if filename contains a different 10-digit phone number
            const otherMatch = fileName.match(/(?:\+?91|0)?([6-9]\d{9})/);
            if (otherMatch && otherMatch[1] !== cleanTarget) continue;

            const cleanDigits = fileName.replace(/\D/g, '');
            const isPhoneMatch = cleanDigits.includes(cleanTarget) || fileName.includes(cleanTarget);
            if (!isPhoneMatch) continue;

            const nameTs = extractTimestampFromFileName(fileName);
            if (nameTs && (nameTs < minValidTime || nameTs > maxValidTime)) {
                continue;
            }
            matchingCandidates.push({ uri: fileUri, fileName, nameTs });
        }

        if (matchingCandidates.length === 0) return null;

        let bestUri: string | null = null;
        let bestTime = minValidTime;

        for (const cand of matchingCandidates) {
            let fileTime = cand.nameTs || 0;
            if (!fileTime) {
                try {
                    const info = await FileSystem.getInfoAsync(cand.uri);
                    if (info && info.exists && info.modificationTime) {
                        fileTime = info.modificationTime > 1e12 ? info.modificationTime : info.modificationTime * 1000;
                    }
                } catch (_) {}
            }
            if (!fileTime && cand.uri.startsWith('content://') && typeof ExpoFile !== 'undefined') {
                try {
                    const ef = new ExpoFile(cand.uri);
                    if (ef.modificationTime) {
                        fileTime = ef.modificationTime > 1e12 ? ef.modificationTime : ef.modificationTime * 1000;
                    }
                } catch (_) {}
            }

            if (fileTime >= minValidTime && fileTime <= maxValidTime && fileTime >= bestTime) {
                bestTime = fileTime;
                bestUri = cand.uri;
            }
        }

        return bestUri;
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
