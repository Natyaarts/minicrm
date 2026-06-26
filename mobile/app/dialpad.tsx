import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Dimensions, Platform, Linking, Alert, NativeModules, TextInput, ScrollView, ActivityIndicator, AppState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { startNativeRecording, stopNativeRecording, listenToCallEvents, requestCallPermissions, listenToCallState } from '../src/utils/CallManager';
import * as DocumentPicker from 'expo-document-picker';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import client from '../src/api/client';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');

const Dialpad = () => {
  const { leadId, phone } = useLocalSearchParams();
  const [phoneNumber, setPhoneNumber] = useState((phone as string) || '');
  const [callStatus, setCallStatus] = useState<'IDLE' | 'CALLING' | 'ACTIVE' | 'POST_CALL'>('IDLE');
  const [callDuration, setCallDuration] = useState(0);
  const [postCallNotes, setPostCallNotes] = useState('');
  const [pipelineStatus, setPipelineStatus] = useState('');
  const [recordedFilePath, setRecordedFilePath] = useState<string | null>(null);
  const [manualRecordingFile, setManualRecordingFile] = useState<any>(null); // manually picked file
  const [nextFollowupDate, setNextFollowupDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isProcessingRecording, setIsProcessingRecording] = useState(false);

  // Dynamic pipeline stages from web backend
  const [pipelineStages, setPipelineStages] = useState<any[]>([
    { id: 'NEW', name: 'New Lead' },
    { id: 'FOLLOW_UP', name: 'Follow Up' },
    { id: 'PAYMENT_PENDING', name: 'Payment Pending' },
    { id: 'ENROLLED', name: 'Enrolled' },
    { id: 'DROPPED', name: 'Dropped' },
  ]);

  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // New Tab View State: 'dialer' or 'history'
  const [activeTab, setActiveTab] = useState<'dialer' | 'history'>('dialer');
  const [recentCalls, setRecentCalls] = useState<any[]>([]);
  const [loadingCalls, setLoadingCalls] = useState(false);

  // Use refs to keep track of current state for asynchronous listeners
  const phoneRef = useRef(phoneNumber);
  const callStatusRef = useRef(callStatus);
  const callStartTimeRef = useRef<number>(0);

  useEffect(() => {
    phoneRef.current = phoneNumber;
  }, [phoneNumber]);

  useEffect(() => {
    callStatusRef.current = callStatus;
  }, [callStatus]);

  useEffect(() => {
    loadUser();
    fetchPipelineStages();
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

  const loadUser = async () => {
    try {
      const cached = await AsyncStorage.getItem('userInfo');
      if (cached) {
        setUser(JSON.parse(cached));
      }
      const res = await client.get('/auth/me/');
      if (res.data) {
        setUser(res.data);
        await AsyncStorage.setItem('userInfo', JSON.stringify(res.data));
      }
    } catch (err) {
      console.log('Failed to fetch user details in Dialpad:', err);
    } finally {
      setAuthLoading(false);
    }
  };

  const fetchRecentCalls = async () => {
    setLoadingCalls(true);
    try {
      const res = await client.get('/crm/interactions/', {
        params: { interaction_type: 'CALL' }
      });
      const data = res.data?.results || res.data || [];
      const filtered = data.filter((item: any) => item.interaction_type === 'CALL');
      setRecentCalls(filtered);
    } catch (err) {
      console.log('Failed to fetch recent calls:', err);
    } finally {
      setLoadingCalls(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'history') {
      fetchRecentCalls();
    }
  }, [activeTab]);

  const hasDialerAccess = user?.role === 'SALES' || user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  useEffect(() => {
    let interval: any;
    if (callStatus === 'ACTIVE') {
      // If we don't have a start time yet (e.g. manual dial), set it now
      if (callStartTimeRef.current === 0) {
        callStartTimeRef.current = Date.now();
      }
      interval = setInterval(() => {
        setCallDuration(Math.floor((Date.now() - callStartTimeRef.current) / 1000));
      }, 1000);
    } else if (callStatus === 'IDLE') {
      // Only reset when returning to idle — preserve duration for POST_CALL review
      setCallDuration(0);
      callStartTimeRef.current = 0;
    }
    return () => clearInterval(interval);
  }, [callStatus]);

  useEffect(() => {
    // AppState listener removed because it was causing premature call terminations
    // when the system dialer was a floating window or when the app briefly regained focus.
    // The call state should rely on the native BroadcastReceiver or manual user action.
  }, []);

  useEffect(() => {
    if (authLoading || !hasDialerAccess) return;
    const requestPermissions = async () => {
      if (Platform.OS === 'android') {
        const granted = await requestCallPermissions();
        if (!granted) {
          Alert.alert(
            'Permissions Required',
            'Please grant Phone State, Call Log, and Microphone permissions to enable automatic call logging.'
          );
        }
      }
    };
    requestPermissions();
  }, [authLoading, hasDialerAccess]);

  useEffect(() => {
    if (authLoading || !hasDialerAccess) return;

    // 1. Listen for events from our Kotlin MediaStore sync (which runs after stopRecording)
    const unsubscribeEvents = listenToCallEvents(async (path) => {
      console.log("Recording saved at:", path);
      if (path) {
        setRecordedFilePath(path);
      }
    });

    // 2. Listen for phone state changes from native BroadcastReceiver
    let callStarted = false;
    const unsubscribeState = listenToCallState(async (event) => {
      console.log("Call State Event received in JS:", event);
      const { state } = event;

      // Only process OFFHOOK if we explicitly initiated this call via the dialpad
      if (state === 'OFFHOOK') {
        if (callStatusRef.current === 'CALLING' || callStatusRef.current === 'ACTIVE') {
          callStarted = true;
          callStartTimeRef.current = Date.now();
          setCallStatus('ACTIVE');
          // Automatically start recording when call is active
          const filePath = await startNativeRecording(phoneRef.current);
          console.log("Call auto-started recording. Fallback path:", filePath);
        }
      } else if (state === 'IDLE') {
        if (callStarted) {
          callStarted = false;
          const elapsed = Math.max(0, Math.floor((Date.now() - callStartTimeRef.current) / 1000));
          setCallDuration(elapsed);
          setCallStatus('POST_CALL');
          setIsProcessingRecording(true);
          // Automatically stop recording when call hangs up
          const filePath = await stopNativeRecording();
          if (filePath) {
            console.log("Call auto-stopped recording. Path:", filePath);
            setRecordedFilePath(filePath);
          }
          setIsProcessingRecording(false);
        }
      }
    });

    return () => {
      unsubscribeEvents();
      unsubscribeState();
    };
  }, [authLoading, hasDialerAccess]);

  if (authLoading) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#3182CE" />
      </SafeAreaView>
    );
  }

  if (!hasDialerAccess) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 20 }]}>
        <Ionicons name="lock-closed" size={48} color="#A0AEC0" style={{ marginBottom: 16 }} />
        <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1A202C', marginBottom: 8 }}>Restricted Access</Text>
        <Text style={{ fontSize: 14, color: '#718096', textAlign: 'center', lineHeight: 20 }}>
          You do not have permission to access the recorded Dialpad.
        </Text>
      </SafeAreaView>
    );
  }

  const handlePress = (num: string) => {
    setPhoneNumber((prev) => prev + num);
  };

  const handleBackspace = () => {
    setPhoneNumber((prev) => prev.slice(0, -1));
  };

  const handleCall = async () => {
    if (!phoneNumber) return;

    // Clean number: strip spaces, dashes, parentheses for the tel: URL
    const cleanNumber = phoneNumber.replace(/[\s\-().]/g, '');
    if (!cleanNumber) {
      Alert.alert('Invalid Number', 'Please enter a valid phone number.');
      return;
    }

    if (Platform.OS === 'android') {
      // Request permissions (non-blocking — calling proceeds regardless)
      await requestCallPermissions();
    }

    // Launch native system dialer
    try {
      await Linking.openURL(`tel:${cleanNumber}`);
      // Only start timer immediately if we don't have the native receiver (e.g. in Expo Go)
      if (NativeModules.CallRecordingModule) {
        setCallStatus('CALLING');
      } else {
        setCallStatus('ACTIVE');
      }
    } catch (err: any) {
      Alert.alert('Call Error', 'Could not open native system dialer: ' + err.message);
      setCallStatus('IDLE');
    }
  };

  const handleEndCall = async () => {
    setCallStatus('POST_CALL');
    
    if (Platform.OS === 'android') {
      setIsProcessingRecording(true);
      const filePath = await stopNativeRecording();
      if (filePath) setRecordedFilePath(filePath);
      console.log("Stopped recording manually:", filePath);
      setIsProcessingRecording(false);
    }
  };

  const handleCancelCall = async () => {
    setCallStatus('IDLE');
    setCallDuration(0);
    setRecordedFilePath(null);
    if (Platform.OS === 'android') {
      try {
        await stopNativeRecording();
      } catch (err) {
        console.log('Error stopping recording on call cancel:', err);
      }
    }
  };

  const pickRecordingFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets[0]) {
        setManualRecordingFile(result.assets[0]);
        Alert.alert('Recording Selected', `File: ${result.assets[0].name}`);
      }
    } catch (err) {
      console.log('Failed to pick recording:', err);
    }
  };



  const handlePostCallSubmit = async () => {
    if (!leadId || leadId === '0') {
      Alert.alert('No Lead Linked', 'Call log will not be saved because no lead was selected.');
      setCallStatus('IDLE');
      setPostCallNotes('');
      setRecordedFilePath(null);
      setManualRecordingFile(null);
      setNextFollowupDate(null);
      return;
    }

    try {
      const formData = new FormData();
      formData.append('student', leadId as string);
      formData.append('interaction_type', 'CALL');
      formData.append('call_duration', callDuration.toString());
      formData.append('call_direction', 'OUTGOING');
      
      const status = callDuration > 0 ? 'CONNECTED' : 'MISSED';
      formData.append('call_status', status);

      formData.append('notes', `Duration: ${formatDuration(callDuration)}\nNotes: ${postCallNotes}`);
      if (pipelineStatus) formData.append('pipeline_status', pipelineStatus);
      if (nextFollowupDate) {
        formData.append('next_followup_date', nextFollowupDate.toISOString());
      }

      // Prefer native auto-recording, fall back to manually picked file
      if (recordedFilePath) {
        formData.append('audio_recording', {
          uri: `file://${recordedFilePath}`,
          type: 'audio/m4a',
          name: `recording_${Date.now()}.m4a`
        } as any);
      } else if (manualRecordingFile) {
        formData.append('audio_recording', {
          uri: manualRecordingFile.uri,
          type: manualRecordingFile.mimeType || 'audio/mpeg',
          name: manualRecordingFile.name || `recording_${Date.now()}.mp3`
        } as any);
      }

      await client.post('/crm/interactions/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      Alert.alert('✅ Saved', 'Call log saved to CRM successfully.');
      setCallStatus('IDLE');
      setPostCallNotes('');
      setRecordedFilePath(null);
      setManualRecordingFile(null);
      setNextFollowupDate(null);
      if (activeTab === 'history') fetchRecentCalls();
    } catch (error) {
      console.error('Failed to upload post-call log:', error);
      Alert.alert('Error', 'Failed to save call log.');
    }
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const formatPhoneNumber = (num: string) => {
    if (num.length > 3 && num.length <= 6) return `${num.slice(0, 3)}-${num.slice(3)}`;
    if (num.length > 6) return `${num.slice(0, 3)}-${num.slice(3, 6)}-${num.slice(6, 10)}`;
    return num;
  };

  if (callStatus === 'POST_CALL') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#1A202C', marginTop: 10 }}>Call Review</Text>
        </View>
        <ScrollView style={{ padding: 20 }}>
          <Text style={{ fontSize: 16, color: '#718096', marginBottom: 20 }}>
            Duration: <Text style={{ fontWeight: 'bold', color: '#1A202C' }}>{formatDuration(callDuration)}</Text>
          </Text>

          <Text style={{ fontSize: 14, fontWeight: '600', color: '#4A5568', marginBottom: 10 }}>Update Lead Stage</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', gap: 10, paddingVertical: 4 }}>
              {pipelineStages.map(stage => (
                <TouchableOpacity 
                  key={stage.id} 
                  onPress={() => setPipelineStatus(stage.id)}
                  style={{
                    paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20,
                    backgroundColor: pipelineStatus === stage.id ? '#3182CE' : '#EBF8FF',
                  }}
                >
                  <Text style={{ color: pipelineStatus === stage.id ? '#FFF' : '#3182CE', fontWeight: 'bold', fontSize: 12 }}>
                    {stage.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <Text style={{ fontSize: 14, fontWeight: '600', color: '#4A5568', marginBottom: 10 }}>Call Notes</Text>
          <TextInput
            style={{
              backgroundColor: '#F7FAFC', borderWidth: 1, borderColor: '#E2E8F0',
              borderRadius: 8, padding: 12, height: 100, textAlignVertical: 'top', color: '#1A202C'
            }}
            placeholder="Type your notes here..."
            placeholderTextColor="#A0AEC0"
            multiline
            value={postCallNotes}
            onChangeText={setPostCallNotes}
          />

          {/* ── Next Follow-up Date ── */}
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#4A5568', marginTop: 20, marginBottom: 10 }}>Next Follow-up Date</Text>
          <TouchableOpacity
            onPress={() => setShowDatePicker(true)}
            style={{
              backgroundColor: '#F7FAFC', borderWidth: 1, borderColor: '#E2E8F0',
              borderRadius: 8, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10
            }}
          >
            <Ionicons name="calendar-outline" size={18} color="#3182CE" />
            <Text style={{ color: nextFollowupDate ? '#1A202C' : '#A0AEC0', fontSize: 14 }}>
              {nextFollowupDate
                ? nextFollowupDate.toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                : 'Tap to set follow-up date & time'}
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
              display="default"
              minimumDate={new Date()}
              onChange={(event, selectedDate) => {
                // On Android, the picker closes automatically, so we must set show to false
                setShowDatePicker(Platform.OS === 'ios');
                if (event.type === 'set' && selectedDate) {
                  setNextFollowupDate(selectedDate);
                } else if (event.type === 'dismissed') {
                  setShowDatePicker(false);
                }
              }}
            />
          )}

          {/* ── Recording Upload ── */}
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#4A5568', marginTop: 20, marginBottom: 10 }}>Call Recording</Text>
          
          <View style={{ backgroundColor: '#F7FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: 10, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="information-circle-outline" size={16} color="#4A5568" />
            <Text style={{ color: '#4A5568', fontSize: 11, flex: 1 }}>
              Tip: On Android, auto-saved call recordings are usually found in <Text style={{ fontWeight: 'bold' }}>Internal Storage &gt; Record &gt; Call</Text> or <Text style={{ fontWeight: 'bold' }}>Sounds</Text> or <Text style={{ fontWeight: 'bold' }}>Recorder</Text>.
            </Text>
          </View>

          {(recordedFilePath || manualRecordingFile) ? (
            <View style={{ backgroundColor: '#F0FFF4', borderWidth: 1, borderColor: '#9AE6B4', borderRadius: 8, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="checkmark-circle" size={20} color="#38A169" />
              <Text style={{ color: '#276749', fontSize: 13, flex: 1 }} numberOfLines={1}>
                {recordedFilePath ? `Auto-recorded: ${recordedFilePath.split('/').pop() || recordedFilePath} ✅` : manualRecordingFile?.name}
              </Text>
              <TouchableOpacity onPress={() => { setRecordedFilePath(null); setManualRecordingFile(null); }}>
                <Ionicons name="trash-outline" size={18} color="#EF4444" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={pickRecordingFile}
              style={{
                backgroundColor: '#EBF8FF', borderWidth: 1, borderColor: '#BEE3F8',
                borderRadius: 8, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10
              }}
            >
              <Ionicons name="cloud-upload-outline" size={20} color="#3182CE" />
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#3182CE', fontWeight: '700', fontSize: 13 }}>Upload Call Recording</Text>
                <Text style={{ color: '#718096', fontSize: 11, marginTop: 2 }}>Pick the audio file from your phone storage</Text>
              </View>
            </TouchableOpacity>
          )}

          <TouchableOpacity 
            style={{ backgroundColor: isProcessingRecording ? '#A0AEC0' : '#10B981', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 30 }}
            onPress={handlePostCallSubmit}
            disabled={isProcessingRecording}
          >
            {isProcessingRecording ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ActivityIndicator color="#FFF" size="small" />
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>Scanning for Recording...</Text>
              </View>
            ) : (
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>Save & Upload Log</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity 
            style={{ backgroundColor: '#EF4444', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 12, marginBottom: 40 }}
            onPress={() => {
              Alert.alert(
                'Discard Call Log',
                'Are you sure you want to discard this call record? The recording and notes will not be saved.',
                [
                  { text: 'No', style: 'cancel' },
                  { 
                    text: 'Yes, Discard', 
                    style: 'destructive',
                    onPress: () => {
                      setCallStatus('IDLE');
                      setPostCallNotes('');
                      setRecordedFilePath(null);
                    }
                  }
                ]
              );
            }}
          >
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>Discard & Close</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }  if (callStatus === 'CALLING' || callStatus === 'ACTIVE') {
    return (
      <SafeAreaView style={styles.activeCallContainer}>
        <View style={styles.callHeader}>
          <Text style={styles.callingText}>Call in Progress</Text>
          <Text style={styles.activeNumberText}>{formatPhoneNumber(phoneNumber)}</Text>
          <Text style={styles.callLabel}>VIA SYSTEM PHONE APP</Text>
          {callStatus === 'ACTIVE' && (
            <Text style={{ color: '#10B981', fontSize: 22, fontWeight: '900', marginTop: 8 }}>
              {formatDuration(callDuration)}
            </Text>
          )}
          <Text style={{ color: '#94A3B8', fontSize: 13, marginTop: 8, textAlign: 'center', paddingHorizontal: 30 }}>
            Your call is active in the system phone app. Come back here when done to log the call.
          </Text>
        </View>

        <View style={styles.callActions}>
          {/* Reopen system dialer */}
          <TouchableOpacity
            style={[styles.actionButton, { paddingHorizontal: 20, width: 'auto', flexDirection: 'row', gap: 8 }]}
            onPress={() => {
              if (NativeModules.CallRecordingModule) {
                setCallStatus('CALLING');
              } else {
                setCallStatus('ACTIVE');
              }
              Linking.openURL(`tel:${phoneNumber.replace(/[\s\-().]/g, '')}`);
            }}
          >
            <Ionicons name="call" size={20} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Open Phone App</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />

          <TouchableOpacity style={styles.endCallButton} onPress={handleEndCall}>
            <Ionicons name="call" size={32} color="#fff" />
          </TouchableOpacity>
          <Text style={{ color: '#94A3B8', fontSize: 12, marginTop: 12 }}>Tap to end &amp; log call</Text>

          <TouchableOpacity 
            style={styles.cancelCallBtn}
            onPress={handleCancelCall}
          >
            <Text style={styles.cancelCallText}>Cancel / Return to Dialer</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const renderRecentCalls = () => {

    if (loadingCalls) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 40 }}>
          <ActivityIndicator size="large" color="#3182CE" />
        </View>
      );
    }

    if (recentCalls.length === 0) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }}>
          <Ionicons name="call-outline" size={48} color="#94A3B8" style={{ marginBottom: 12 }} />
          <Text style={{ fontSize: 16, color: '#64748B', fontWeight: '600' }}>No recent calls found</Text>
        </View>
      );
    }

    return (
      <ScrollView style={{ flex: 1, paddingHorizontal: 20 }}>
        {recentCalls.map((item) => {
          const notesStr = item.notes || '';
          let duration = '';
          let cleanNote = notesStr;
          
          const durMatch = notesStr.match(/Duration:\s*(\d{2}:\d{2})/);
          if (durMatch) {
            duration = durMatch[1];
            cleanNote = notesStr.replace(/Duration:\s*\d{2}:\d{2}\n?/, '').replace(/Notes:\s*/, '');
          }

          const formattedTime = new Date(item.date).toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });

          const displayName = item.student_name || `Student ID: ${item.student}`;
          const displayPhone = item.student_phone || 'No Phone';

          return (
            <TouchableOpacity 
              key={item.id} 
              style={styles.historyCard}
              onPress={() => {
                if (displayPhone && displayPhone !== 'No Phone') {
                  setPhoneNumber(displayPhone);
                  setActiveTab('dialer');
                }
              }}
            >
              <View style={styles.historyLeft}>
                <View style={styles.historyIcon}>
                  <Ionicons name="call-outline" size={20} color="#10B981" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.historyName}>{displayName}</Text>
                  <Text style={styles.historyPhone}>{displayPhone}</Text>
                  {cleanNote ? (
                    <Text style={styles.historyNotes} numberOfLines={2}>{cleanNote}</Text>
                  ) : null}
                </View>
              </View>
              <View style={{ alignItems: 'flex-end', justifyContent: 'space-between', height: '100%', minHeight: 40 }}>
                <Text style={styles.historyTime}>{formattedTime}</Text>
                {duration ? (
                  <View style={styles.durationBadge}>
                    <Text style={styles.durationText}>{duration}</Text>
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-down" size={28} color="#333" />
        </TouchableOpacity>
      </View>

      {/* Segmented Tab View Selector */}
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'dialer' && styles.activeTabButton]}
          onPress={() => setActiveTab('dialer')}
        >
          <Ionicons name="keypad" size={18} color={activeTab === 'dialer' ? '#1E293B' : '#94A3B8'} />
          <Text style={[styles.tabText, activeTab === 'dialer' && styles.activeTabText]}>Keypad</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'history' && styles.activeTabButton]}
          onPress={() => setActiveTab('history')}
        >
          <Ionicons name="time" size={18} color={activeTab === 'history' ? '#1E293B' : '#94A3B8'} />
          <Text style={[styles.tabText, activeTab === 'history' && styles.activeTabText]}>Recent Calls</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'dialer' ? (
        <>
          <View style={styles.numberDisplay}>
            <Text style={styles.numberText} numberOfLines={1} adjustsFontSizeToFit>
              {formatPhoneNumber(phoneNumber)}
            </Text>
          </View>

          <View style={styles.padContainer}>
            {[
              ['1', '2', '3'],
              ['4', '5', '6'],
              ['7', '8', '9'],
              ['*', '0', '#']
            ].map((row, rowIndex) => (
              <View key={rowIndex} style={styles.row}>
                {row.map((btn) => (
                  <TouchableOpacity key={btn} style={styles.padButton} onPress={() => handlePress(btn)}>
                    <Text style={styles.padText}>{btn}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))}

            <View style={styles.actionRowFinal}>
              <View style={styles.emptyButton} />
              <TouchableOpacity style={styles.callButton} onPress={handleCall} disabled={!phoneNumber}>
                <Ionicons name="call" size={32} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.backspaceButton} onPress={handleBackspace} disabled={!phoneNumber}>
                <Ionicons name="backspace-outline" size={28} color={phoneNumber ? "#666" : "transparent"} />
              </TouchableOpacity>
            </View>
          </View>
        </>
      ) : (
        renderRecentCalls()
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  activeCallContainer: {
    flex: 1,
    backgroundColor: '#1E293B',
    justifyContent: 'space-between',
    paddingVertical: 50,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  backButton: {
    padding: 10,
    marginLeft: -10,
  },
  numberDisplay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  numberText: {
    fontSize: 42,
    fontWeight: '400',
    color: '#111827',
    letterSpacing: 2,
  },
  padContainer: {
    paddingBottom: 40,
    paddingHorizontal: 30,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  padButton: {
    width: 75,
    height: 75,
    borderRadius: 37.5,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  padText: {
    fontSize: 28,
    fontWeight: '500',
    color: '#1F2937',
  },
  actionRowFinal: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginTop: 10,
  },
  emptyButton: {
    width: 75,
  },
  callButton: {
    width: 75,
    height: 75,
    borderRadius: 37.5,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  backspaceButton: {
    width: 75,
    height: 75,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Active Call Styles
  callHeader: {
    alignItems: 'center',
    marginTop: 50,
  },
  callingText: {
    color: '#94A3B8',
    fontSize: 18,
    marginBottom: 10,
  },
  activeNumberText: {
    color: '#fff',
    fontSize: 36,
    fontWeight: '300',
    marginBottom: 10,
  },
  callLabel: {
    color: '#10B981',
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  callActions: {
    alignItems: 'center',
    marginBottom: 40,
  },
  actionButton: {
    width: 65,
    height: 65,
    borderRadius: 32.5,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
  },
  endCallButton: {
    width: 75,
    height: 75,
    borderRadius: 37.5,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    transform: [{ rotate: '135deg' }],
  },
  cancelCallBtn: {
    marginTop: 30,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#475569',
  },
  cancelCallText: {
    color: '#94A3B8',
    fontWeight: 'bold',
    fontSize: 14,
  },
  // Tab selector styles
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 4,
    marginHorizontal: 20,
    marginVertical: 10,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  activeTabButton: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  activeTabText: {
    color: '#1E293B',
    fontWeight: '700',
  },
  // History tab styles
  historyCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  historyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  historyIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EBF8FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
  },
  historyPhone: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  historyNotes: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
  historyTime: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  durationBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginTop: 6,
  },
  durationText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#4B5563',
  },
});

export default Dialpad;
