import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, Platform, ScrollView, Alert, ActivityIndicator, Animated, AppState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { listenToCallState, listenToMissedCalls, startNativeRecording, stopNativeRecording, cancelNativeRecording, findRecentRecordingInMappedFolder, markCallSessionEnded, getLastCallSessionEndTimeMs, waitForCallLogEntry, markCallLogRowConsumed, extractDurationFromAudio } from '../utils/CallManager';
import { generateMobileCallId, queueOfflineCall, markRecordingConsumed, getConsumedRecordings, isRecordingConsumed, uploadCallRecordingAsync, reserveRecording, releaseRecordingReservation, getReservedRecordings, queuePendingMentorRecording, queueMentorIncomingFeedback, syncMentorIncomingFeedback } from '../utils/SyncManager';
import client from '../api/client';
import { addStudentFeedback, uploadFeedbackRecording } from '../api/mentors';
import {
  getIncomingCallUserContext, findMentorStudentsByPhone, toYMD, beginIncomingCall, endIncomingCall,
  type MentorStudentMatch,
} from '../utils/mentorIncomingCall';
import * as DocumentPicker from 'expo-document-picker';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';

// Mentor review outcomes (same values as dialpad.tsx FEEDBACK_STATUSES / StudentFeedback.STATUS_CHOICES)
const MENTOR_FEEDBACK_STATUSES = [
  { value: 'CALL_DONE', label: 'Call Done' },
  { value: 'NO_ANSWER', label: 'No Answer' },
  { value: 'NOT_REACHABLE', label: 'Not Reachable' },
  { value: 'CALL_BACK', label: 'Call Back Later' },
  { value: 'MESSAGE_SENT', label: 'Message Sent' },
  { value: 'OTHER', label: 'Other' },
];

/**
 * One incoming call as seen by the mentor path. Created at RINGING for every user; only a mentor
 * (isMentor, resolved from the cached role) with a matching student takes the StudentFeedback path.
 */
interface MentorCallSession {
  mobileCallId: string;   // stable for the whole call: auto-saved missed row and modal Save share it
  phone: string;
  ended: boolean;
  isMentor: boolean;      // false until the role check resolves
  userKey: string;
  matchPromise: Promise<MentorStudentMatch[] | null>;
  // matchPromise limited to MENTOR_LOOKUP_WAIT_MS, created on first use and shared by the missed-call and
  // IDLE handlers, so both always take the same path (feedback or CRM) for one call
  decision?: Promise<MentorStudentMatch[] | null>;
  callStartMs?: number;
  callEndMs?: number;
  // Recording-match window of a connected call (late phone recording)
  window?: { start: number; end: number; prevEnd: number; seconds: number };
}

const describeApiError = (e: any): string => {
  const status = e?.response?.status;
  const data = e?.response?.data;
  if (!status) return e?.message || 'Network error. Check your connection and tap Save again.';
  const detail = data?.error || data?.detail || (typeof data === 'string' ? data.slice(0, 200) : JSON.stringify(data));
  return `HTTP ${status}: ${detail}`;
};

// How long the call-end handlers wait for a student lookup still running. On timeout the call is treated
// like a failed lookup: the current CRM flow handles it.
const MENTOR_LOOKUP_WAIT_MS = 5000;

const mentorMatchDecision = (s: MentorCallSession): Promise<MentorStudentMatch[] | null> => {
  if (!s.decision) {
    s.decision = Promise.race([
      s.matchPromise,
      new Promise<null>((resolve) => setTimeout(() => {
        console.warn(`[mentor-incoming] student lookup still running after ${MENTOR_LOOKUP_WAIT_MS}ms, using the CRM flow`);
        resolve(null);
      }, MENTOR_LOOKUP_WAIT_MS)),
    ]);
  }
  return s.decision;
};

// No response (offline) or a server error: worth queueing for retry
const isRetryableError = (e: any) => !e?.response || Number(e.response.status) >= 500;

export default function GlobalCallListener() {
  const [isModalVisible, setIsModalVisible] = useState(false);
  // ── Bug 1 Fix: Live ringing banner state ──
  const [showRingingBanner, setShowRingingBanner] = useState(false);
  const [ringingPhone, setRingingPhone] = useState('');
  const [ringingLeadInfo, setRingingLeadInfo] = useState<any>(null);
  const [loadingRingingLead, setLoadingRingingLead] = useState(false);
  const bannerAnim = useRef(new Animated.Value(-120)).current;

  const [displayPhone, setDisplayPhone] = useState('');
  const [callDuration, setCallDuration] = useState(0);
  const [callStatusState, setCallStatusState] = useState<'CONNECTED' | 'MISSED'>('MISSED');
  const [recordedFilePath, setRecordedFilePath] = useState<string | null>(null);
  
  const [leadInfo, setLeadInfo] = useState<any>(null); 
  const [loadingLead, setLoadingLead] = useState(false);
  
  const [pipelineStages, setPipelineStages] = useState<any[]>([]);
  const [pipelineStatus, setPipelineStatus] = useState('');
  const [hasExplicitStageChange, setHasExplicitStageChange] = useState(false);
  const [postCallNotes, setPostCallNotes] = useState('');
  const [nextFollowupDate, setNextFollowupDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [manualRecordingFile, setManualRecordingFile] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Refs for background state tracking
  const isIncomingRef = useRef(false);
  const isOffhookRef = useRef(false);
  const incomingPhoneRef = useRef<string | null>(null);
  const callStartTimeRef = useRef<number | null>(null);
  // When the phone started ringing: CallLog.DATE of an incoming call is the ring start, not the answer time
  const ringStartTimeRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // ── Mentor path (incoming calls saved as StudentFeedback) ──
  const mentorSessionRef = useRef<MentorCallSession | null>(null);
  const incomingFlagTokenRef = useRef(0);
  const mentorRecordingRemovedRef = useRef(false);
  const [mentorReview, setMentorReview] = useState<MentorCallSession | null>(null);
  const [mentorMatches, setMentorMatches] = useState<MentorStudentMatch[]>([]);
  const [mentorStudentId, setMentorStudentId] = useState<number | null>(null);
  const [mentorOutcome, setMentorOutcome] = useState('CALL_DONE');
  const [mentorNoMatchNote, setMentorNoMatchNote] = useState<string | null>(null);
  // Ringing banner for mentors: result of the mentor lookup, tied to its call (ignored for any other call)
  const [mentorBanner, setMentorBanner] = useState<{ callId: string; matches: MentorStudentMatch[] | null; loading: boolean } | null>(null);

  // Starts (or, for a repeated RINGING broadcast of the same call, keeps) the mentor session of this call
  const startMentorSession = (phone: string) => {
    const cur = mentorSessionRef.current;
    if (cur && !cur.ended && (cur.phone || !phone)) return;
    const s: MentorCallSession = {
      mobileCallId: cur && !cur.ended ? cur.mobileCallId : generateMobileCallId(phone, 'INCOMING'),
      phone: phone || '',
      ended: false,
      isMentor: false,
      userKey: '',
      matchPromise: Promise.resolve(null),
    };
    s.matchPromise = getIncomingCallUserContext().then((ctx) => {
      s.isMentor = ctx.isMentor;
      s.userKey = ctx.userKey;
      if (!ctx.isMentor) return null;
      // Mentor only: the banner shows the number at once, then the lookup result
      setMentorBanner({ callId: s.mobileCallId, matches: null, loading: true });
      return findMentorStudentsByPhone(phone).then((matches) => {
        if (mentorSessionRef.current === s) setMentorBanner({ callId: s.mobileCallId, matches, loading: false });
        return matches;
      });
    });
    mentorSessionRef.current = s;
  };

  const buildMentorPayload = (s: MentorCallSession, o: { status: string; notes: string; connected: boolean; duration: number; followup: Date | null }) => {
    const payload: Record<string, any> = {
      status: o.status,
      feedback: (o.notes || '').trim(),
      mobile_call_id: s.mobileCallId,
      customer_number: s.phone,
      call_direction: 'INCOMING',
      call_status: o.connected ? 'CONNECTED' : 'MISSED',
      call_duration: o.connected ? o.duration : 0,
    };
    if (s.callStartMs) payload.start_time = new Date(s.callStartMs).toISOString();
    if (s.callEndMs) payload.end_time = new Date(s.callEndMs).toISOString();
    if (o.followup) payload.next_followup_date = toYMD(o.followup);   // DateField, not datetime
    return payload;
  };

  // Missed incoming call with one matching student: save the one StudentFeedback row now. The modal's
  // Save reuses the mobile_call_id, so the backend updates this row instead of adding another.
  const autoSaveMentorMissed = async (s: MentorCallSession, studentId: number) => {
    const payload = buildMentorPayload(s, { status: 'NO_ANSWER', notes: '', connected: false, duration: 0, followup: null });
    try {
      await addStudentFeedback(studentId, payload);
    } catch (e: any) {
      if (isRetryableError(e)) {
        await queueMentorIncomingFeedback({ mobileCallId: s.mobileCallId, studentId, userKey: s.userKey, payload });
      } else {
        console.warn('[mentor-incoming] missed-call feedback rejected', e?.response?.status, e?.response?.data);
      }
    }
  };

  useEffect(() => {
    fetchPipelineStages();

    // Mentor incoming-call feedback queued offline (empty queue = no-op)
    syncMentorIncomingFeedback().catch(() => {});
    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') syncMentorIncomingFeedback().catch(() => {});
    });

    const unsubscribeMissed = listenToMissedCalls(async (event) => {
      console.log('GlobalCallListener Missed Call Event:', event);
      const phone = event.phoneNumber;
      if (!phone) return;

      // Mentor with exactly one matching student: this call is saved as StudentFeedback by the IDLE handler,
      // never as a CRM interaction. Everyone else continues below unchanged, including a mentor with no match
      // or with 2+ matching students (no safe automatic student: the CRM row keeps the missed call, and the
      // mentor can still pick the student in the review and Save it as feedback).
      const mentorSession = mentorSessionRef.current;
      if (mentorSession?.isMentor) {
        // Waits for a lookup still in progress (max MENTOR_LOOKUP_WAIT_MS); same result as the IDLE handler
        const matches = await mentorMatchDecision(mentorSession);
        if (matches && matches.length === 1) return;
      }

      const mobileCallId = generateMobileCallId(phone, 'INCOMING');
      let student = null;

      try {
        // Attempt secondary lead lookup
        const cleanPhone = phone.replace(/\D/g, '').slice(-10);
        const res = await client.get('/core/students/', { params: { search: cleanPhone } });
        const results = res.data?.results || res.data || [];
        if (results.length > 0) student = results[0];
      } catch (_) {}

      try {
        const payload = new FormData();
        if (student?.id) payload.append('student', String(student.id));
        payload.append('mobile_call_id', mobileCallId);
        payload.append('customer_number', phone);
        payload.append('caller_number', phone);
        payload.append('interaction_type', 'CALL');
        payload.append('call_direction', 'INCOMING');
        payload.append('call_status', 'MISSED');
        payload.append('call_duration', '0');
        payload.append('notes', `Missed incoming call from ${phone}`);

        await client.post('/crm/interactions/', payload, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });

        Alert.alert(
          '🚨 Missed Call Alert',
          student 
            ? `Missed call from ${student.first_name || ''} ${student.last_name || ''} (${phone}). Logged to CRM.`
            : `Missed call from ${phone}. Logged to CRM.`
        );
      } catch (err) {
        console.warn('Failed to upload missed call online, queueing offline:', err);
        await queueOfflineCall({
          mobile_call_id: mobileCallId,
          student: student?.id,
          customer_number: phone,
          caller_number: phone,
          call_direction: 'INCOMING',
          call_status: 'MISSED',
          call_duration: 0,
          notes: `Missed incoming call from ${phone}`
        });
      }
    });

    const unsubscribe = listenToCallState(async (event) => {
      console.log('GlobalCallListener State Event:', event);
      const { state, phoneNumber } = event;

      if (state === 'RINGING') {
        // Tells dialpad.tsx (mentor mode) to ignore native recording events of this incoming call
        incomingFlagTokenRef.current = beginIncomingCall();
        startMentorSession(phoneNumber);
        // Ensure no active timer is running during ringing/incoming alerts
        stopTimer();
        isIncomingRef.current = true;
        isOffhookRef.current = false;
        incomingPhoneRef.current = phoneNumber;
        callStartTimeRef.current = null;
        ringStartTimeRef.current = Date.now();
        setDisplayPhone(phoneNumber);
        setRingingPhone(phoneNumber || 'Unknown Number');
        setRingingLeadInfo(null);
        setShowRingingBanner(true);
        // Animate banner sliding in from top
        Animated.spring(bannerAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
          friction: 10,
        }).start();

        // Pre-fetch CRM lead info while phone is ringing
        if (phoneNumber) {
          fetchLeadInfo(phoneNumber);
          // Also update the ringing banner's lead lookup
          setLoadingRingingLead(true);
          try {
            const cleanPhone = phoneNumber.replace(/\D/g, '').slice(-10);
            const res = await client.get('/core/students/', { params: { search: cleanPhone } });
            const data = res.data?.results || res.data || [];
            if (data.length > 0) setRingingLeadInfo(data[0]);
          } catch (_) {}
          finally { setLoadingRingingLead(false); }
        }
      } 
      else if (state === 'OFFHOOK') {
        // Incoming call was answered — hide banner, start UI timer
        if (isIncomingRef.current) {
          isOffhookRef.current = true;
          // Slide banner out
          Animated.timing(bannerAnim, {
            toValue: -120,
            duration: 250,
            useNativeDriver: true,
          }).start(() => setShowRingingBanner(false));

          callStartTimeRef.current = Date.now();
          startTimer();
          
          if (Platform.OS === 'android') {
            const path = await startNativeRecording(incomingPhoneRef.current || "");
            console.log("Global incoming call recording fallback:", path);
          }
        }
      } 
      else if (state === 'IDLE') {
        // Stop timer IMMEDIATELY on IDLE before ANY asynchronous CallLog/recording processing
        stopTimer();

        // Call ended (answered or missed) — hide banner, show post-call modal
        Animated.timing(bannerAnim, {
          toValue: -120,
          duration: 250,
          useNativeDriver: true,
        }).start(() => setShowRingingBanner(false));

        if (isIncomingRef.current) {
          const mentorSession = mentorSessionRef.current;
          if (mentorSession) mentorSession.ended = true;
          let foundRecording: string | null = null;
          const endTime = Date.now();
          // Previous session's end, captured BEFORE the CallLog lookup and stopNativeRecording() (which
          // moves it): the floor for the CallLog row and for the recording search
          const prevSessionEndMs = getLastCallSessionEndTimeMs();
          const rawStart = callStartTimeRef.current || (Date.now() - 5000);
          const startTime = Math.max(rawStart, prevSessionEndMs);
          // CallLog.DATE of an incoming call is when it started ringing
          const ringStart = Math.max(ringStartTimeRef.current || rawStart, prevSessionEndMs);
          const wasOffhook = isOffhookRef.current;
          const phone = incomingPhoneRef.current || displayPhone;

          let authoritativeDuration = 0;
          let isConnected = false;
          let callLogUnreadable = false;
          let callLogRowId: number | null = null;

          if (wasOffhook && startTime) {
            if (Platform.OS === 'android' && phone) {
              // Pure reads, polled for up to ~10s while the phone writes the row
              const lookup = await waitForCallLogEntry(phone, ringStart, prevSessionEndMs, 'INCOMING', { timeoutMs: 10_000 });
              if (lookup.kind === 'found') {
                authoritativeDuration = lookup.entry.durationSec;
                isConnected = authoritativeDuration > 0;
                callLogRowId = lookup.entry.rowId;
              } else if (lookup.kind === 'unreadable') {
                // READ_CALL_LOG off: status unknown, keep the recording instead of discarding it
                callLogUnreadable = true;
                console.warn(`[calllog] incoming: CallLog unreadable (${lookup.reason}), keeping the recording`);
              }
            }
          }

          if (Platform.OS === 'android' && wasOffhook && (callLogUnreadable || (isConnected && authoritativeDuration > 0))) {
            const consumedSet = await getConsumedRecordings();
            let path = await stopNativeRecording(prevSessionEndMs);
            if (path && isRecordingConsumed(path, consumedSet)) {
              path = null;
            }
            if (!path && phone) {
              path = await findRecentRecordingInMappedFolder(
                phone, startTime, endTime, consumedSet, prevSessionEndMs, authoritativeDuration, { label: 'incoming' }
              );
            }
            if (path && !isRecordingConsumed(path, consumedSet)) {
              setRecordedFilePath(path);
              foundRecording = path;
              const exactDuration = await extractDurationFromAudio(path);
              if (exactDuration && exactDuration > 0) {
                authoritativeDuration = exactDuration;
              }
            } else {
              setRecordedFilePath(null);
            }
          } else if (Platform.OS === 'android') {
            await cancelNativeRecording();
            setRecordedFilePath(null);
          }

          // Outcome decided: consume the CallLog row exactly once (also for a missed row)
          if (callLogRowId !== null) await markCallLogRowConsumed(callLogRowId, endTime);

          markCallSessionEnded(Date.now());

          // CallLog unreadable: a found recording with a real duration is the evidence the call connected
          if (callLogUnreadable && authoritativeDuration > 0) isConnected = true;

          // Unified rule: duration > 0 -> CONNECTED, duration == 0 -> MISSED
          const finalDuration = isConnected && authoritativeDuration > 0 ? authoritativeDuration : 0;
          const finalStatus = finalDuration > 0 ? 'CONNECTED' : 'MISSED';

          setCallDuration(finalDuration);
          setCallStatusState(finalStatus);
          setManualRecordingFile(null);
          setPostCallNotes('');
          setNextFollowupDate(null);

          // Mentor path. isMentor was resolved from the cached role at RINGING; for everyone else this
          // block is skipped and the modal opens exactly as before.
          if (mentorSession?.isMentor) {
            const matches = await mentorMatchDecision(mentorSession);
            if (matches && matches.length > 0) {
              mentorSession.callStartMs = wasOffhook ? startTime : ringStart;
              mentorSession.callEndMs = endTime;
              if (finalStatus === 'CONNECTED') {
                mentorSession.window = { start: startTime, end: endTime, prevEnd: prevSessionEndMs, seconds: finalDuration };
              }
              // One file per call: drop a file already held by another call, reserve ours
              if (foundRecording) {
                const reserved = await getReservedRecordings(mentorSession.mobileCallId);
                if (isRecordingConsumed(foundRecording, reserved)) {
                  setRecordedFilePath(null);
                } else {
                  // Awaited: the reservation must be stored before endIncomingCall() below lets dialpad accept
                  // recording events again, so a late native event for this file is rejected as "reserved"
                  await reserveRecording(foundRecording, mentorSession.mobileCallId);
                }
              }
              mentorRecordingRemovedRef.current = false;
              setMentorMatches(matches);
              setMentorStudentId(matches.length === 1 ? matches[0].id : null);
              setMentorOutcome(finalStatus === 'CONNECTED' ? 'CALL_DONE' : 'NO_ANSWER');
              setMentorNoMatchNote(null);
              setMentorReview(mentorSession);
              if (finalStatus === 'MISSED' && matches.length === 1) {
                autoSaveMentorMissed(mentorSession, matches[0].id);
              }
            } else {
              // No student of this mentor (or lookup failed): the current CRM flow handles the call
              setMentorReview(null);
              setMentorNoMatchNote(matches === null
                ? "Couldn't look up your students (network), so this call is saved to the CRM call log, not to student feedback."
                : 'No student of yours has this number, so this call is saved to the CRM call log, not to student feedback.');
            }
          }

          // Show post-call review modal
          setIsModalVisible(true);
          // The incoming call's recording has been handled: dialpad may accept recording events again
          endIncomingCall(incomingFlagTokenRef.current);
        }
        
        // Reset tracking refs
        isIncomingRef.current = false;
        isOffhookRef.current = false;
        callStartTimeRef.current = null;
        ringStartTimeRef.current = null;
        incomingPhoneRef.current = null;
      }
    });

    return () => {
      unsubscribe();
      unsubscribeMissed();
      appStateSub.remove();
      stopTimer();
    };
  }, []);

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

  const fetchLeadInfo = async (phone: string) => {
    setLoadingLead(true);
    setHasExplicitStageChange(false);
    try {
      // Clean phone to search
      const cleanPhone = phone.replace(/\D/g, '').slice(-10); // get last 10 digits
      const res = await client.get('/core/students/', { params: { search: cleanPhone } });
      const data = res.data?.results || res.data || [];
      
      if (data.length > 0) {
        setLeadInfo(data[0]); // match found!
        const currentStage = data[0]?.lead_stage_id ?? data[0]?.lead_status;
        setPipelineStatus(currentStage !== undefined && currentStage !== null ? String(currentStage) : '');
      } else {
        setLeadInfo(null); // Unknown caller
        setPipelineStatus('');
      }
    } catch (err) {
      console.log('Failed to find lead globally:', err);
      setLeadInfo(null);
      setPipelineStatus('');
    } finally {
      setLoadingLead(false);
    }
  };

  const startTimer = () => {
    stopTimer();
    setCallDuration(0);
    timerRef.current = setInterval(() => {
      if (callStartTimeRef.current) {
        setCallDuration(Math.max(0, Math.floor((Date.now() - callStartTimeRef.current) / 1000)));
      } else {
        setCallDuration(prev => prev + 1);
      }
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleSaveCall = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    const mobileCallId = generateMobileCallId(displayPhone, 'INCOMING');
    
    // UNIFIED RULE:
    // duration > 0 -> CONNECTED
    // duration == 0 -> MISSED
    const isConnected = callDuration > 0 && callStatusState === 'CONNECTED';
    const status = isConnected ? 'CONNECTED' : 'MISSED';
    const finalDuration = isConnected ? callDuration.toString() : '0';
    const notesContent = postCallNotes
      ? `Incoming Call - Duration: ${formatDuration(callDuration)}\nNotes: ${postCallNotes}`
      : (isConnected ? `Incoming Call from ${displayPhone} (CONNECTED, ${formatDuration(callDuration)})` : `Missed Incoming Call from ${displayPhone}`);

    const parameters: Record<string, string> = {
      mobile_call_id: mobileCallId,
      customer_number: displayPhone,
      caller_number: displayPhone,
      interaction_type: 'CALL',
      call_duration: finalDuration,
      call_direction: 'INCOMING',
      call_status: status,
      notes: notesContent,
    };
    if (leadInfo?.id) parameters.student = leadInfo.id.toString();
    if (hasExplicitStageChange && pipelineStatus && leadInfo?.id) {
      parameters.pipeline_status = String(pipelineStatus);
    }
    if (nextFollowupDate && leadInfo?.id) {
      parameters.next_followup_date = nextFollowupDate.toISOString();
    }

    let fileUriToUpload: string | null = null;
    let mimeType = 'audio/m4a';
    let fileName = `incoming_record_${Date.now()}.m4a`;

    if (isConnected && recordedFilePath) {
      fileUriToUpload = recordedFilePath;
      if (!fileUriToUpload.startsWith('file://') && !fileUriToUpload.startsWith('content://')) {
        fileUriToUpload = `file://${fileUriToUpload}`;
      }
      const extMatch = fileUriToUpload.match(/\.([a-zA-Z0-9]+)$/);
      const ext = extMatch ? extMatch[1].toLowerCase() : 'm4a';
      if (ext === 'mp3') mimeType = 'audio/mpeg';
      else if (ext === 'wav') mimeType = 'audio/wav';
      else if (ext === 'amr') mimeType = 'audio/amr';
      else if (ext === 'aac') mimeType = 'audio/aac';

      const cleanPhone = (displayPhone || '').replace(/\D/g, '').slice(-10);
      fileName = `incoming_record_${cleanPhone ? cleanPhone + '_' : ''}${Date.now()}.${ext}`;
    } else if (isConnected && manualRecordingFile) {
      fileUriToUpload = manualRecordingFile.uri;
      mimeType = manualRecordingFile.mimeType || 'audio/mpeg';
      const cleanPhone = (displayPhone || '').replace(/\D/g, '').slice(-10);
      fileName = manualRecordingFile.name || `record_${cleanPhone ? cleanPhone + '_' : ''}${Date.now()}.mp3`;
    }

    try {
      // 1. Post lightweight metadata to create the interaction record promptly (< 200ms)
      const res = await client.post('/crm/interactions/', parameters);
      const serverInteractionId = res.data?.id;

      // 2. If there is an audio recording, kick off asynchronous background upload
      if (fileUriToUpload && serverInteractionId) {
        uploadCallRecordingAsync({
          interactionId: serverInteractionId,
          mobileCallId,
          fileUri: fileUriToUpload,
          mimeType,
          fileName,
        }).catch((err) => {
          console.warn('[GlobalCallListener] Asynchronous recording upload error:', err);
        });

        Alert.alert('✅ Saved', 'Call logged to CRM. Audio recording is uploading in the background.');
      } else {
        Alert.alert('✅ Saved', 'Call logged to CRM successfully.');
      }

      // The follow-up reminder is now a server push ("Follow-up due", crm send_task_reminders)

      resetModal();
    } catch (error: any) {
      console.warn('Failed to upload incoming call log online, queueing offline:', error?.response?.data || error);
      await queueOfflineCall({
        mobile_call_id: mobileCallId,
        student: leadInfo?.id,
        customer_number: displayPhone,
        caller_number: displayPhone,
        call_direction: 'INCOMING',
        call_status: status,
        call_duration: isConnected ? callDuration : 0,
        notes: postCallNotes 
          ? `Incoming Call - Duration: ${formatDuration(callDuration)}\nNotes: ${postCallNotes}` 
          : (isConnected ? `Incoming Call from ${displayPhone} (CONNECTED, ${formatDuration(callDuration)})` : `Missed Incoming Call from ${displayPhone}`),
        pipeline_status: hasExplicitStageChange && pipelineStatus ? String(pipelineStatus) : undefined,
        next_followup_date: nextFollowupDate?.toISOString(),
        recordedFilePath: isConnected ? recordedFilePath : null
      });
      Alert.alert('Saved Offline', 'Call logged locally and will sync automatically.');
      resetModal();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Android has no combined date+time picker (mode="datetime" silently shows date only and keeps the
  // time of day the picker was opened), so ask for the date, then the time, like dialpad.tsx does
  const openFollowupPicker = () => {
    if (Platform.OS !== 'android') {
      setShowDatePicker(true);
      return;
    }
    DateTimePickerAndroid.open({
      value: nextFollowupDate || new Date(),
      mode: 'date',
      minimumDate: new Date(),
      onChange: (event, selectedDate) => {
        if (event.type !== 'set' || !selectedDate) return;
        // Small delay to prevent dialog swallow on Android
        setTimeout(() => {
          DateTimePickerAndroid.open({
            value: selectedDate,
            mode: 'time',
            onChange: (timeEvent, selectedTime) => {
              if (timeEvent.type === 'set' && selectedTime) setNextFollowupDate(selectedTime);
            },
          });
        }, 100);
      },
    });
  };

  const resetModal = () => {
    stopTimer();
    setIsModalVisible(false);
    setPostCallNotes('');
    setPipelineStatus('');
    setHasExplicitStageChange(false);
    setRecordedFilePath(null);
    setManualRecordingFile(null);
    setNextFollowupDate(null);
    setLeadInfo(null);
    setDisplayPhone('');
    setCallDuration(0);
    setCallStatusState('MISSED');
    // Mentor-path state (always empty for sales users)
    setMentorReview(null);
    setMentorMatches([]);
    setMentorStudentId(null);
    setMentorNoMatchNote(null);
  };

  // ── Mentor review: Save / Dismiss ──
  const handleMentorSave = async () => {
    const s = mentorReview;
    if (isSubmitting || !s) return;
    const studentId = mentorStudentId;
    if (!studentId) {
      Alert.alert('Choose the student', 'More than one of your students has this number. Pick who called.');
      return;
    }
    const isConnected = callDuration > 0 && callStatusState === 'CONNECTED';
    const payload = buildMentorPayload(s, {
      status: mentorOutcome, notes: postCallNotes, connected: isConnected, duration: callDuration, followup: nextFollowupDate,
    });

    // A manually picked file wins over the auto recording (same rule as dialpad.tsx)
    const sourceUri = isConnected ? (manualRecordingFile?.uri || recordedFilePath) : null;
    let recording: { uri: string; name: string; type: string } | null = null;
    if (sourceUri) {
      const uri = sourceUri.startsWith('/') ? `file://${sourceUri}` : sourceUri;
      const ext = (uri.match(/\.([a-zA-Z0-9]+)$/)?.[1] || 'm4a').toLowerCase();
      const types: Record<string, string> = { mp3: 'audio/mpeg', wav: 'audio/wav', amr: 'audio/amr', aac: 'audio/aac', m4a: 'audio/mp4', mp4: 'audio/mp4' };
      recording = { uri, name: `incoming_recording_${Date.now()}.${ext}`, type: types[ext] || 'audio/mp4' };
    }
    // Connected, no file yet, not removed on purpose: the phone's recorder may still be writing it
    const lateRecording = (isConnected && !sourceUri && !mentorRecordingRemovedRef.current && Platform.OS === 'android' && s.window)
      ? { phone: s.phone, callStartMs: s.window.start, callEndMs: s.window.end, prevSessionEndMs: s.window.prevEnd, connectedSeconds: s.window.seconds }
      : null;

    setIsSubmitting(true);
    try {
      await addStudentFeedback(studentId, payload);   // idempotent on mobile_call_id (updates the missed row)
    } catch (e: any) {
      setIsSubmitting(false);
      if (isRetryableError(e)) {
        await queueMentorIncomingFeedback({ mobileCallId: s.mobileCallId, studentId, userKey: s.userKey, payload, recording, lateRecording });
        Alert.alert('Saved offline', 'Call feedback saved on this phone and will sync automatically.');
        resetModal();
      } else {
        Alert.alert('Could not save', describeApiError(e));   // stay on the modal so nothing is lost
      }
      return;
    }

    if (recording) {
      try {
        await uploadFeedbackRecording(studentId, { mobileCallId: s.mobileCallId, ...recording });
        if (sourceUri) await markRecordingConsumed(sourceUri);
        await releaseRecordingReservation({ mobileCallId: s.mobileCallId });
      } catch (e: any) {
        setIsSubmitting(false);
        if (isRetryableError(e)) {
          await queueMentorIncomingFeedback({ mobileCallId: s.mobileCallId, studentId, userKey: s.userKey, payload, recording, feedbackSaved: true });
          Alert.alert('✅ Saved', 'Call feedback saved. The recording will upload when the connection is back.');
          resetModal();
        } else {
          // Feedback is saved; keep the modal so the same recording can be retried (both calls are idempotent)
          Alert.alert('Saved, recording failed', `Feedback saved, but the recording upload failed:\n${describeApiError(e)}`, [
            { text: 'Close without recording', style: 'destructive', onPress: () => { releaseRecordingReservation({ mobileCallId: s.mobileCallId }); resetModal(); } },
            { text: 'Retry upload', onPress: () => { handleMentorSave(); } },
          ]);
        }
        return;
      }
    } else {
      releaseRecordingReservation({ mobileCallId: s.mobileCallId });
      if (lateRecording) {
        await queuePendingMentorRecording({ mobileCallId: s.mobileCallId, studentId, ...lateRecording });
      }
    }

    setIsSubmitting(false);
    Alert.alert('✅ Saved', lateRecording
      ? "Call feedback saved. The phone's call recording will upload automatically when it's available."
      : 'Call feedback saved.');
    resetModal();
  };

  // Answered call: nothing is saved. Missed call: the automatically saved row stays.
  const handleMentorDismiss = () => {
    if (mentorReview) releaseRecordingReservation({ mobileCallId: mentorReview.mobileCallId });
    resetModal();
  };

  // StudentFeedback.next_followup_date is a DateField: date only
  const openMentorFollowupPicker = () => {
    if (Platform.OS !== 'android') {
      setShowDatePicker(true);
      return;
    }
    DateTimePickerAndroid.open({
      value: nextFollowupDate || new Date(),
      mode: 'date',
      minimumDate: new Date(),
      onChange: (event, selectedDate) => {
        if (event.type === 'set' && selectedDate) setNextFollowupDate(selectedDate);
      },
    });
  };

  const pickRecordingFile = async () => {
    try {
      if (callStatusState !== 'CONNECTED' || callDuration <= 0) {
        Alert.alert('Unconnected Call', 'Recordings cannot be attached to missed or unanswered calls.');
        return;
      }
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

  // Mentor review body: student, outcome, notes, follow-up date, recording. Saves to StudentFeedback.
  const renderMentorReview = () => {
    const isConnected = callStatusState === 'CONNECTED' && callDuration > 0;
    const chosen = mentorMatches.find((m) => m.id === mentorStudentId) || null;
    return (
      <>
        {mentorMatches.length > 1 ? (
          <>
            <Text style={styles.label}>Who called? ({mentorMatches.length} of your students have this number)</Text>
            {mentorMatches.map((m) => {
              const active = m.id === mentorStudentId;
              return (
                <TouchableOpacity key={m.id} onPress={() => setMentorStudentId(m.id)}
                                  style={[styles.leadMatchBox, active ? styles.mentorPickActive : null]}>
                  <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={16} color="#3182CE" />
                  <Text style={styles.leadMatchText}>
                    <Text style={{ fontWeight: 'bold' }}>{m.name}</Text>{m.batchName ? ` · ${m.batchName}` : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </>
        ) : chosen ? (
          <View style={styles.leadMatchBox}>
            <Ionicons name="school-outline" size={16} color="#3182CE" />
            <Text style={styles.leadMatchText}>
              Student: <Text style={{ fontWeight: 'bold' }}>{chosen.name}</Text>{chosen.batchName ? ` · ${chosen.batchName}` : ''}
            </Text>
          </View>
        ) : null}

        <Text style={styles.durationText}>
          {isConnected ? 'Incoming call · ' : 'Missed incoming call · '}
          Duration: <Text style={{ fontWeight: 'bold', color: '#1A202C' }}>{formatDuration(callDuration)}</Text>
        </Text>
        {!isConnected && mentorMatches.length === 1 ? (
          <Text style={styles.mentorHint}>The missed call is already saved. Save again to add notes or a follow-up.</Text>
        ) : null}
        {!isConnected && mentorMatches.length > 1 ? (
          <Text style={styles.mentorHint}>Several of your students share this number, so the missed call goes to the CRM call log. Pick the student and Save to add it to their feedback.</Text>
        ) : null}

        <Text style={styles.label}>Outcome</Text>
        <View style={styles.outcomeWrap}>
          {MENTOR_FEEDBACK_STATUSES.map((o) => {
            const active = mentorOutcome === o.value;
            // The backend rejects "Call Done" on a call the phone logged as not connected
            const disabled = !isConnected && o.value === 'CALL_DONE';
            return (
              <TouchableOpacity key={o.value} disabled={disabled} onPress={() => setMentorOutcome(o.value)}
                                style={[styles.outcomeChip, active && styles.outcomeChipActive, disabled && { opacity: 0.35 }]}>
                <Text style={[styles.outcomeChipText, active && { color: '#FFF' }]}>{o.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

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
        <TouchableOpacity onPress={openMentorFollowupPicker} style={styles.datePickerBtn}>
          <Ionicons name="calendar-outline" size={18} color="#3182CE" />
          <Text style={{ color: nextFollowupDate ? '#1A202C' : '#A0AEC0', fontSize: 14 }}>
            {nextFollowupDate ? nextFollowupDate.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : 'Tap to set follow-up date'}
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
            mode="date"
            minimumDate={new Date()}
            onChange={(event, selectedDate) => {
              setShowDatePicker(false);
              if (event.type === 'set' && selectedDate) setNextFollowupDate(selectedDate);
            }}
          />
        )}

        {isConnected && (
          <>
            <Text style={[styles.label, { marginTop: 20 }]}>Call Recording</Text>
            {(recordedFilePath || manualRecordingFile) ? (
              <View style={styles.recordingSuccessBox}>
                <Ionicons name="checkmark-circle" size={20} color="#38A169" />
                <Text style={{ color: '#276749', fontSize: 13, flex: 1 }} numberOfLines={1}>
                  {manualRecordingFile ? manualRecordingFile.name : `Auto-recorded: ${recordedFilePath!.split('/').pop()} ✅`}
                </Text>
                <TouchableOpacity onPress={() => {
                  mentorRecordingRemovedRef.current = true;   // don't queue a late recording either
                  if (mentorReview) releaseRecordingReservation({ mobileCallId: mentorReview.mobileCallId });
                  setRecordedFilePath(null);
                  setManualRecordingFile(null);
                }}>
                  <Ionicons name="trash-outline" size={18} color="#EF4444" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={pickRecordingFile} style={styles.uploadBtn}>
                <Ionicons name="cloud-upload-outline" size={20} color="#3182CE" />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#3182CE', fontWeight: '700', fontSize: 13 }}>Upload Call Recording</Text>
                  <Text style={{ color: '#718096', fontSize: 11, marginTop: 2 }}>
                    {Platform.OS === 'android' && !mentorRecordingRemovedRef.current
                      ? "Not found yet. It will upload automatically when the phone saves it."
                      : 'Audio not found automatically'}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          </>
        )}

        <TouchableOpacity
          style={[styles.saveBtn, isSubmitting && { backgroundColor: '#A0AEC0' }]}
          onPress={handleMentorSave}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ActivityIndicator color="#FFF" size="small" />
              <Text style={styles.saveBtnText}>Saving & Uploading...</Text>
            </View>
          ) : (
            <Text style={styles.saveBtnText}>Save Feedback</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.discardBtn} onPress={handleMentorDismiss}>
          <Text style={styles.discardBtnText}>Dismiss</Text>
        </TouchableOpacity>
      </>
    );
  };

  // Mentor ringing banner. Only set for mentors (startMentorSession), and only used for the call it belongs to.
  const activeMentorBanner = mentorBanner && mentorBanner.callId === mentorSessionRef.current?.mobileCallId ? mentorBanner : null;
  const renderMentorBanner = (b: { matches: MentorStudentMatch[] | null; loading: boolean }) => {
    const matches = b.matches || [];
    const title = matches.length === 1
      ? matches[0].name
      : matches.length > 1 ? `${matches.length} students` : (ringingPhone || 'Unknown');
    return (
      <>
        <Text style={styles.ringingName}>{title}</Text>
        <Text style={styles.ringingNumber}>
          {ringingPhone}{matches.length === 1 && matches[0].batchName ? ` · ${matches[0].batchName}` : ''}
        </Text>
        {b.loading ? (
          <ActivityIndicator size="small" color="#fff" style={{ marginTop: 2, alignSelf: 'flex-start' }} />
        ) : matches.length > 0 ? (
          <View style={styles.ringingCrmBadge}>
            <Ionicons name="school-outline" size={12} color="#90CDF4" />
            <Text style={styles.ringingCrmText}>{matches.length === 1 ? 'Your student' : 'Your students share this number'}</Text>
          </View>
        ) : null}
      </>
    );
  };

  // ── Bug 1 Fix: Always render so ringing banner and modal can both appear ──

  return (
    <>
      {/* ── Bug 1 Fix: Live Ringing Banner (appears during RINGING state) ── */}
      {showRingingBanner && (
        <Animated.View
          style={[
            styles.ringingBanner,
            { transform: [{ translateY: bannerAnim }] }
          ]}
        >
          <View style={styles.ringingBannerLeft}>
            <View style={styles.ringingIconCircle}>
              <Ionicons name="call" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.ringingLabel}>Incoming Call</Text>
              {activeMentorBanner ? renderMentorBanner(activeMentorBanner) : (<>
              {loadingRingingLead ? (
                <ActivityIndicator size="small" color="#fff" style={{ marginTop: 2 }} />
              ) : ringingLeadInfo ? (
                <Text style={styles.ringingName}>
                  {ringingLeadInfo.first_name} {ringingLeadInfo.last_name}
                </Text>
              ) : (
                <Text style={styles.ringingName}>{ringingPhone || 'Unknown'}</Text>
              )}
              <Text style={styles.ringingNumber}>{ringingPhone}</Text>
              {ringingLeadInfo && (
                <View style={styles.ringingCrmBadge}>
                  <Ionicons name="person-circle-outline" size={12} color="#90CDF4" />
                  <Text style={styles.ringingCrmText}>CRM Match Found</Text>
                </View>
              )}
              </>)}
            </View>
          </View>
          <TouchableOpacity
            style={styles.ringingDismissBtn}
            onPress={() => {
              Animated.timing(bannerAnim, {
                toValue: -120,
                duration: 250,
                useNativeDriver: true,
              }).start(() => setShowRingingBanner(false));
            }}
          >
            <Text style={styles.ringingDismissText}>Dismiss</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ── Post-Call Review Modal ── */}
      <Modal visible={isModalVisible} animationType="slide" transparent={false} presentationStyle="pageSheet">
        <View style={styles.header}>
          <Text style={styles.headerText}>Incoming Call Review</Text>
        </View>
      
      <ScrollView style={styles.content}>
        {mentorReview ? renderMentorReview() : (<>
        {mentorNoMatchNote ? (
          <View style={styles.mentorNote}>
            <Ionicons name="information-circle-outline" size={16} color="#92400E" />
            <Text style={styles.mentorNoteText}>{mentorNoMatchNote}</Text>
          </View>
        ) : null}
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
                {pipelineStages.map(stage => {
                  const isSelected = isStageMatching(stage, pipelineStatus);
                  return (
                    <TouchableOpacity
                      key={stage.id}
                      onPress={() => {
                        setPipelineStatus(String(stage.id));
                        setHasExplicitStageChange(true);
                      }}
                      style={[styles.stageBadge, isSelected && styles.stageBadgeActive]}
                    >
                      <Text style={[styles.stageText, isSelected && styles.stageTextActive]}>
                        {stage.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
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
            <TouchableOpacity onPress={openFollowupPicker} style={styles.datePickerBtn}>
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

            {showDatePicker && Platform.OS === 'ios' && (
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

        {callStatusState === 'CONNECTED' && (
          <>
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
          </>
        )}

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

        <TouchableOpacity style={styles.discardBtn} onPress={resetModal}>
          <Text style={styles.discardBtnText}>Dismiss</Text>
        </TouchableOpacity>
        </>)}

        <View style={{height: 60}} />
      </ScrollView>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // ── Bug 1: Ringing banner styles ──
  ringingBanner: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 44 : 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    backgroundColor: '#1A365D',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: Platform.OS === 'ios' ? 16 : 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  ringingBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  ringingIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#38A169',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringingLabel: {
    color: '#90CDF4',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  ringingName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 1,
  },
  ringingNumber: {
    color: '#BEE3F8',
    fontSize: 12,
    marginTop: 1,
  },
  ringingCrmBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  ringingCrmText: {
    color: '#90CDF4',
    fontSize: 11,
  },
  ringingDismissBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 8,
  },
  ringingDismissText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
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
  // ── Mentor review ──
  mentorNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FCD34D',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  mentorNoteText: {
    color: '#92400E',
    fontSize: 12,
    flex: 1,
  },
  mentorPickActive: {
    borderColor: '#3182CE',
    borderWidth: 2,
  },
  mentorHint: {
    color: '#718096',
    fontSize: 12,
    marginTop: -16,
    marginBottom: 20,
  },
  outcomeWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  outcomeChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#FEF3C7',
  },
  outcomeChipActive: {
    backgroundColor: '#D97706',
  },
  outcomeChipText: {
    color: '#92400E',
    fontWeight: 'bold',
    fontSize: 12,
  },
});
