import * as FileSystem from 'expo-file-system';
import client from '../api/client';

export const syncMissingRecordings = async () => {
  try {
    console.log('[SyncManager] Starting background sync check for missing call recordings...');
    
    // 1. Fetch recent call interactions
    const res = await client.get('/crm/interactions/');
    const interactions = res.data.results || res.data || [];
    
    // Filter for CALL interactions that are missing audio
    const missingAudioCalls = interactions.filter((item: any) => {
      return item.interaction_type === 'CALL' && (!item.audio_recording || item.audio_recording === '');
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
      const studentPhone = call.student_phone?.replace(/\D/g, '').slice(-10); // last 10 digits
      const callTime = new Date(call.date).getTime();
      
      // Find a matching file in the cache
      let bestMatchingFile: string | null = null;
      let minDiff = 300000; // 5 minutes max tolerance
      
      for (const fileName of files) {
        // Check if the file is a recording
        if (fileName.includes('fallback_recording') || fileName.includes('saf_recorded') || fileName.includes('incoming_record') || fileName.includes('record')) {
          const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
          try {
            const fileInfo = await FileSystem.getInfoAsync(fileUri);
            
            if (fileInfo.exists) {
              // Match by phone number if present in filename
              const cleanFileName = fileName.replace(/\D/g, '');
              const hasPhoneMatch = studentPhone && cleanFileName.includes(studentPhone);
              
              // Match by creation/modification time
              const fileTime = fileInfo.modificationTime ? fileInfo.modificationTime * 1000 : 0;
              const timeDiff = Math.abs(fileTime - callTime);
              
              if (hasPhoneMatch || timeDiff < minDiff) {
                bestMatchingFile = fileUri;
                minDiff = timeDiff;
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
          name: `sync_record_${call.id}_${Date.now()}.${ext}`
        } as any);
        
        // Upload via PATCH
        await client.patch(`/crm/interactions/${call.id}/`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        
        console.log(`[SyncManager] Successfully uploaded missing recording for call ID ${call.id}`);
      } else {
        console.log(`[SyncManager] No matching local recording found for call ID ${call.id}`);
      }
    }
  } catch (err) {
    console.error('[SyncManager] Error in background sync:', err);
  }
};
