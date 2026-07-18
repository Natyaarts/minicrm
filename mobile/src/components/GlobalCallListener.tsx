import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, Platform, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { listenToCallState, startNativeRecording, stopNativeRecording } from '../utils/CallManager';
import client from '../api/client';
import * as DocumentPicker from 'expo-document-picker';
import DateTimePicker from '@react-native-community/datetimepicker';

export default function GlobalCallListener() {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [displayPhone, setDisplayPhone] = useState('');
  const [callDuration, setCallDuration] = useState(0);
  const [recordedFilePath, setRecordedFilePath] = useState<string | null>(null);
  
  const [leadInfo, setLeadInfo] = useState<any>(null); 
  const [loadingLead, setLoadingLead] = useState(false);
  
  const [pipelineStages, setPipelineStages] = useState<any[]>([]);
  const [pipelineStatus, setPipelineStatus] = useState('');
  const [postCallNotes, setPostCallNotes] = useState('');
  const [nextFollowupDate, setNextFollowupDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [manualRecordingFile, setManualRecordingFile] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Refs for background state tracking
  const isIncomingRef = useRef(false);
  const incomingPhoneRef = useRef<string | null>(null);
  const callStartTimeRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchPipelineStages();

    const unsubscribe = listenToCallState(async (event) => {
      console.log('GlobalCallListener State Event:', event);
      const { state, phoneNumber } = event;

      if (state === 'RINGING') {
        // Strictly an incoming call
        isIncomingRef.current = true;
        incomingPhoneRef.current = phoneNumber;
        setDisplayPhone(phoneNumber);
        
        // Pre-fetch lead info if we have a number
        if (phoneNumber) {
          fetchLeadInfo(phoneNumber);
        }
      } 
      else if (state === 'OFFHOOK') {
        // Did an incoming call just get answered?
        if (isIncomingRef.current) {
          callStartTimeRef.current = Date.now();
          startTimer();
          
          if (Platform.OS === 'android') {
            const path = await startNativeRecording(incomingPhoneRef.current || "");
            console.log("Global incoming call recording fallback:", path);
          }
        }
      } 
      else if (state === 'IDLE') {
        // If an incoming call just ended (either answered or missed)
        if (isIncomingRef.current) {
          stopTimer();
          
          if (Platform.OS === 'android') {
            const path = await stopNativeRecording();
            if (path) setRecordedFilePath(path);
          }
          
          // Show the popup
          setIsModalVisible(true);
        }
        
        // Reset tracking refs (except displayPhone which the modal needs)
        isIncomingRef.current = false;
        callStartTimeRef.current = null;
        incomingPhoneRef.current = null;
      }
    });

    return () => {
      unsubscribe();
      stopTimer();
    };
  }, []);

  const fetchPipelineStages = async () => {
    try {
      const res = await client.get('/crm/stages/');
      const data = res.data?.results || res.data || [];
      if (data.length > 0) {
        setPipelineStages(data);
        setPipelineStatus(data[0]?.id || '');
      }
    } catch (e) {
      console.log('Failed to fetch pipeline stages:', e);
    }
  };

  const fetchLeadInfo = async (phone: string) => {
    setLoadingLead(true);
    try {
      // Clean phone to search
      const cleanPhone = phone.replace(/\D/g, '').slice(-10); // get last 10 digits
      const res = await client.get('/core/students/', { params: { search: cleanPhone } });
      const data = res.data?.results || res.data || [];
      
      if (data.length > 0) {
        setLeadInfo(data[0]); // match found!
      } else {
        setLeadInfo(null); // Unknown caller
      }
    } catch (err) {
      console.log('Failed to find lead globally:', err);
      setLeadInfo(null);
    } finally {
      setLoadingLead(false);
    }
  };

  const startTimer = () => {
    setCallDuration(0);
    timerRef.current = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleSaveCall = async () => {
    // If unknown lead, maybe block or create a lead?
    if (!leadInfo?.id) {
      Alert.alert(
        'Unknown Caller', 
        'This number is not in your CRM. Do you want to save it as a new Lead first?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Ignore Call', onPress: resetModal },
          { text: 'Create Lead (Coming Soon)', onPress: () => console.log('Feature pending') }
        ]
      );
      return;
    }

    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('student', leadInfo.id.toString());
      formData.append('interaction_type', 'CALL');
      formData.append('call_duration', callDuration.toString());
      formData.append('call_direction', 'INCOMING');
      
      // Determine if answered based on duration
      const status = callDuration > 0 ? 'CONNECTED' : 'MISSED';
      formData.append('call_status', status);

      formData.append('notes', `Incoming Call - Duration: ${formatDuration(callDuration)}\nNotes: ${postCallNotes}`);
      if (pipelineStatus) formData.append('pipeline_status', pipelineStatus);
      if (nextFollowupDate) {
        formData.append('next_followup_date', nextFollowupDate.toISOString());
      }

      if (recordedFilePath) {
        let finalUri = recordedFilePath;
        if (!finalUri.startsWith('file://') && !finalUri.startsWith('content://')) {
          finalUri = `file://${finalUri}`;
        }
        
        const extMatch = finalUri.match(/\.([a-zA-Z0-9]+)$/);
        const ext = extMatch ? extMatch[1].toLowerCase() : 'm4a';
        let mimeType = 'audio/m4a';
        if (ext === 'mp3') mimeType = 'audio/mpeg';
        else if (ext === 'wav') mimeType = 'audio/wav';
        else if (ext === 'amr') mimeType = 'audio/amr';
        else if (ext === 'aac') mimeType = 'audio/aac';
        
        formData.append('audio_recording', {
          uri: finalUri,
          type: mimeType,
          name: `incoming_record_${Date.now()}.${ext}`
        } as any);
      } else if (manualRecordingFile) {
        formData.append('audio_recording', {
          uri: manualRecordingFile.uri,
          type: manualRecordingFile.mimeType || 'audio/mpeg',
          name: manualRecordingFile.name || `record_${Date.now()}.mp3`
        } as any);
      }

      await client.post('/crm/interactions/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      Alert.alert('✅ Saved', 'Incoming call logged successfully.');
      resetModal();
    } catch (error: any) {
      console.error('Failed to upload incoming call log:', error?.response?.data || error);
      const errorMsg = error?.response?.data ? JSON.stringify(error.response.data) : error.message;
      Alert.alert('Error', `Failed to save call log.\nDetails: ${errorMsg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetModal = () => {
    setIsModalVisible(false);
    setPostCallNotes('');
    setRecordedFilePath(null);
    setManualRecordingFile(null);
    setNextFollowupDate(null);
    setLeadInfo(null);
    setDisplayPhone('');
    setCallDuration(0);
  };

  const pickRecordingFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets[0]) {
        setManualRecordingFile(result.assets[0]);
      }
    } catch (err) {
      console.log('Failed to pick recording:', err);
    }
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  if (!isModalVisible) return null;

  return (
    <Modal visible={isModalVisible} animationType="slide" transparent={false} presentationStyle="pageSheet">
      <View style={styles.header}>
        <Text style={styles.headerText}>Incoming Call Review</Text>
      </View>
      
      <ScrollView style={styles.content}>
        {loadingLead ? (
          <Text style={styles.leadMatchText}>Looking up caller in CRM...</Text>
        ) : leadInfo ? (
          <View style={styles.leadMatchBox}>
            <Ionicons name="person" size={16} color="#3182CE" />
            <Text style={styles.leadMatchText}>Lead Match: <Text style={{fontWeight: 'bold'}}>{leadInfo.first_name} {leadInfo.last_name}</Text></Text>
          </View>
        ) : (
          <View style={[styles.leadMatchBox, { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' }]}>
            <Ionicons name="help-circle" size={16} color="#EF4444" />
            <Text style={[styles.leadMatchText, { color: '#B91C1C' }]}>Unknown Caller: {displayPhone || "Hidden Number"}</Text>
          </View>
        )}

        <Text style={styles.durationText}>
          Duration: <Text style={{ fontWeight: 'bold', color: '#1A202C' }}>{formatDuration(callDuration)}</Text>
        </Text>

        {leadInfo && (
          <>
            <Text style={styles.label}>Update Lead Stage</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stageScroll}>
              <View style={styles.stageContainer}>
                {pipelineStages.map(stage => (
                  <TouchableOpacity 
                    key={stage.id} 
                    onPress={() => setPipelineStatus(stage.id)}
                    style={[styles.stageBadge, pipelineStatus === stage.id && styles.stageBadgeActive]}
                  >
                    <Text style={[styles.stageText, pipelineStatus === stage.id && styles.stageTextActive]}>
                      {stage.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={styles.label}>Call Notes</Text>
            <TextInput
              style={styles.input}
              placeholder="What did they call about?"
              placeholderTextColor="#A0AEC0"
              multiline
              value={postCallNotes}
              onChangeText={setPostCallNotes}
            />

            <Text style={styles.label}>Next Follow-up Date</Text>
            <TouchableOpacity onPress={() => setShowDatePicker(true)} style={styles.datePickerBtn}>
              <Ionicons name="calendar-outline" size={18} color="#3182CE" />
              <Text style={{ color: nextFollowupDate ? '#1A202C' : '#A0AEC0', fontSize: 14 }}>
                {nextFollowupDate ? nextFollowupDate.toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Tap to set follow-up'}
              </Text>
              {nextFollowupDate && (
                <TouchableOpacity onPress={() => setNextFollowupDate(null)} style={{ marginLeft: 'auto' }}>
                  <Ionicons name="close-circle" size={18} color="#EF4444" />
                </TouchableOpacity>
              )}
            </TouchableOpacity>

            {showDatePicker && (
              <DateTimePicker
                value={nextFollowupDate || new Date()}
                mode="datetime"
                minimumDate={new Date()}
                onChange={(event, selectedDate) => {
                  setShowDatePicker(Platform.OS === 'ios');
                  if (event.type === 'set' && selectedDate) setNextFollowupDate(selectedDate);
                }}
              />
            )}
          </>
        )}

        <Text style={[styles.label, { marginTop: 20 }]}>Call Recording</Text>
        {(recordedFilePath || manualRecordingFile) ? (
          <View style={styles.recordingSuccessBox}>
            <Ionicons name="checkmark-circle" size={20} color="#38A169" />
            <Text style={{ color: '#276749', fontSize: 13, flex: 1 }} numberOfLines={1}>
              {recordedFilePath ? `Auto-recorded: ${recordedFilePath.split('/').pop()} ✅` : manualRecordingFile?.name}
            </Text>
            <TouchableOpacity onPress={() => { setRecordedFilePath(null); setManualRecordingFile(null); }}>
              <Ionicons name="trash-outline" size={18} color="#EF4444" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={pickRecordingFile} style={styles.uploadBtn}>
            <Ionicons name="cloud-upload-outline" size={20} color="#3182CE" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#3182CE', fontWeight: '700', fontSize: 13 }}>Upload Call Recording</Text>
              <Text style={{ color: '#718096', fontSize: 11, marginTop: 2 }}>Audio not found automatically</Text>
            </View>
          </TouchableOpacity>
        )}

        {leadInfo ? (
          <TouchableOpacity 
            style={[styles.saveBtn, isSubmitting && { backgroundColor: '#A0AEC0' }]} 
            onPress={handleSaveCall}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ActivityIndicator color="#FFF" size="small" />
                <Text style={styles.saveBtnText}>Saving & Uploading...</Text>
              </View>
            ) : (
              <Text style={styles.saveBtnText}>Save & Upload Log</Text>
            )}
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity style={styles.discardBtn} onPress={resetModal}>
          <Text style={styles.discardBtnText}>Dismiss</Text>
        </TouchableOpacity>
        
        <View style={{height: 60}} />
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
    paddingBottom: 20,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1A202C',
  },
  content: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
  },
  leadMatchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EBF8FF',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BEE3F8',
    marginBottom: 16,
  },
  leadMatchText: {
    color: '#2B6CB0',
    fontSize: 14,
  },
  durationText: {
    fontSize: 16,
    color: '#718096',
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4A5568',
    marginBottom: 10,
  },
  stageScroll: {
    marginBottom: 20,
  },
  stageContainer: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 4,
  },
  stageBadge: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#EBF8FF',
  },
  stageBadgeActive: {
    backgroundColor: '#3182CE',
  },
  stageText: {
    color: '#3182CE',
    fontWeight: 'bold',
    fontSize: 12,
  },
  stageTextActive: {
    color: '#FFF',
  },
  input: {
    backgroundColor: '#F7FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 12,
    height: 100,
    textAlignVertical: 'top',
    color: '#1A202C',
    marginBottom: 20,
  },
  datePickerBtn: {
    backgroundColor: '#F7FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  recordingSuccessBox: {
    backgroundColor: '#F0FFF4',
    borderWidth: 1,
    borderColor: '#9AE6B4',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  uploadBtn: {
    backgroundColor: '#EBF8FF',
    borderWidth: 1,
    borderColor: '#BEE3F8',
    borderRadius: 8,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  saveBtn: {
    backgroundColor: '#10B981',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 40,
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  discardBtn: {
    backgroundColor: '#F1F5F9',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  discardBtnText: {
    color: '#475569',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
