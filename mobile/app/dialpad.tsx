import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Dimensions, Platform, Linking, Alert, NativeModules } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { startNativeRecording, stopNativeRecording, listenToCallEvents } from '../src/utils/CallManager';
import client from '../src/api/client';

const { width } = Dimensions.get('window');

const Dialpad = () => {
  const { leadId, phone } = useLocalSearchParams();
  const [phoneNumber, setPhoneNumber] = useState((phone as string) || '');
  const [callStatus, setCallStatus] = useState<'IDLE' | 'CALLING' | 'ACTIVE'>('IDLE');
  const [callDuration, setCallDuration] = useState(0);

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
    // Listen for events from our Kotlin InCallService Bridge
    const unsubscribe = listenToCallEvents(async (path) => {
      console.log("Recording saved at:", path);
      
      if (leadId && leadId !== '0' && path) {
        try {
          const formData = new FormData();
          formData.append('student', leadId as string);
          formData.append('interaction_type', 'CALL');
          formData.append('notes', `Outbound call lasting ${formatDuration(callDuration)}`);
          
          // Append the file
          formData.append('audio_recording', {
            uri: `file://${path}`,
            type: 'audio/m4a',
            name: `recording_${Date.now()}.m4a`
          } as any);

          await client.post('/crm/interactions/', formData, {
            headers: {
              'Content-Type': 'multipart/form-data',
            }
          });
          console.log("Uploaded successfully to CRM!");
        } catch (error) {
          console.error("Failed to upload recording", error);
        }
      }
    });
    return () => unsubscribe();
  }, [leadId, callDuration]);

  const handlePress = (num: string) => {
    setPhoneNumber((prev) => prev + num);
  };

  const handleBackspace = () => {
    setPhoneNumber((prev) => prev.slice(0, -1));
  };

  const handleCall = async () => {
    if (!phoneNumber) return;
    setCallStatus('CALLING');
    
    // Simulate the call being answered after 2 seconds
    setTimeout(async () => {
      setCallStatus('ACTIVE');
      
      // Tell native Kotlin to start recording the call
      if (Platform.OS === 'android') {
        const filePath = await startNativeRecording();
        console.log("Started recording:", filePath);
      }
    }, 2000);
    
    // Launch native system dialer to place the actual phone call
    Linking.openURL(`tel:${phoneNumber}`).catch(err => {
      Alert.alert('Call Error', 'Could not open native system dialer: ' + err.message);
    });
  };

  const handleEndCall = async () => {
    setCallStatus('IDLE');
    
    let filePath = null;
    if (Platform.OS === 'android') {
      filePath = await stopNativeRecording();
      console.log("Stopped recording:", filePath);
    }

    // Fallback for Expo Go / iOS / Emulators when the custom native call recorder is absent.
    // Logs the call details directly in the CRM interaction history.
    const hasNativeRecorder = !!NativeModules.CallRecordingModule;
    if (!hasNativeRecorder && leadId && leadId !== '0') {
      try {
        const formData = new FormData();
        formData.append('student', leadId as string);
        formData.append('interaction_type', 'CALL');
        formData.append('notes', `Outbound call lasting ${formatDuration(callDuration)} (Call logged successfully via Dialpad)`);
        
        await client.post('/crm/interactions/', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          }
        });
        console.log("Fallback call interaction logged successfully in CRM!");
      } catch (error) {
        console.error("Failed to upload fallback CRM call log:", error);
      }
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

  if (callStatus !== 'IDLE') {
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
