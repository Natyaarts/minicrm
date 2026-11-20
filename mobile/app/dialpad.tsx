import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Dimensions, Platform, Linking, Alert, NativeModules, TextInput, ScrollView, ActivityIndicator, AppState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { useLocalSearchParams, router } from 'expo-router';
import { startNativeRecording, stopNativeRecording, cancelNativeRecording, findRecentRecordingInMappedFolder, markCallSessionEnded, getLastCallSessionEndTimeMs, listenToCallEvents, requestCallPermissions, listenToCallState, makeDirectCall, getLatestCallLogDuration, isAppFallbackRecording, isSilentAppRecording, deleteAppFallbackRecording, getMappedRecordingFolder, pickAndMapRecordingFolder } from '../src/utils/CallManager';
import { generateMobileCallId, queueOfflineCall, markRecordingConsumed, getConsumedRecordings, isRecordingConsumed, uploadCallRecordingAsync, syncPendingRecordings, queuePendingMentorRecording } from '../src/utils/SyncManager';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Audio } from 'expo-av';
import client from '../src/api/client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addStudentFeedback, uploadFeedbackRecording } from '../src/api/mentors';
import { saveActiveCall, getActiveCall, updateActiveCall, clearActiveCall, getCurrentUserKey, isSessionForUser } from '../src/utils/ActiveCallSession';


const FEEDBACK_STATUSES = [
  { value: 'CALL_DONE', label: 'Call Done' },
  { value: 'NO_ANSWER', label: 'No Answer' },
  { value: 'NOT_REACHABLE', label: 'Not Reachable' },
  { value: 'CALL_BACK', label: 'Call Back Later' },
  { value: 'MESSAGE_SENT', label: 'Message Sent' },
  { value: 'OTHER', label: 'Other' },
];
const toYMD = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;


const { width } = Dimensions.get('window');

const Dialpad = () => {
  const { leadId, phone, leadStatus, mode } = useLocalSearchParams();
  const isMentorMode = mode === 'mentor';
  const [phoneNumber, setPhoneNumber] = useState((phone as string) || '');
  const [callStatus, setCallStatus] = useState<'IDLE' | 'CALLING' | 'ACTIVE' | 'POST_CALL'>('IDLE');
  const [activeCallTimer, setActiveCallTimer] = useState(0);
  const [callDuration, setCallDuration] = useState(0);
  const [callStatusState, setCallStatusState] = useState<'CONNECTED' | 'MISSED'>('MISSED');
  const [postCallNotes, setPostCallNotes] = useState('');
  const [pipelineStatus, setPipelineStatus] = useState((leadStatus as string) || '');
  const [hasExplicitStageChange, setHasExplicitStageChange] = useState(false);
  const [recordedFilePath, setRecordedFilePath] = useState<string | null>(null);
  const [manualRecordingFile, setManualRecordingFile] = useState<any>(null); // manually picked file
  const [nextFollowupDate, setNextFollowupDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isProcessingRecording, setIsProcessingRecording] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recordingUploadStatus, setRecordingUploadStatus] = useState<string | null>(null);
  // Where the attached auto-recording came from: the phone's call recorder or the app's MIC fallback
  const [recordingSource, setRecordingSource] = useState<'phone' | 'app' | null>(null);
  // Connected call but no usable call audio was found (fallback was silent / nothing in the mapped folder)
  const [noCallAudio, setNoCallAudio] = useState(false);
  const [recordingFolderMapped, setRecordingFolderMapped] = useState<boolean | null>(null);

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
  // Bug 3 Fix: Pagination state for call history
  const [callsPage, setCallsPage] = useState(1);
  const [hasMoreCalls, setHasMoreCalls] = useState(false);
  const [loadingMoreCalls, setLoadingMoreCalls] = useState(false);

  // Use refs to keep track of current state for asynchronous listeners
  const phoneRef = useRef(phoneNumber);
  const callStatusRef = useRef(callStatus);
  const callStartTimeRef = useRef<number>(0);
  const callDurationRef = useRef<number>(0);
  const callStatusStateRef = useRef(callStatusState);
  const isFinalizingRef = useRef(false);
  const activeSessionIdRef = useRef<string>('');
  const currentMobileCallIdRef = useRef<string>('');
  // Recording path emitted by native while finalizeCallSession() is still running (state not yet CONNECTED)
  const bufferedRecordingPathRef = useRef<string | null>(null);
  // Set once the user deletes the auto recording or picks a file: later native events must not override that
  const userOverrodeRecordingRef = useRef(false);
  // Recording-match window of the last connected call (used to queue a late phone recording)
  const recordingWindowRef = useRef<{ start: number; end: number; prevEnd: number; seconds: number } | null>(null);

  const [feedbackStatus, setFeedbackStatus] = useState('CALL_DONE');
  const callWindowRef = useRef({ start: 0, end: 0 });

  const sawOffhookRef = useRef(false);

  const isStageMatching = (stage: any, statusVal: any) => {
    if (!stage || statusVal === null || statusVal === undefined || String(statusVal).trim() === '') return false;
    const raw = String(statusVal).trim();
    if (String(stage.id) === raw) return true;
    const normVal = raw.toLowerCase().replace(/[\s_-]+/g, '');
    const normName = String(stage.name || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
    const normId = String(stage.id || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
    if (normVal === normName || normVal === normId) return true;
    const aliases: Record<string, string[]> = {
      new: ['new', 'newlead'],
      newlead: ['new', 'newlead'],
      followup: ['followup', 'followups'],
      paymentpending: ['paymentpending', 'pendingpayment'],
      enrolled: ['enrolled', 'converted'],
      converted: ['converted', 'enrolled'],
      dropped: ['dropped', 'notinterested', 'rejected', 'lost'],
    };
    const group = aliases[normVal] || [];
    return group.includes(normName) || group.includes(normId);
  };

  // Reset all call-specific state whenever route parameters (leadId or phone) change
  useEffect(() => {
    if (phone && typeof phone === 'string') {
      setPhoneNumber(phone);
      phoneRef.current = phone;
    }
    setHasExplicitStageChange(false);
    setPipelineStatus(leadStatus ? String(leadStatus) : '');
    if (!isMentorMode && leadId && String(leadId) !== '0') {
      client.get(`/students/${leadId}/`).then(res => {
        const currentStage = res.data?.lead_stage_id ?? res.data?.lead_status;
        if (currentStage !== undefined && currentStage !== null && String(currentStage).trim() !== '') {
          setPipelineStatus(prev => (prev ? prev : String(currentStage)));
        }
      }).catch(() => {});
    }
    if (callStatusRef.current === 'IDLE' || callStatusRef.current === 'POST_CALL') {
      setCallStatus('IDLE');
      callStatusRef.current = 'IDLE';
      setActiveCallTimer(0);
      setCallDuration(0);
      callDurationRef.current = 0;
      setCallStatusState('MISSED');
      callStatusStateRef.current = 'MISSED';
      setRecordedFilePath(null);
      setManualRecordingFile(null);
      setPostCallNotes('');
      setNextFollowupDate(null);
      setIsProcessingRecording(false);
      callStartTimeRef.current = 0;
      isFinalizingRef.current = false;
      activeSessionIdRef.current = '';
      currentMobileCallIdRef.current = '';
    }
  }, [leadId, phone, leadStatus, mode]);

  useEffect(() => {
    phoneRef.current = phoneNumber;
  }, [phoneNumber]);

  useEffect(() => {
    callStatusRef.current = callStatus;
  }, [callStatus]);

  useEffect(() => {
    callDurationRef.current = callDuration;
  }, [callDuration]);

  useEffect(() => {
    callStatusStateRef.current = callStatusState;
  }, [callStatusState]);

  // Keep typed notes in the saved session (debounced) so they survive an app restart
  useEffect(() => {
    if (callStatus !== 'POST_CALL') return;
    const sessionId = activeSessionIdRef.current;
    if (!sessionId) return;
    const t = setTimeout(() => {
      if (activeSessionIdRef.current === sessionId) {
        updateActiveCall({ notes: postCallNotes }, sessionId);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [postCallNotes, callStatus]);

  useEffect(() => {
    loadUser();
    if (!isMentorMode) fetchPipelineStages();
  }, []);

  const fetchPipelineStages = async () => {
    try {
      const res = await client.get('/crm/stages/');
      const data = res.data?.results || res.data || [];
      if (data.length > 0) {
        setPipelineStages(data);
      }
    } catch (e) {
      console.log('Failed to fetch pipeline stages:', e);
    }
  };

  const loadUser = async () => {
    try {
      const cached = await AsyncStorage.getItem('userInfo');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed && (parsed.role || parsed.username)) {
            setUser(parsed);
          }
        } catch (parseErr) {
          console.warn('[Dialpad] Failed to parse cached userInfo:', parseErr);
        }
      }
      const token = await AsyncStorage.getItem('userToken');
      if (token) {
        const res = await client.get('/auth/me/');
        if (res.data && res.data.role && (res.data.username || res.data.id)) {
          setUser(res.data);
          await AsyncStorage.setItem('userInfo', JSON.stringify(res.data));
        }
      }
    } catch (err) {
      console.log('[Dialpad] Failed to refresh user details from API, keeping cached state:', err);
    } finally {
      setAuthLoading(false);
    }
  };

  // Bug 3 Fix: fetchRecentCalls supports pagination — page 1 resets list, higher pages append
  const fetchRecentCalls = async (page = 1) => {
    if (page === 1) {
      setLoadingCalls(true);
      setRecentCalls([]);
    } else {
      setLoadingMoreCalls(true);
    }
    try {
      const res = await client.get('/crm/interactions/', {
        params: { interaction_type: 'CALL', page }
      });
      const raw = res.data;
      const data = raw?.results || (Array.isArray(raw) ? raw : []);
      const filtered = data.filter((item: any) => item.interaction_type === 'CALL');
      if (page === 1) {
        setRecentCalls(filtered);
      } else {
        setRecentCalls(prev => [...prev, ...filtered]);
      }
      // Check if there is a next page
      setHasMoreCalls(!!(raw?.next));
      setCallsPage(page);
    } catch (err) {
      console.log('Failed to fetch recent calls:', err);
    } finally {
      setLoadingCalls(false);
      setLoadingMoreCalls(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'history') {
      fetchRecentCalls();
    }
  }, [activeTab]);

  const SALES_ROLES = ['SALES','TEAM_LEAD','SALES_HEAD','SALES_MANAGER','MANAGER','SALES_LEAD','ADMIN','SUPER_ADMIN'];
  const MENTOR_ROLES = ['MENTOR', 'TEACHER', 'HEAD - MENTOR', 'ACADEMIC MENTOR', 'ACADEMIC', 'ACADEMIC_COORDINATOR', 'ADMIN', 'SUPER_ADMIN'];
  const hasDialerAccess = isMentorMode
    ? MENTOR_ROLES.includes(String(user?.role || '').toUpperCase().trim()) // same normalisation as the backend
    : SALES_ROLES.includes(user?.role) || Boolean(user?.is_manager);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startTimer = () => {
    stopTimer();
    setActiveCallTimer(0);
    timerRef.current = setInterval(() => {
      if (callStartTimeRef.current > 0) {
        setActiveCallTimer(Math.max(0, Math.floor((Date.now() - callStartTimeRef.current) / 1000)));
      }
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    if (callStatus === 'ACTIVE') {
      if (callStartTimeRef.current === 0) {
        callStartTimeRef.current = Date.now();
      }
      startTimer();
    } else {
      stopTimer();
      if (callStatus === 'IDLE') {
        setActiveCallTimer(0);
        setCallDuration(0);
        setCallStatusState('MISSED');
        callStartTimeRef.current = 0;
      }
    }
    return () => {
      stopTimer();
    };
  }, [callStatus]);


  const waitForCallLogDuration = async (phone: string, startTime: number) => {
    for (let i = 0; i < 8; i++) {
      try {
        const d = await getLatestCallLogDuration(phone, startTime - 10000, 'OUTGOING');
        console.log(`[dialpad] CallLog try ${i}:`, d);
        if (typeof d === 'number' && d > 0) return d;
      } catch (e) {
        console.warn('[dialpad] CallLog error', e);
      }
      await new Promise(r => setTimeout(r, 750));
    }
    return 0;
  };


  const finalizeCallSession = async () => {
    if (isFinalizingRef.current) return;
    isFinalizingRef.current = true;
    sawOffhookRef.current = false; // this call is being concluded; a later IDLE/foreground must not re-run it
    bufferedRecordingPathRef.current = null;

    const sessionId = activeSessionIdRef.current;
    if (sessionId) updateActiveCall({ status: 'POST_CALL' }, sessionId);
    stopTimer();
    const rawStart = callStartTimeRef.current > 0 ? callStartTimeRef.current : (Date.now() - 5000);
    const prevSessionEndMs = getLastCallSessionEndTimeMs(); // before stopNativeRecording() moves it
    const startTime = Math.max(rawStart, prevSessionEndMs);
    const callEndMs = Date.now(); // fixed call end for the recording window (not moved by retries)
    const targetPhone = phoneRef.current;

    // Immediately enter POST_CALL review with initial safe defaults (0 duration, MISSED, no recording)
    setCallStatus('POST_CALL');
    callStatusRef.current = 'POST_CALL';
    setCallDuration(0);
    callDurationRef.current = 0;
    setCallStatusState('MISSED');
    callStatusStateRef.current = 'MISSED';
    setRecordedFilePath(null);
    setManualRecordingFile(null);
    setRecordingSource(null);
    setNoCallAudio(false);
    userOverrodeRecordingRef.current = false;
    getMappedRecordingFolder().then(uri => setRecordingFolderMapped(!!uri)).catch(() => setRecordingFolderMapped(null));
    setIsProcessingRecording(true);

    let authoritativeDuration = 0;
    let isConnected = false;

    // 1. Android CallLog is the single authority for call connection status and duration
    if (Platform.OS === 'android' && targetPhone) {
      const logDuration = await waitForCallLogDuration(targetPhone, startTime);
      authoritativeDuration = logDuration;
      isConnected = logDuration > 0;
    }

    // Abort if a newer call session was started while awaiting CallLog
    if (sessionId && activeSessionIdRef.current !== sessionId) {
      isFinalizingRef.current = false;
      return;
    }

    // 2. Handle native call recording strictly based on connection state
    if (Platform.OS === 'android') {
      try {
        if (!isConnected || authoritativeDuration <= 0) {
          // Unanswered, rejected, or failed call: cancel immediately (< 5ms) without 30s polling
          // and guarantee zero recording inheritance from any previous call.
          await cancelNativeRecording();
          setRecordedFilePath(null);
        } else {
          const consumedSet = await getConsumedRecordings();
          const usable = (p?: string | null) => !!p && !isRecordingConsumed(p, consumedSet);

          // Stops the app recorder. Returns the phone's own call recording when native finds one
          // (copied to cache), otherwise the app's MIC fallback file (silent on Android 10+), or null.
          const nativePath = await stopNativeRecording();

          let filePath: string | null = null;
          let source: 'phone' | 'app' | null = null;
          const nativePhoneRecording = usable(nativePath) && !isAppFallbackRecording(nativePath) ? nativePath : null;

          // 1. Mapped folder (the phone's call recorder) first, retried while the dialer finishes
          //    writing the file after hang-up. stopNativeRecording() just moved lastCallSessionEndTimeMs
          //    to "now", so pass the previous session's real end as the floor.
          recordingWindowRef.current = { start: startTime, end: callEndMs, prevEnd: prevSessionEndMs, seconds: authoritativeDuration };
          if (targetPhone) {
            const deadline = Date.now() + 12000;
            for (let attempt = 0; !filePath; attempt++) {
              const found = await findRecentRecordingInMappedFolder(
                targetPhone, startTime, callEndMs, consumedSet, prevSessionEndMs, authoritativeDuration
              );
              if (usable(found) && !isAppFallbackRecording(found)) {
                filePath = found;
                source = 'phone';
                break;
              }
              // 2. Native already copied the phone's own recording: no need to keep waiting
              if (attempt === 0 && nativePhoneRecording) break;
              if (Date.now() >= deadline || (sessionId && activeSessionIdRef.current !== sessionId)) break;
              await new Promise(r => setTimeout(r, 1500));
            }
          }
          if (!filePath && nativePhoneRecording) {
            filePath = nativePhoneRecording;
            source = 'phone';
          }

          // 3. App fallback recording (native result or a path buffered from onRecordingStopped),
          //    only if it actually contains audio
          if (!filePath) {
            for (const candidate of [nativePath, bufferedRecordingPathRef.current]) {
              if (usable(candidate) && !(await isSilentAppRecording(candidate))) {
                filePath = candidate!;
                source = isAppFallbackRecording(candidate) ? 'app' : 'phone';
                break;
              }
            }
          }

          // The app's own fallback file is never kept unless it is the attached recording
          for (const leftover of [nativePath, bufferedRecordingPathRef.current]) {
            if (leftover && leftover !== filePath && isAppFallbackRecording(leftover)) {
              deleteAppFallbackRecording(leftover);
            }
          }

          if (sessionId && activeSessionIdRef.current !== sessionId) {
            isFinalizingRef.current = false;
            return;
          }

          if (filePath) {
            setRecordedFilePath(filePath);
            setRecordingSource(source);
            setNoCallAudio(false);
            // Recording duration may synchronize displayed duration ONLY after call is proven CONNECTED
            const exactDuration = await extractDurationFromAudio(filePath);
            if (exactDuration && exactDuration > 0) {
              authoritativeDuration = exactDuration;
            }
          } else {
            setRecordedFilePath(null);
            setRecordingSource(null);
            setNoCallAudio(true);
          }
        }
      } catch (recErr) {
        console.warn('[dialpad] Error handling recording at call end:', recErr);
        setRecordedFilePath(null);
      }
    }

    markCallSessionEnded(Date.now());

    const finalDuration = (isConnected && authoritativeDuration > 0) ? authoritativeDuration : 0;
    const finalStatus = finalDuration > 0 ? 'CONNECTED' : 'MISSED';

    setCallDuration(finalDuration);
    callDurationRef.current = finalDuration;
    setCallStatusState(finalStatus);
    callWindowRef.current = { start: startTime, end: callEndMs };
    setFeedbackStatus(finalStatus === 'CONNECTED' ? 'CALL_DONE' : 'NO_ANSWER');
    callStatusStateRef.current = finalStatus;
    setIsProcessingRecording(false);
    isFinalizingRef.current = false;
  };

  const lastBackgroundTimeRef = useRef(0);

  useEffect(() => {
    (async () => {
      await Notifications.requestPermissionsAsync();
    })();
    const subscription = AppState.addEventListener('change', async nextAppState => {
      if (nextAppState === 'background') {
        lastBackgroundTimeRef.current = Date.now();
      }
      
      // If the app comes back to the foreground and we were in CALLING/ACTIVE state,
      // conclude call via authoritative CallLog check.
      if (nextAppState === 'active') {
        syncPendingRecordings().catch(() => {});
        const currentStatus = callStatusRef.current;
        if ((currentStatus === 'CALLING' || currentStatus === 'ACTIVE')
    && sawOffhookRef.current
    && lastBackgroundTimeRef.current > 0) {
          const timeInBackground = Date.now() - lastBackgroundTimeRef.current;
          
          if (timeInBackground > 2000) {
            // Only conclude if CallLog already has the finished call. If the user just switched back
            // mid-call there is no row yet: do nothing (the IDLE event or the end button finishes it).
            const startMs = callStartTimeRef.current > 0 ? callStartTimeRef.current : Date.now();
            const logDuration = await getLatestCallLogDuration(phoneRef.current, startMs - 10000, 'OUTGOING');
            const stillSameCall = (callStatusRef.current === 'CALLING' || callStatusRef.current === 'ACTIVE') && sawOffhookRef.current;
            if (typeof logDuration === 'number' && logDuration > 0 && stillSameCall) {
              lastBackgroundTimeRef.current = 0;
              await finalizeCallSession();
            }
          }
        }
      }
    });

    return () => {
      stopTimer();
      subscription.remove();
    };
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

  const extractDurationFromAudio = async (fileUri: string): Promise<number | null> => {
    try {
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
        console.log('[extractDurationFromAudio] Extracted audio duration:', durationSec, 'seconds');
        await sound.unloadAsync();
        return durationSec;
      }
    } catch (err) {
      console.log('[extractDurationFromAudio] Failed to read audio file duration:', err);
    }
    return null;
  };

  useEffect(() => {
    if (authLoading || !hasDialerAccess) return;

    // 1. Listen for events from our Kotlin MediaStore sync (which runs after stopRecording)
    const unsubscribeEvents = listenToCallEvents(async (path) => {
      console.log("Recording saved at:", path);
      // finalizeCallSession() is still deciding CONNECTED/MISSED: buffer the path, it is applied there
      if (path && isFinalizingRef.current) {
        bufferedRecordingPathRef.current = path;
        return;
      }
      // Audio recording must ONLY be accepted if the call was already confirmed CONNECTED with duration > 0 and not already consumed
      if (path && callStatusRef.current === 'POST_CALL' && callDurationRef.current > 0 && callStatusStateRef.current === 'CONNECTED') {
        // The user deleted the auto recording or picked a file for this session: don't override that
        if (userOverrodeRecordingRef.current) return;
        const consumed = await getConsumedRecordings();
        if (isRecordingConsumed(path, consumed)) {
          return;
        }
        if (await isSilentAppRecording(path)) return; // never attach a silent app (MIC) recording
        if (userOverrodeRecordingRef.current) return;  // re-check after the awaits
        setRecordedFilePath(path);
        setRecordingSource(isAppFallbackRecording(path) ? 'app' : 'phone');
        setNoCallAudio(false);
        try {
          const exactDuration = await extractDurationFromAudio(path);
          if (exactDuration && exactDuration > 0) {
            setCallDuration(exactDuration);
            callDurationRef.current = exactDuration;
          }
        } catch (_) {}
      }
    });

    // 2. Listen for phone state changes from native BroadcastReceiver
    const unsubscribeState = listenToCallState(async (event) => {
      const { state } = event;
      if (state === 'OFFHOOK') {
        if (callStatusRef.current === 'CALLING' || callStatusRef.current === 'ACTIVE') {
          sawOffhookRef.current = true;
          if (callStartTimeRef.current === 0) callStartTimeRef.current = Date.now();
          if (activeSessionIdRef.current) {
            updateActiveCall({ status: 'ACTIVE', startTime: callStartTimeRef.current }, activeSessionIdRef.current);
          }
          setCallStatus('ACTIVE');
          startTimer();
          await startNativeRecording(phoneRef.current);
        }
      } else if (state === 'IDLE') {
        if (sawOffhookRef.current) {
          sawOffhookRef.current = false;
          await finalizeCallSession();
        }
      }
    });
    

    return () => {
      stopTimer();
      unsubscribeEvents();
      unsubscribeState();
    };
  }, [authLoading, hasDialerAccess]);

  // Resume a call that was in progress when Android killed the app (saved by handleCall).
  // Runs once, after auth has loaded; must stay above the early returns below.
  const resumeCheckedRef = useRef(false);
  useEffect(() => {
    if (authLoading || !hasDialerAccess || resumeCheckedRef.current) return;
    resumeCheckedRef.current = true;
    (async () => {
      const saved = await getActiveCall();
      if (!saved) return;
      // Only the user who placed the call may resume it
      if (!isSessionForUser(saved, await getCurrentUserKey())) return;
      if (callStatusRef.current !== 'IDLE') return;
      const paramPhone = String(phone || '').replace(/[\s\-().]/g, '');
      if (!paramPhone || paramPhone !== saved.phone) return;

      console.log('[dialpad] Resuming saved call session', saved.sessionId, saved.status);
      activeSessionIdRef.current = saved.sessionId;
      currentMobileCallIdRef.current = saved.mobileCallId;
      phoneRef.current = saved.phone;
      setPhoneNumber(saved.phone);
      callStartTimeRef.current = saved.startTime;
      if (saved.notes) setPostCallNotes(saved.notes);
      // The in-memory previous-call boundary was lost with the old process
      markCallSessionEnded(saved.prevSessionEndMs);

      let logDuration = 0;
      if (saved.status !== 'POST_CALL') {
        const d = await getLatestCallLogDuration(saved.phone, saved.startTime - 10000, 'OUTGOING');
        logDuration = typeof d === 'number' ? d : 0;
      }

      // The user started or cancelled something while CallLog was being read
      if (activeSessionIdRef.current !== saved.sessionId || callStatusRef.current !== 'IDLE') return;

      if (saved.status === 'POST_CALL' || logDuration > 0) {
        // Call already ended: go straight to Call Review
        await finalizeCallSession();
      } else {
        // No finished call in CallLog yet: treat it as still going. The IDLE event or
        // "Tap to end & log call" finishes it.
        sawOffhookRef.current = true;
        callStatusRef.current = 'ACTIVE';
        setCallStatus('ACTIVE');
      }
    })();
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

    // Reset all call states before initiating new call
    stopTimer();
    const newSessionId = generateMobileCallId(cleanNumber, 'OUTGOING');
    activeSessionIdRef.current = newSessionId;
    currentMobileCallIdRef.current = newSessionId;
    setActiveCallTimer(0);
    setCallDuration(0);
    callDurationRef.current = 0;
    setCallStatusState('MISSED');
    callStatusStateRef.current = 'MISSED';
    setRecordedFilePath(null);
    setManualRecordingFile(null);
    setPostCallNotes('');
    setNextFollowupDate(null);
    callStartTimeRef.current = Date.now();
    isFinalizingRef.current = false;
    sawOffhookRef.current = false;

    // Persist the call so it can still be logged if Android kills the app during the call
    await saveActiveCall({
      sessionId: newSessionId,
      userId: await getCurrentUserKey(),
      mobileCallId: newSessionId,
      phone: cleanNumber,
      leadId: leadId ? String(leadId) : null,
      leadStatus: leadStatus ? String(leadStatus) : null,
      mode: mode ? String(mode) : null,
      startTime: callStartTimeRef.current,
      prevSessionEndMs: getLastCallSessionEndTimeMs(),
      status: 'CALLING',
      notes: '',
    });

    // Launch native system dialer
    try {
      if (Platform.OS === 'android' && NativeModules.CallRecordingModule) {
        await makeDirectCall(cleanNumber);
        setCallStatus('CALLING');
      } else {
        await Linking.openURL(`tel:${cleanNumber}`);
        setCallStatus('ACTIVE');
      }
    } catch (err: any) {
      Alert.alert('Call Error', 'Could not open native system dialer: ' + err.message);
      setCallStatus('IDLE');
    }
  };

  const handleEndCall = async () => {
    // CallLog is Android-only; elsewhere keep the old behaviour
    if (Platform.OS !== 'android') {
      await finalizeCallSession();
      return;
    }
    const startMs = callStartTimeRef.current > 0 ? callStartTimeRef.current : Date.now();
    const logDuration = await getLatestCallLogDuration(phoneRef.current, startMs - 10000, 'OUTGOING');
    if (typeof logDuration === 'number' && logDuration > 0) {
      await finalizeCallSession();
      return;
    }
    // No finished call in CallLog yet: the call may still be going (or it was never answered)
    Alert.alert(
      'Call still in progress',
      "The phone hasn't logged this call as finished yet. If the call is still going, keep waiting; it will be logged when you hang up.",
      [
        { text: 'Keep waiting', style: 'cancel' },
        { text: 'Log as missed', style: 'destructive', onPress: () => { finalizeCallSession(); } },
      ]
    );
  };

  const handleCancelCall = async () => {
    clearActiveCall();
    stopTimer();
    activeSessionIdRef.current = '';
    currentMobileCallIdRef.current = '';
    setActiveCallTimer(0);
    setCallStatus('IDLE');
    callStatusRef.current = 'IDLE';
    setCallDuration(0);
    callDurationRef.current = 0;
    setCallStatusState('MISSED');
    callStatusStateRef.current = 'MISSED';
    callStartTimeRef.current = 0;
    setRecordedFilePath(null);
    setManualRecordingFile(null);
    isFinalizingRef.current = false;
    if (Platform.OS === 'android') {
      try {
        await cancelNativeRecording();
      } catch (err) {
        console.log('Error cancelling recording on call cancel:', err);
      }
    }
  };

  const pickRecordingFile = async () => {
    try {
      if (callStatusStateRef.current !== 'CONNECTED' || callDurationRef.current <= 0) {
        Alert.alert('Unconnected Call', 'Recordings cannot be attached to missed or unanswered calls.');
        return;
      }
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        userOverrodeRecordingRef.current = true; // later native events must not replace the user's choice
        setManualRecordingFile(asset);
        if (asset.uri) {
          const exactDuration = await extractDurationFromAudio(asset.uri);
          if (exactDuration && exactDuration > 0) {
            setCallDuration(exactDuration);
            Alert.alert('Recording Selected', `File: ${asset.name}\nDuration: ${formatDuration(exactDuration)}`);
          } else {
            Alert.alert('Recording Selected', `File: ${asset.name}`);
          }
        }
      }
    } catch (err) {
      console.log('Failed to pick recording:', err);
    }
  };

  const handlePostCallSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    const cleanNumber = (phoneNumber || '').replace(/[\s\-().]/g, '');
    const mobileCallId = currentMobileCallIdRef.current || generateMobileCallId(cleanNumber, 'OUTGOING');
    currentMobileCallIdRef.current = '';
    activeSessionIdRef.current = '';
    
    // UNIFIED RULE:
    // duration > 0 -> CONNECTED
    // duration == 0 -> MISSED / NOT CONNECTED
    const isConnected = callDuration > 0 && callStatusState === 'CONNECTED';
    const status = isConnected ? 'CONNECTED' : 'MISSED';
    const finalDuration = isConnected ? String(callDuration) : '0';

    const parameters: Record<string, string> = {
      interaction_type: 'CALL',
      mobile_call_id: mobileCallId,
      customer_number: cleanNumber,
      receiver_number: cleanNumber,
      call_duration: finalDuration,
      call_direction: 'OUTGOING',
      call_status: status,
      notes: postCallNotes 
        ? `Duration: ${formatDuration(callDuration)}\nNotes: ${postCallNotes}`
        : (isConnected ? `Outbound Call - Duration: ${formatDuration(callDuration)}` : `Outbound Call to ${cleanNumber} (Unanswered / Missed)`)
    };

    if (leadId && String(leadId) !== '0') {
      parameters.student = String(leadId);
    }
    
    if (hasExplicitStageChange && pipelineStatus && leadId && String(leadId) !== '0') {
      parameters.pipeline_status = String(pipelineStatus);
    }
    if (nextFollowupDate && leadId && String(leadId) !== '0') parameters.next_followup_date = nextFollowupDate.toISOString();

    let fileUriToUpload = null;
    let mimeType = 'audio/m4a';
    let fileName = `recording_${Date.now()}.m4a`;

    // Only attach recording if call is confirmed CONNECTED with duration > 0.
    // A manually picked file always wins over the auto recording.
    if (isConnected && manualRecordingFile) {
      fileUriToUpload = manualRecordingFile.uri;
      mimeType = manualRecordingFile.mimeType || 'audio/mpeg';
      fileName = manualRecordingFile.name || `recording_${Date.now()}.mp3`;
    } else if (isConnected && recordedFilePath) {
      fileUriToUpload = recordedFilePath;
      if (!fileUriToUpload.startsWith('file://') && !fileUriToUpload.startsWith('content://')) {
        fileUriToUpload = `file://${fileUriToUpload}`;
      }
      const extMatch = fileUriToUpload.match(/\.([a-zA-Z0-9]+)$/);
      const ext = extMatch ? extMatch[1].toLowerCase() : 'm4a';
      fileName = `recording_${Date.now()}.${ext}`;
      
      if (ext === 'mp3') mimeType = 'audio/mpeg';
      else if (ext === 'wav') mimeType = 'audio/wav';
      else if (ext === 'amr') mimeType = 'audio/amr';
      else if (ext === 'aac') mimeType = 'audio/aac';
    }

    try {
      // 1. Post lightweight metadata to create the interaction record promptly (< 200ms)
      const res = await client.post('/crm/interactions/', parameters);
      const serverInteractionId = res.data?.id;

      // 2. The follow-up reminder is now a server push ("Follow-up due", crm send_task_reminders)

      // 3. If there is a recording, kick off asynchronous background upload
      if (fileUriToUpload && serverInteractionId) {
        setRecordingUploadStatus('Uploading recording in background...');
        uploadCallRecordingAsync({
          interactionId: serverInteractionId,
          mobileCallId,
          fileUri: fileUriToUpload,
          mimeType,
          fileName
        }, (status) => {
          if (status === 'success') {
            setRecordingUploadStatus('✅ Recording uploaded successfully');
            setTimeout(() => setRecordingUploadStatus(null), 3000);
          } else if (status === 'permanent_failure') {
            setRecordingUploadStatus('Interaction not found; recording archived safely');
            setTimeout(() => setRecordingUploadStatus(null), 5000);
          } else if (status === 'failed') {
            setRecordingUploadStatus('Recording upload queued for retry');
            setTimeout(() => setRecordingUploadStatus(null), 4000);
          }
        }).catch(err => {
          console.warn('[dialpad] Asynchronous recording upload error:', err);
        });

        Alert.alert('✅ Saved', 'Call log saved. Audio recording is uploading in the background.');
      } else {
        Alert.alert('✅ Saved', 'Call log saved to CRM successfully.');
      }

      setCallStatus('IDLE');
      callStatusRef.current = 'IDLE';
      setCallDuration(0);
      callDurationRef.current = 0;
      setCallStatusState('MISSED');
      callStatusStateRef.current = 'MISSED';
      setPostCallNotes('');
      setRecordedFilePath(null);
      setManualRecordingFile(null);
      setNextFollowupDate(null);
      clearActiveCall();
      if (activeTab === 'history') fetchRecentCalls();
    } catch (error: any) {
      console.warn('Failed to upload post-call log online, queueing offline:', error?.response?.data || error);
      await queueOfflineCall({
        mobile_call_id: mobileCallId,
        student: (leadId && String(leadId) !== '0') ? leadId : null,
        customer_number: cleanNumber,
        receiver_number: cleanNumber,
        call_direction: 'OUTGOING',
        call_status: status,
        call_duration: isConnected ? callDuration : 0,
        notes: postCallNotes || (isConnected ? `Outbound call to ${cleanNumber}` : `Outbound call to ${cleanNumber} (Unanswered / Missed)`),
        pipeline_status: hasExplicitStageChange && pipelineStatus ? String(pipelineStatus) : undefined,
        next_followup_date: nextFollowupDate?.toISOString(),
        recordedFilePath: isConnected ? (manualRecordingFile?.uri || recordedFilePath) : null
      });
      clearActiveCall();
      Alert.alert('Saved Offline', 'Call logged locally and will sync automatically.');
      setCallStatus('IDLE');
      callStatusRef.current = 'IDLE';
      setCallDuration(0);
      callDurationRef.current = 0;
      setCallStatusState('MISSED');
      callStatusStateRef.current = 'MISSED';
      setPostCallNotes('');
      setRecordedFilePath(null);
      setManualRecordingFile(null);
      setNextFollowupDate(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMentorFeedbackSubmit = async () => {
    if (isSubmitting) return;
    if (!leadId || String(leadId) === '0') {
      Alert.alert('No student', 'Open the dialpad from a student to save feedback.');
      return;
    }
    const isConnected = callDuration > 0 && callStatusState === 'CONNECTED';
    // if (!isConnected && feedbackStatus === 'CALL_DONE') {
    //   Alert.alert('Call not connected', 'The phone logged this call as not connected. Choose No Answer or Call Back.');
    //   return;
    // }

    setIsSubmitting(true);
    const cleanNumber = (phoneNumber || '').replace(/[\s\-().]/g, '');
    const mobileCallId = currentMobileCallIdRef.current || generateMobileCallId(cleanNumber, 'OUTGOING');

    const payload: any = {
      status: feedbackStatus,
      feedback: postCallNotes.trim(),
      mobile_call_id: mobileCallId,
      customer_number: cleanNumber,
      call_direction: 'OUTGOING',
      call_status: isConnected ? 'CONNECTED' : (feedbackStatus === 'CALL_DONE' ? undefined : 'MISSED'),
      call_duration: isConnected ? callDuration : 0,
    };
    const { start, end } = callWindowRef.current;
    if (start) payload.start_time = new Date(start).toISOString();
    if (end) payload.end_time = new Date(end).toISOString();
    if (nextFollowupDate) payload.next_followup_date = toYMD(nextFollowupDate); // DateField, not datetime

    try {
      await addStudentFeedback(leadId, payload); // idempotent on mobile_call_id, safe to retry
    } catch (e: any) {
      console.warn('[dialpad] add_feedback failed', {
        status: e?.response?.status, data: e?.response?.data, message: e?.message, mobileCallId,
      });
      setIsSubmitting(false);
      Alert.alert('Could not save', describeApiError(e));
      return; // stay on this screen so nothing is lost
    }

    // Recording (only for connected calls)
    // A manually picked file always wins over the auto recording
    const usingAutoRecording = isConnected && !manualRecordingFile?.uri && !!recordedFilePath;
    const fileUri = isConnected ? (manualRecordingFile?.uri || recordedFilePath) : null;
    let recordingError: string | null = null;
    if (fileUri) {
      const uri = fileUri.startsWith('/') ? `file://${fileUri}` : fileUri;
      const ext = (uri.match(/\.([a-zA-Z0-9]+)$/)?.[1] || 'm4a').toLowerCase();
      // audio/mp4 is the registered MIME type for .m4a ('audio/m4a' is non-standard)
      const types: any = { mp3: 'audio/mpeg', wav: 'audio/wav', amr: 'audio/amr', aac: 'audio/aac', m4a: 'audio/mp4', mp4: 'audio/mp4' };
      const name = `recording_${Date.now()}.${ext}`;
      const type = types[ext] || 'audio/mp4';
      try {
        setRecordingUploadStatus('Uploading recording...');
        await uploadFeedbackRecording(leadId, { mobileCallId, uri, name, type });
        if (usingAutoRecording && recordedFilePath) await markRecordingConsumed(recordedFilePath);
      } catch (e: any) {
        recordingError = `${describeApiError(e)}\n\nFile: ${uri}`;
        console.warn('[dialpad] feedback-recording upload failed', {
          status: e?.response?.status, data: e?.response?.data, message: e?.message, uri, name, type, mobileCallId,
        });
      } finally {
        setRecordingUploadStatus(null);
      }
    }

    setIsSubmitting(false);

    if (recordingError) {
      // Feedback is saved; keep this screen (and mobileCallId) so the same recording can be retried.
      // add_feedback is idempotent on mobile_call_id and feedback-recording replaces the file, so retry is safe.
      Alert.alert(
        'Saved, recording failed',
        `Feedback saved, but the recording upload failed:\n${recordingError}`,
        [
          { text: 'Close without recording', style: 'destructive', onPress: () => { resetPostCallState(); router.back(); } },
          { text: 'Retry upload', onPress: () => { handleMentorFeedbackSubmit(); } },
        ]
      );
      return;
    }

    // Connected call, no file yet, and the user didn't remove it on purpose: the phone's recorder may still
    // be writing it. Queue the call; SyncManager attaches the phone recording when it appears (up to 24h).
    const win = recordingWindowRef.current;
    if (isConnected && !fileUri && !userOverrodeRecordingRef.current && Platform.OS === 'android' && win) {
      await queuePendingMentorRecording({
        mobileCallId, studentId: String(leadId), phone: cleanNumber,
        callStartMs: win.start, callEndMs: win.end, prevSessionEndMs: win.prevEnd, connectedSeconds: win.seconds,
      });
      Alert.alert('✅ Saved', "Call feedback saved. The phone's call recording will upload automatically when it's available.",
        [{ text: 'OK', onPress: () => router.back() }]);
      resetPostCallState();
      return;
    }

    Alert.alert('✅ Saved', 'Call feedback saved.', [{ text: 'OK', onPress: () => router.back() }]);
    resetPostCallState();
  };

  const describeApiError = (e: any): string => {
    const status = e?.response?.status;
    const data = e?.response?.data;
    if (!status) return e?.message || 'Network error. Check your connection and tap Save again.';
    const detail = data?.error || data?.detail || (typeof data === 'string' ? data.slice(0, 200) : JSON.stringify(data));
    return `HTTP ${status}: ${detail}`;
  };

  // Full reset of the post-call session (used by mentor save and by "Discard & Close")
  const resetPostCallState = () => {
    clearActiveCall();
    currentMobileCallIdRef.current = '';
    activeSessionIdRef.current = '';
    bufferedRecordingPathRef.current = null;
    callStartTimeRef.current = 0;
    setCallStatus('IDLE'); callStatusRef.current = 'IDLE';
    setCallDuration(0); callDurationRef.current = 0;
    setCallStatusState('MISSED'); callStatusStateRef.current = 'MISSED';
    setPostCallNotes('');
    setRecordedFilePath(null);
    setManualRecordingFile(null);
    setRecordingSource(null);
    setNoCallAudio(false);
    userOverrodeRecordingRef.current = false;
    setNextFollowupDate(null);
  };

  const handleMapRecordingFolder = async () => {
    try {
      const result: any = await pickAndMapRecordingFolder();
      if (result?.uri) {
        setRecordingFolderMapped(true);
        Alert.alert('Folder mapped', `Call recordings will be read from ${result.folderInfo?.folderName || 'the selected folder'}. You can attach this call's recording with "Upload Call Recording".`);
      } else if (result?.errorMessage) {
        Alert.alert('Folder not mapped', result.errorMessage);
      }
    } catch (err: any) {
      Alert.alert('Folder not mapped', err?.message || 'Could not open the folder picker.');
    }
  };


  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const formatPhoneNumber = (num: string) => {
    if (!num) return '';
    if (num.startsWith('+')) return num;
    if (num.length > 3 && num.length <= 6) return `${num.slice(0, 3)}-${num.slice(3)}`;
    if (num.length > 6) return `${num.slice(0, 3)}-${num.slice(3, 6)}-${num.slice(6)}`;
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

          {isMentorMode ? (
            <>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#4A5568', marginBottom: 10 }}>Outcome</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                {FEEDBACK_STATUSES.map(s => {
                  const active = feedbackStatus === s.value;
                  const disabled = false;
                  return (
                    <TouchableOpacity
                      key={s.value}
                      disabled={disabled}
                      onPress={() => setFeedbackStatus(s.value)}
                      style={{ paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, opacity: disabled ? 0.35 : 1,
                              backgroundColor: active ? '#D97706' : '#FEF3C7' }}>
                      <Text style={{ color: active ? '#FFF' : '#92400E', fontWeight: 'bold', fontSize: 12 }}>{s.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          ) : (
            <>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#4A5568', marginBottom: 10 }}>Update Lead Stage</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', gap: 10, paddingVertical: 4 }}>
                {pipelineStages.map(stage => {
                  const isSelected = isStageMatching(stage, pipelineStatus);
                  return (
                    <TouchableOpacity
                      key={stage.id}
                      onPress={() => {
                        setPipelineStatus(String(stage.id));
                        setHasExplicitStageChange(true);
                      }}
                      style={{
                        paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20,
                        backgroundColor: isSelected ? '#3182CE' : '#EBF8FF',
                      }}
                    >
                      <Text style={{ color: isSelected ? '#FFF' : '#3182CE', fontWeight: 'bold', fontSize: 12 }}>
                        {stage.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
            </>
          )}

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
            onPress={() => {
              if (Platform.OS === 'android') {
                DateTimePickerAndroid.open({
                  value: nextFollowupDate || new Date(),
                  mode: 'date',
                  onChange: (event, selectedDate) => {
                    if (event.type === 'set' && selectedDate) {
                      // Small delay to prevent dialog swallow on Android
                      setTimeout(() => {
                        DateTimePickerAndroid.open({
                          value: selectedDate,
                          mode: 'time',
                          onChange: (timeEvent, selectedTime) => {
                            if (timeEvent.type === 'set' && selectedTime) {
                              setNextFollowupDate(selectedTime);
                            }
                          }
                        });
                      }, 100);
                    }
                  }
                });
              } else {
                setShowDatePicker(true);
              }
            }}
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

          {showDatePicker && Platform.OS === 'ios' && (
            <DateTimePicker
              value={nextFollowupDate || new Date()}
              mode="datetime"
              display="default"
              minimumDate={new Date()}
              onChange={(event, selectedDate) => {
                if (event.type === 'set' && selectedDate) {
                  setNextFollowupDate(selectedDate);
                }
                setShowDatePicker(false);
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

          {callStatusState === 'CONNECTED' && !isProcessingRecording && recordingFolderMapped === false && (
            <View style={{ backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FCD34D', borderRadius: 8, padding: 10, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="folder-open-outline" size={16} color="#B45309" />
              <Text style={{ color: '#92400E', fontSize: 12, flex: 1 }}>
                Map your call-recording folder once to attach recordings automatically.
              </Text>
              <TouchableOpacity onPress={handleMapRecordingFolder}>
                <Text style={{ color: '#B45309', fontWeight: '700', fontSize: 12 }}>Map Folder</Text>
              </TouchableOpacity>
            </View>
          )}

          {noCallAudio && !recordedFilePath && !manualRecordingFile && recordingFolderMapped !== false && (
            <View style={{ backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FCA5A5', borderRadius: 8, padding: 10, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="mic-off-outline" size={16} color="#B91C1C" />
              <Text style={{ color: '#991B1B', fontSize: 12, flex: 1 }}>
                ⚠️ No call audio found yet. Will upload automatically when the phone saves it.
              </Text>
            </View>
          )}

          {(recordedFilePath || manualRecordingFile) ? (
            <View style={{ backgroundColor: '#F0FFF4', borderWidth: 1, borderColor: '#9AE6B4', borderRadius: 8, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="checkmark-circle" size={20} color="#38A169" />
              <Text style={{ color: '#276749', fontSize: 13, flex: 1 }} numberOfLines={1}>
                {manualRecordingFile
                  ? `Selected file: ${manualRecordingFile.name}`
                  : recordingSource === 'app'
                    ? `🎙 App recording: ${decodeURIComponent(recordedFilePath!).split('/').pop()?.split(':').pop()}`
                    : `📞 Phone recording: ${decodeURIComponent(recordedFilePath!).split('/').pop()?.split(':').pop()} (auto)`}
              </Text>
              <TouchableOpacity onPress={() => {
                userOverrodeRecordingRef.current = true; // later native events must not bring it back
                setRecordedFilePath(null);
                setManualRecordingFile(null);
                setRecordingSource(null);
              }}>
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
            style={{ backgroundColor: (isProcessingRecording || isSubmitting) ? '#A0AEC0' : '#10B981', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 30 }}
            onPress={isMentorMode ? handleMentorFeedbackSubmit : handlePostCallSubmit}
            disabled={isProcessingRecording || isSubmitting}
          >
            {(isProcessingRecording || isSubmitting) ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ActivityIndicator color="#FFF" size="small" />
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>
                  {isSubmitting ? 'Saving & Uploading...' : 'Scanning for Recording...'}
                </Text>
              </View>
            ) : (
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>{isMentorMode ? 'Save Feedback' : 'Save & Upload Log'}</Text>
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
                    onPress: resetPostCallState
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
  }  if (callStatus === 'CALLING') {
    return (
      <SafeAreaView style={styles.activeCallContainer}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={{ marginTop: 20, fontSize: 18, color: '#ffffff', fontWeight: '600' }}>
            Opening Phone App...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (callStatus === 'ACTIVE') {
    return (
      <SafeAreaView style={styles.activeCallContainer}>
        <View style={styles.callHeader}>
          <Text style={styles.callingText}>Call in Progress</Text>
          <Text style={styles.activeNumberText}>{formatPhoneNumber(phoneNumber)}</Text>
          <Text style={styles.callLabel}>VIA SYSTEM PHONE APP</Text>
          {callStatus === 'ACTIVE' && (
            <Text style={{ color: '#10B981', fontSize: 22, fontWeight: '900', marginTop: 8 }}>
              {formatDuration(activeCallTimer)}
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
              if (Platform.OS === 'android' && NativeModules.CallRecordingModule) {
                setCallStatus('CALLING');
                makeDirectCall(phoneNumber.replace(/[\s\-().]/g, ''));
              } else {
                setCallStatus('ACTIVE');
                Linking.openURL(`tel:${phoneNumber.replace(/[\s\-().]/g, '')}`);
              }
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
          } else if (item.formatted_call_duration) {
            duration = item.formatted_call_duration;
          }

          const formattedTime = new Date(item.date).toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });

          const isIncoming = (item.call_direction || 'OUTGOING').toUpperCase() === 'INCOMING';
          const isMissed = (item.call_status || '').toUpperCase() === 'MISSED' || (item.call_status || '').toUpperCase() === 'UNANSWERED';
          const isRejected = (item.call_status || '').toUpperCase() === 'REJECTED';
          const isMatched = item.is_matched !== false && (item.student || item.student_id);

          const displayName = item.student_name || (isMatched ? `Student ID: ${item.student}` : 'Unknown / Unmatched');
          const displayPhone = item.student_phone || item.customer_number || item.caller_number || item.receiver_number || 'No Phone';

          // Direction icon configuration
          let iconName: any = 'arrow-up-outline';
          let iconColor = '#10B981'; // Green for Outgoing
          let iconBg = '#ECFDF5';

          if (isIncoming) {
            if (isMissed || isRejected) {
              iconName = 'call-outline';
              iconColor = '#EF4444'; // Red for Missed/Rejected
              iconBg = '#FEF2F2';
            } else {
              iconName = 'arrow-down-outline';
              iconColor = '#3B82F6'; // Blue for Incoming
              iconBg = '#EFF6FF';
            }
          }

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
                <View style={[styles.historyIcon, { backgroundColor: iconBg }]}>
                  <Ionicons name={iconName} size={20} color={iconColor} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.historyName}>{displayName}</Text>
                    {!isMatched && (
                      <View style={{ backgroundColor: '#F1F5F9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '600' }}>Unmatched</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.historyPhone}>
                    {displayPhone}
                  </Text>
                  {cleanNote ? (
                    <Text style={styles.historyNotes} numberOfLines={2}>{cleanNote}</Text>
                  ) : null}
                </View>
              </View>
              <View style={{ alignItems: 'flex-end', justifyContent: 'space-between', height: '100%', minHeight: 40 }}>
                <Text style={styles.historyTime}>{formattedTime}</Text>
                <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center', marginTop: 4 }}>
                  <View style={{
                    backgroundColor: isMissed ? '#FEF2F2' : (isIncoming ? '#EFF6FF' : '#ECFDF5'),
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 4
                  }}>
                    <Text style={{
                      fontSize: 10,
                      fontWeight: '700',
                      color: isMissed ? '#DC2626' : (isIncoming ? '#2563EB' : '#059669')
                    }}>
                      {item.call_status || (isIncoming ? 'INCOMING' : 'CONNECTED')}
                    </Text>
                  </View>
                  {duration ? (
                    <View style={styles.durationBadge}>
                      <Text style={styles.durationText}>{duration}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Bug 3 Fix: Load More button for call history pagination */}
        {hasMoreCalls && (
          <TouchableOpacity
            onPress={() => fetchRecentCalls(callsPage + 1)}
            disabled={loadingMoreCalls}
            style={{
              marginVertical: 16,
              backgroundColor: '#EBF8FF',
              borderWidth: 1,
              borderColor: '#BEE3F8',
              borderRadius: 10,
              padding: 14,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {loadingMoreCalls ? (
              <ActivityIndicator size="small" color="#3182CE" />
            ) : (
              <Ionicons name="chevron-down-circle-outline" size={20} color="#3182CE" />
            )}
            <Text style={{ color: '#3182CE', fontWeight: '700', fontSize: 14 }}>
              {loadingMoreCalls ? 'Loading...' : 'Load More Calls'}
            </Text>
          </TouchableOpacity>
        )}
        <View style={{ height: 40 }} />
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
      {!isMentorMode && (
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
      )}

      {/* Recording Upload Status Banner */}
      {recordingUploadStatus && (
        <View style={{ backgroundColor: '#EFF6FF', borderBottomWidth: 1, borderColor: '#BFDBFE', paddingVertical: 8, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <ActivityIndicator size="small" color="#2563EB" />
          <Text style={{ color: '#1E40AF', fontSize: 13, fontWeight: '600' }}>{recordingUploadStatus}</Text>
        </View>
      )}

      {activeTab === 'dialer' ? (
        <>
          <View style={styles.numberDisplay}>
            <TextInput
              style={[styles.numberText, { width: '100%', textAlign: 'center' }]}
              value={formatPhoneNumber(phoneNumber)}
              onChangeText={(text) => {
                const sanitized = text.replace(/[^0-9+*#]/g, '');
                setPhoneNumber(sanitized);
              }}
              showSoftInputOnFocus={false}
              contextMenuHidden={false}
              selectTextOnFocus
              keyboardType="phone-pad"
            />
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
