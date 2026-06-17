import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Dimensions, Platform, Linking, Alert, NativeModules, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { startNativeRecording, stopNativeRecording, listenToCallEvents, requestCallPermissions, listenToCallState } from '../src/utils/CallManager';
import client from '../src/api/client';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');

const Dialpad = () => {
  const { leadId, phone } = useLocalSearchParams();
  const [phoneNumber, setPhoneNumber] = useState((phone as string) || '');
  const [callStatus, setCallStatus] = useState<'IDLE' | 'CALLING' | 'ACTIVE' | 'POST_CALL'>('IDLE');
  const [callDuration, setCallDuration] = useState(0);
  const [postCallNotes, setPostCallNotes] = useState('');
  const [pipelineStatus, setPipelineStatus] = useState('INTERESTED');
  const [recordedFilePath, setRecordedFilePath] = useState<string | null>(null);

  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Use ref to keep track of current phoneNumber for asynchronous listener
  const phoneRef = useRef(phoneNumber);
  useEffect(() => {
    phoneRef.current = phoneNumber;
  }, [phoneNumber]);

  useEffect(() => {
    loadUser();
  }, []);

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

  const hasDialerAccess = user?.role === 'SALES' || user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  useEffect(() => {
    let interval: any;
    if (callStatus === 'ACTIVE') {
      interval = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(interval);
  }, [callStatus]);

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

      if (state === 'OFFHOOK') {
        callStarted = true;
        setCallStatus('ACTIVE');
        // Automatically start recording when call is active
        const filePath = await startNativeRecording(phoneRef.current);
        console.log("Call auto-started recording. Fallback path:", filePath);
      } else if (state === 'IDLE') {
        if (callStarted) {
          callStarted = false;
          setCallStatus('POST_CALL');
          // Automatically stop recording when call hangs up
          const filePath = await stopNativeRecording();
          if (filePath) {
            console.log("Call auto-stopped recording. Path:", filePath);
            setRecordedFilePath(filePath);
          }
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

    if (Platform.OS === 'android') {
      const granted = await requestCallPermissions();
      if (!granted) {
        Alert.alert('Permission Error', 'Cannot place call without phone and microphone permissions.');
        return;
      }
    }

    setCallStatus('CALLING');
    
    // Launch native system dialer to place the actual phone call
    Linking.openURL(`tel:${phoneNumber}`).catch(err => {
      Alert.alert('Call Error', 'Could not open native system dialer: ' + err.message);
    });
  };

  const handleEndCall = async () => {
    setCallStatus('POST_CALL');
    
    if (Platform.OS === 'android') {
      const filePath = await stopNativeRecording();
      if (filePath) setRecordedFilePath(filePath);
      console.log("Stopped recording manually:", filePath);
    }
  };

  const handlePostCallSubmit = async () => {
    if (!leadId || leadId === '0') {
      Alert.alert('No Lead Linked', 'Call log will not be saved automatically because no lead was selected.');
      router.back();
      return;
    }

    try {
      const formData = new FormData();
      formData.append('student', leadId as string);
      formData.append('interaction_type', 'CALL');
      formData.append('notes', `Duration: ${formatDuration(callDuration)}\nNotes: ${postCallNotes}`);
      formData.append('pipeline_status', pipelineStatus);
      
      if (recordedFilePath) {
        formData.append('audio_recording', {
          uri: `file://${recordedFilePath}`,
          type: 'audio/m4a',
          name: `recording_${Date.now()}.m4a`
        } as any);
      }
      
      await client.post('/crm/interactions/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      console.log("Post-call review uploaded successfully!");
      Alert.alert('Success', 'Call recording and notes saved to CRM.');
      router.back();
    } catch (error) {
      console.error("Failed to upload post-call log:", error);
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

          <Text style={{ fontSize: 14, fontWeight: '600', color: '#4A5568', marginBottom: 10 }}>Pipeline Status</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
            {['INTERESTED', 'FOLLOW UP', 'NOT INTERESTED', 'CONVERTED'].map(status => (
              <TouchableOpacity 
                key={status} 
                onPress={() => setPipelineStatus(status)}
                style={{
                  paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20,
                  backgroundColor: pipelineStatus === status ? '#3182CE' : '#EBF8FF',
                }}
              >
                <Text style={{ color: pipelineStatus === status ? '#FFF' : '#3182CE', fontWeight: 'bold', fontSize: 12 }}>
                  {status}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

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

          <TouchableOpacity 
            style={{ backgroundColor: '#10B981', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 30 }}
            onPress={handlePostCallSubmit}
          >
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>Save & Upload Log</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (callStatus === 'CALLING' || callStatus === 'ACTIVE') {
    return (
      <SafeAreaView style={styles.activeCallContainer}>
        <View style={styles.callHeader}>
          <Text style={styles.callingText}>{callStatus === 'CALLING' ? 'Calling...' : formatDuration(callDuration)}</Text>
          <Text style={styles.activeNumberText}>{formatPhoneNumber(phoneNumber)}</Text>
          <Text style={styles.callLabel}>Natya CRM Secure Call</Text>
        </View>

        <View style={styles.callActions}>
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.actionButton}>
              <Ionicons name="mic-off" size={28} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton}>
              <Ionicons name="keypad" size={28} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton}>
              <Ionicons name="volume-high" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
          
          <TouchableOpacity style={styles.endCallButton} onPress={handleEndCall}>
            <Ionicons name="call" size={32} color="#fff" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-down" size={28} color="#333" />
        </TouchableOpacity>
      </View>

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
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    width: '100%',
    marginBottom: 60,
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
  }
});

export default Dialpad;
