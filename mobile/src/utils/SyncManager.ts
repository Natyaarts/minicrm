import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';

const PENDING_CALLS_STORAGE_KEY = '@pending_call_queue';

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
        const formData = new FormData();
        if (item.student && item.student !== '0') formData.append('student', String(item.student));
        formData.append('interaction_type', 'CALL');
        formData.append('mobile_call_id', item.mobile_call_id);
        if (item.customer_number) formData.append('customer_number', item.customer_number);
        if (item.caller_number) formData.append('caller_number', item.caller_number);
        if (item.receiver_number) formData.append('receiver_number', item.receiver_number);
        formData.append('call_direction', item.call_direction || 'OUTGOING');
        formData.append('call_status', item.call_status || 'CONNECTED');
        formData.append('call_duration', String(item.call_duration || 0));
        formData.append('notes', item.notes || `Call Logged via Mobile Sync (${item.call_direction || 'OUTGOING'})`);
        if (item.pipeline_status) formData.append('pipeline_status', String(item.pipeline_status));
        if (item.next_followup_date) formData.append('next_followup_date', item.next_followup_date);

        if (item.recordedFilePath) {
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

/**
 * Scans local storage cache for audio recordings and links them to interactions missing recordings.
 */
export const syncMissingRecordings = async () => {
  try {
    // Also sync pending queued calls first
    await syncPendingCalls();

    console.log('[SyncManager] Starting background sync check for missing call recordings...');
    
    // 1. Fetch recent call interactions
    const res = await client.get('/crm/interactions/');
    const interactions = res.data.results || res.data || [];
    
    // Filter for CALL interactions that are missing audio
    const missingAudioCalls = interactions.filter((item: any) => {
      return item.interaction_type === 'CALL' && (!item.audio_recording || item.audio_recording === '') && (!item.recording_url || item.recording_url === '');
    });
    
    if (missingAudioCalls.length === 0) {
      console.log('[SyncManager] No missing audio recordings found.');
      return;
    }
    
    console.log(`[SyncManager] Found ${missingAudioCalls.length} calls missing audio recordings.`);
    
    // 2. Scan the app's cache directory
    if (!FileSystem.cacheDirectory) return;
    const files = await FileSystem.readDirectoryAsync(FileSystem.cacheDirectory);
    
    for (const call of missingAudioCalls) {
      const targetPhone = (call.student_phone || call.customer_number || call.caller_number || call.receiver_number || '').replace(/\D/g, '').slice(-10);
      const callTime = new Date(call.date).getTime();
      
      // Find a matching file in the cache with strict phone/call identity
      let bestMatchingFile: string | null = null;
      let minDiff = 1800000; // 30 minutes max tolerance for phone-matched files
      
      for (const fileName of files) {
        // Check if the file is a recording
        if (fileName.includes('fallback_recording') || fileName.includes('saf_recorded') || fileName.includes('incoming_record') || fileName.includes('recorded_call') || fileName.includes('offline_rec') || fileName.includes('record')) {
          const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
          try {
            const fileInfo = await FileSystem.getInfoAsync(fileUri);
            
            if (fileInfo.exists) {
              // Extract normalized digits from filename
              const cleanFileName = fileName.replace(/\D/g, '');
              const hasPhoneMatch = Boolean(targetPhone && targetPhone.length >= 6 && cleanFileName.includes(targetPhone));
              const hasCallIdMatch = Boolean(call.mobile_call_id && fileName.includes(call.mobile_call_id));
              
              // Strictly require phone number or call ID match.
              // Never attach an unrelated recording based merely on a broad timestamp window.
              if (hasPhoneMatch || hasCallIdMatch) {
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
        
        // Upload via PATCH (preserves call_duration in backend)
        await client.patch(`/crm/interactions/${call.id}/`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        
        console.log(`[SyncManager] Successfully uploaded missing recording for call ID ${call.id}`);
      } else {
        console.log(`[SyncManager] No matching local recording found for call ID ${call.id} (left unassigned safely)`);
      }
    }
  } catch (err) {
    console.error('[SyncManager] Error in background sync:', err);
  }
};
