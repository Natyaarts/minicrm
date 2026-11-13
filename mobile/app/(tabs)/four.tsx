import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  StyleSheet, FlatList, TextInput, ActivityIndicator, TouchableOpacity, Alert,
  Text, View, useColorScheme, StatusBar, Modal, ScrollView,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../../src/api/client';
import {
  getMentorBatches,
  getMentorStudents,
  getStudentFeedbacks,
  addStudentFeedback,
  getMentorDashboardStats,
  getMentorRecentCalls,
  getMentorBreakMetrics,
} from '../../src/api/mentors';

// ── Constants ───────────────────────────────────────────────────────────────
const FEEDBACK_STATUSES = [
  { value: 'CALL_DONE', label: 'Call Done' },
  { value: 'NO_ANSWER', label: 'No Answer' },
  { value: 'NOT_REACHABLE', label: 'Not Reachable' },
  { value: 'CALL_BACK', label: 'Call Back Later' },
  { value: 'MESSAGE_SENT', label: 'Message Sent' },
  { value: 'OTHER', label: 'Other' },
];

// ── Helpers ─────────────────────────────────────────────────────────────────
const getStudentName = (s: any) =>
  `${s?.first_name || ''} ${s?.last_name || ''}`.trim() || s?.name || 'Unnamed Student';

const getInitials = (name: string) =>
  name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('') || '?';

// 'YYYY-MM-DD' parsed as a local date (new Date('YYYY-MM-DD') is UTC and can shift the day)
const parseYMD = (v?: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

const daysSince = (v?: string | null): number | null => {
  const d = parseYMD(v);
  if (!d) return null;
  const t = new Date();
  const today = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  return Math.round((today.getTime() - d.getTime()) / 86400000);
};

const sinceLabel = (n: number | null) =>
  n === null ? '' : n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`;

const formatDate = (value?: string | null) => {
  if (!value) return '';
  const d = parseYMD(value) || new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const toYMD = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const formatDuration = (seconds?: number) => {
  const total = Number(seconds || 0);
  if (!total) return '';
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m ? `${m}m ${s}s` : `${s}s`;
};

const getRecordingUrl = (value?: string | null) => {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const base = String((client as any)?.defaults?.baseURL || 'https://natyaarts.org')
    .replace(/\/api\/?$/, '')
    .replace(/\/$/, '');
  return `${base}${value.startsWith('/') ? '' : '/'}${value}`;
};

// Same colour language as the Sales stage pills
const academicStyle = (raw: string) => {
  const s = (raw || 'ACTIVE').toUpperCase();
  if (s.includes('BREAK')) return { bg: '#FFEDD5', text: '#9A3412', stripe: '#F97316' };
  if (s.includes('DISCONT')) return { bg: '#FEE2E2', text: '#991B1B', stripe: '#EF4444' };
  if (s.includes('NEW')) return { bg: '#CCFBF1', text: '#115E59', stripe: '#14B8A6' };
  if (s.includes('ACTIVE')) return { bg: '#D1FAE5', text: '#065F46', stripe: '#10B981' };
  return { bg: '#F1F5F9', text: '#475569', stripe: '#94A3B8' };
};

const feedbackStyle = (raw: string) => {
  const s = (raw || '').toUpperCase();
  if (s === 'CALL_DONE') return { bg: '#D1FAE5', text: '#065F46' };
  if (s === 'NO_ANSWER') return { bg: '#FEF3C7', text: '#92400E' };
  if (s === 'NOT_REACHABLE') return { bg: '#FEE2E2', text: '#991B1B' };
  if (s === 'CALL_BACK') return { bg: '#EDE9FE', text: '#5B21B6' };
  if (s === 'MESSAGE_SENT') return { bg: '#CCFBF1', text: '#115E59' };
  return { bg: '#F1F5F9', text: '#475569' };
};

// ── Screen ──────────────────────────────────────────────────────────────────
export default function MentorsScreen() {
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(isDark), [isDark]);

  // View state
  const [viewMode, setViewMode] = useState<'BATCHES' | 'CALLS'>('BATCHES');
  const [selectedBatch, setSelectedBatch] = useState<any>(null);
  const [showAll, setShowAll] = useState(false);
  const inStudents = !!selectedBatch || showAll;
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(role);

  // Batches
  const [batches, setBatches] = useState<any[]>([]);
  const [batchLoading, setBatchLoading] = useState(true);
  const [batchRefreshing, setBatchRefreshing] = useState(false);
  const [batchError, setBatchError] = useState('');
  const [dashStats, setDashStats] = useState<any>(null);
  const [breakStats, setBreakStats] = useState<any>(null);

  // Students
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [studentError, setStudentError] = useState('');
  const studentReq = useRef(0);

  // Student sheet (history + feedback form share one Modal to avoid nested modals)
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetMode, setSheetMode] = useState<'history' | 'form'>('history');
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [status, setStatus] = useState('CALL_DONE');
  const [feedbackText, setFeedbackText] = useState('');
  const [followupDate, setFollowupDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  // Recent calls
  const [recentCalls, setRecentCalls] = useState<any[]>([]);
  const [loadingCalls, setLoadingCalls] = useState(false);
  const [loadingMoreCalls, setLoadingMoreCalls] = useState(false);
  const [hasMoreCalls, setHasMoreCalls] = useState(false);
  const [callsPage, setCallsPage] = useState(1);
  const [callsRefreshing, setCallsRefreshing] = useState(false);

  // Recording playback + folder mapping (same as Sales)
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [mappedFolderUri, setMappedFolderUri] = useState<string | null>(null);
  const [mappedFolderInfo, setMappedFolderInfo] =
    useState<{ folderName: string; audioRecordingsCount: number } | null>(null);

  // Which student we dialled, so we can prompt for feedback on return
  const pendingCallRef = useRef<any>(null);

  // ── Recording folder ──────────────────────────────────────────────────────
  const loadMappedFolder = async () => {
    try {
      const { getMappedRecordingFolder, scanRecordingFolder } = await import('../../src/utils/CallManager');
      const uri = await getMappedRecordingFolder();
      if (!uri) return;
      const info = await scanRecordingFolder(uri);
      if (info && info.accessible) {
        setMappedFolderUri(uri);
        setMappedFolderInfo({ folderName: info.folderName, audioRecordingsCount: info.audioRecordingsCount });
        const { syncMissingRecordings } = await import('../../src/utils/SyncManager');
        syncMissingRecordings().catch(() => {});
      } else {
        setMappedFolderUri(null);
        setMappedFolderInfo(null);
      }
    } catch (_) {}
  };

  const openFolderPickerAndMap = async () => {
    const { pickAndMapRecordingFolder } = await import('../../src/utils/CallManager');
    const result = await pickAndMapRecordingFolder();
    if (result.status === 'selected' && result.uri) {
      const folderName = result.folderInfo?.folderName || 'Selected Folder';
      const recCount = result.folderInfo?.audioRecordingsCount ?? 0;
      setMappedFolderUri(result.uri);
      setMappedFolderInfo({ folderName, audioRecordingsCount: recCount });
      const { syncMissingRecordings } = await import('../../src/utils/SyncManager');
      syncMissingRecordings().catch(() => {});
      Alert.alert(
        'Folder Mapped',
        `Folder: ${folderName}\nAvailable Recordings: ${recCount} audio file(s)\n\nCall recordings will now be scanned from this folder.`
      );
    } else if (result.status === 'denied') {
      Alert.alert('Permission Required', result.errorMessage || 'Grant directory access to scan call recordings.');
    } else if (result.status === 'unsupported') {
      Alert.alert('Not Supported', result.errorMessage || 'Folder mapping is only supported on Android.');
    } else if (result.status === 'error') {
      Alert.alert('Folder Mapping Error', result.errorMessage || 'Unable to open the folder picker.');
    }
  };

  const handleMapFolderPress = async () => {
    if (!mappedFolderUri) {
      await openFolderPickerAndMap();
      return;
    }
    const { scanRecordingFolder } = await import('../../src/utils/CallManager');
    const info = await scanRecordingFolder(mappedFolderUri);
    if (!info || !info.accessible) {
      setMappedFolderUri(null);
      setMappedFolderInfo(null);
      await openFolderPickerAndMap();
      return;
    }
    setMappedFolderInfo({ folderName: info.folderName, audioRecordingsCount: info.audioRecordingsCount });
    Alert.alert(
      'Mapped Recording Folder',
      `Folder: ${info.folderName}\nAvailable Recordings: ${info.audioRecordingsCount} audio file(s)\n\nRecordings in this folder are scanned and linked to calls automatically.`,
      [
        {
          text: 'Rescan Folder',
          onPress: async () => {
            const refreshed = await scanRecordingFolder(mappedFolderUri);
            if (refreshed && refreshed.accessible) {
              setMappedFolderInfo({
                folderName: refreshed.folderName,
                audioRecordingsCount: refreshed.audioRecordingsCount,
              });
              const { syncMissingRecordings } = await import('../../src/utils/SyncManager');
              await syncMissingRecordings().catch(() => {});
              Alert.alert('Scan Complete', `Found ${refreshed.audioRecordingsCount} audio recording(s).`);
            }
          },
        },
        { text: 'Change Folder', onPress: () => openFolderPickerAndMap() },
        { text: 'Close', style: 'cancel' },
      ]
    );
  };

  // ── Audio ─────────────────────────────────────────────────────────────────
  const playAudio = async (rawUrl: string, id: string) => {
    const url = getRecordingUrl(rawUrl);
    if (!url) return;
    if (playingAudio === id) {
      if (sound) await sound.stopAsync();
      setPlayingAudio(null);
      return;
    }
    try {
      if (sound) await sound.unloadAsync();
      const { sound: newSound } = await Audio.Sound.createAsync({ uri: url });
      setSound(newSound);
      setPlayingAudio(id);
      newSound.setOnPlaybackStatusUpdate((st: any) => {
        if (st.isLoaded && st.didJustFinish) setPlayingAudio(null);
      });
      await newSound.playAsync();
    } catch (e) {
      console.log('Audio playback error', e);
      Alert.alert('Error', 'Unable to play this recording.');
    }
  };

  useEffect(() => {
    return () => {
      if (sound) sound.unloadAsync();
    };
  }, [sound]);

  // ── Data loading ──────────────────────────────────────────────────────────
  const loadBatches = useCallback(async (refresh = false) => {
    try {
      if (refresh) setBatchRefreshing(true);
      else setBatchLoading(true);
      setBatchError('');
      getMentorDashboardStats().then(setDashStats).catch(() => {});
      getMentorBreakMetrics().then(setBreakStats).catch(() => {});
      setBatches(await getMentorBatches());
    } catch (err: any) {
      setBatchError(err?.response?.data?.detail || err?.message || 'Unable to load batches');
    } finally {
      setBatchLoading(false);
      setBatchRefreshing(false);
    }
  }, []);

  const loadStudents = useCallback(
    async (opts: { refresh?: boolean; silent?: boolean } = {}) => {
      const reqId = ++studentReq.current;
      try {
        if (opts.refresh) setRefreshing(true);
        else if (!opts.silent) setLoading(true);
        setStudentError('');
        const params: any = { page_size: 1000 };
        if (search.trim()) params.search = search.trim();
        if (!showAll && selectedBatch?.id) params.batch = selectedBatch.id;
        const data = await getMentorStudents(params);
        if (reqId !== studentReq.current) return;
        setStudents(data);
      } catch (err: any) {
        if (reqId !== studentReq.current) return;
        setStudentError(err?.response?.data?.detail || err?.message || 'Unable to load students');
      } finally {
        if (reqId === studentReq.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [search, selectedBatch, showAll]
  );

  const fetchRecentCalls = useCallback(
    async (page = 1, reset = false) => {
      if (page === 1) {
        setLoadingCalls(true);
        if (reset) setRecentCalls([]);
      } else {
        setLoadingMoreCalls(true);
      }
      try {
        const params: any = { calls_only: 'true', page };
        if (search.trim()) params.search = search.trim();
        const raw = await getMentorRecentCalls(params);
        const filtered = raw?.results || (Array.isArray(raw) ? raw : []);
        setRecentCalls(prev => (page === 1 || reset ? filtered : [...prev, ...filtered]));
        setHasMoreCalls(!!raw?.next);
        setCallsPage(page);
      } catch (err) {
        console.log('Failed to fetch recent calls:', err);
      } finally {
        setLoadingCalls(false);
        setLoadingMoreCalls(false);
      }
    },
    [search]
  );

  useEffect(() => {
    loadBatches();
    loadMappedFolder();
  }, [loadBatches]);

  useEffect(() => {
    AsyncStorage.getItem('userInfo')
      .then(v => setRole(String(JSON.parse(v || 'null')?.role || '').toUpperCase()))
      .catch(() => {});
  }, []);

  // Students: debounce search, load immediately when not searching
  useEffect(() => {
    if (!inStudents) return;
    const t = setTimeout(() => loadStudents(), search ? 400 : 0);
    return () => clearTimeout(t);
  }, [inStudents, loadStudents, search]);

  // Calls tab
  useEffect(() => {
    if (viewMode !== 'CALLS') return;
    const t = setTimeout(() => fetchRecentCalls(1, true), search ? 400 : 0);
    return () => clearTimeout(t);
  }, [viewMode, fetchRecentCalls, search]);

  const loadHistory = async (studentId: any) => {
    setHistoryLoading(true);
    try {
      setFeedbacks(await getStudentFeedbacks(studentId));
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.detail || 'Unable to load feedback history.');
    } finally {
      setHistoryLoading(false);
    }
  };

  // ── Navigation ────────────────────────────────────────────────────────────
  const openBatch = (batch: any) => {
    setSelectedBatch(batch);
    setShowAll(false);
    setStudents([]);
    setSearch('');
  };
  const openAllStudents = () => {
    setSelectedBatch(null);
    setShowAll(true);
    setStudents([]);
    setSearch('');
  };
  const backToBatches = () => {
    setSelectedBatch(null);
    setShowAll(false);
    setStudents([]);
    setSearch('');
    setStudentError('');
  };
  const switchTab = (mode: 'BATCHES' | 'CALLS') => {
    setViewMode(mode);
    setSearch('');
  };

  // ── Student sheet ─────────────────────────────────────────────────────────
  const openStudent = (student: any) => {
    setSelectedStudent(student);
    setSheetMode('history');
    setFeedbacks([]);
    setSheetVisible(true);
    loadHistory(student.id);
  };

  const openFeedbackForm = (student?: any) => {
    if (student) setSelectedStudent(student);
    setStatus('CALL_DONE');
    setFeedbackText('');
    setFollowupDate(null);
    setSheetMode('form');
    setSheetVisible(true);
  };

  const submitFeedback = async () => {
    if (!selectedStudent) return;
    try {
      setSaving(true);
      const payload: any = { status, feedback: feedbackText.trim() };
      if (followupDate) payload.next_followup_date = toYMD(followupDate);
      await addStudentFeedback(selectedStudent.id, payload);
      setSheetMode('history');
      loadHistory(selectedStudent.id);
      loadStudents({ silent: true });
      Alert.alert('Saved', 'Feedback saved successfully.');
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error || err?.response?.data?.detail || 'Unable to save feedback.');
    } finally {
      setSaving(false);
    }
  };

  // ── Calling (same dialpad flow as Sales) ──────────────────────────────────
  const callStudent = (student: any) => {
    const phone = student?.mobile || student?.phone;
    if (!phone) {
      Alert.alert('No Phone', 'This student has no phone number.');
      return;
    }
    pendingCallRef.current = student;
    router.push({ pathname: '/dialpad', params: { leadId: student.id, phone } } as any);
  };

  // When the dialpad closes and we are focused again, prompt for call feedback
  useFocusEffect(
    useCallback(() => {
      const s = pendingCallRef.current;
      if (s) {
        pendingCallRef.current = null;
        openFeedbackForm(s);
        loadHistory(s.id);
      }
      if (viewMode === 'CALLS') fetchRecentCalls(1, false);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewMode])
  );

  // ── Stats ─────────────────────────────────────────────────────────────────
  // Exact match (the old substring check counted INACTIVE as ACTIVE)
  const countBy = (key: string) =>
    students.filter(s => String(s.academic_status || 'ACTIVE').toUpperCase() === key).length;
  const totalBatchStudents = batches.reduce((sum, b) => sum + Number(b.student_count || 0), 0);

  const filteredBatches = search.trim()
    ? batches.filter(b => {
        const q = search.trim().toLowerCase();
        const course = typeof b.course === 'object' ? b.course?.name : b.course;
        return (b.name || '').toLowerCase().includes(q) || String(course || b.course_name || '').toLowerCase().includes(q);
      })
    : batches;

  // ── Renderers ─────────────────────────────────────────────────────────────
  const renderRecording = (url: string, id: string) => (
    <TouchableOpacity style={styles.audioPlayerMini} onPress={() => playAudio(url, id)}>
      <FontAwesome5 name={playingAudio === id ? 'stop-circle' : 'play-circle'} size={14} color="#F59E0B" />
      <Text style={styles.audioTextMini}>{playingAudio === id ? 'Playing...' : 'Play Recording'}</Text>
    </TouchableOpacity>
  );

  const renderBatch = ({ item }: { item: any }) => {
    const course = item.course_name || (typeof item.course === 'object' ? item.course?.name : '');
    const fullName = (u: any) =>
      u ? `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username || '' : '';
    const mentor = fullName(item.primary_mentor_details) || (typeof item.primary_mentor === 'string' ? item.primary_mentor : '');
    const teacher = fullName(item.teacher_details) || (typeof item.teacher === 'string' ? item.teacher : '');
    return (
      <TouchableOpacity style={styles.leadRow} onPress={() => openBatch(item)} activeOpacity={0.6}>
        <View style={[styles.stripe, { backgroundColor: '#D97706' }]} />
        <View style={[styles.avatar, { backgroundColor: '#FEF3C7' }]}>
          <FontAwesome5 name="layer-group" size={14} color="#92400E" />
        </View>
        <View style={styles.leadInfo}>
          <Text style={styles.leadName} numberOfLines={1}>{item.name}</Text>
          <View style={styles.metaRow}>
            <View style={[styles.stagePill, { backgroundColor: '#D1FAE5' }]}>
              <Text style={[styles.stageTxt, { color: '#065F46' }]}>{item.student_count ?? 0} students</Text>
            </View>
            <Text style={styles.program} numberOfLines={1}>{course || item.course_name || 'No course'}</Text>
          </View>
          {(mentor || teacher) ? (
            <Text style={styles.phoneRow} numberOfLines={1}>
              {mentor ? `Mentor: ${mentor}` : ''}{mentor && teacher ? '  •  ' : ''}{teacher ? `Teacher: ${teacher}` : ''}
            </Text>
          ) : null}
        </View>
        <FontAwesome5 name="chevron-right" size={12} color="#94A3B8" />
      </TouchableOpacity>
    );
  };

  const renderStudent = ({ item }: { item: any }) => {
    const name = getStudentName(item);
    const raw = item.academic_status || 'ACTIVE';
    const ss = academicStyle(raw);
    const phone = item.mobile || item.phone || '';
    return (
      <TouchableOpacity style={styles.leadRow} onPress={() => openStudent(item)} activeOpacity={0.6}>
        <View style={[styles.stripe, { backgroundColor: ss.stripe }]} />
        <View style={[styles.avatar, { backgroundColor: ss.bg }]}>
          <Text style={[styles.avatarTxt, { color: ss.text }]}>{getInitials(name)}</Text>
        </View>
        <View style={styles.leadInfo}>
          <Text style={styles.leadName} numberOfLines={1}>{name}</Text>
          <View style={styles.metaRow}>
            <View style={[styles.stagePill, { backgroundColor: ss.bg }]}>
              <Text style={[styles.stageTxt, { color: ss.text }]}>{String(raw).replace(/_/g, ' ')}</Text>
            </View>
            {item.program_name ? <Text style={styles.program} numberOfLines={1}>{item.program_name}</Text> : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>
            {phone ? <Text style={[styles.phoneRow, { marginTop: 0 }]} numberOfLines={1}>{phone}</Text> : null}
            {item.crm_student_id ? (
              <Text style={[styles.phoneRow, { marginTop: 0 }]} numberOfLines={1}>• {item.crm_student_id}</Text>
            ) : null}
          </View>
          {'last_feedback_date' in item ? (() => {
            const n = daysSince(item.last_feedback_date);
            const color = n === null ? '#EF4444' : n <= 3 ? '#10B981' : n <= 7 ? '#F59E0B' : '#EF4444';
            const statusLabel = FEEDBACK_STATUSES.find(f => f.value === item.last_feedback_status)?.label;
            return (
              <Text style={[styles.lastFollowTxt, { color }]} numberOfLines={1}>
                {n === null
                  ? 'No follow-up yet'
                  : `Last follow-up: ${formatDate(item.last_feedback_date)} • ${sinceLabel(n)}${statusLabel ? ` • ${statusLabel}` : ''}`}
              </Text>
            );
          })() : null}
          {item.next_followup_date ? (
            <Text style={styles.followupTxt}>Next follow-up: {formatDate(item.next_followup_date)}</Text>
          ) : null}
        </View>
        <TouchableOpacity
          style={styles.callBtn}
          onPress={() => callStudent(item)}
          hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
        >
          <FontAwesome5 name="phone-alt" size={14} color="#F59E0B" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const renderRecentCall = ({ item }: { item: any }) => {
    const fs = feedbackStyle(item.status);
    const recording = item.recording_url || item.audio_recording;
    const duration = formatDuration(item.call_duration);
    const when = item.feedback_date || item.created_at;
    const formattedTime = when
      ? new Date(when).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '';
    const phone = item.student_phone || item.customer_number || '';

    return (
      <TouchableOpacity
        style={styles.historyCard}
        onPress={() => {
          if (item.student) openStudent({ id: item.student, name: item.student_name, mobile: phone });
        }}
      >
        <View style={styles.historyLeft}>
          <View style={styles.historyIcon}>
            <FontAwesome5 name="phone" size={14} color="#10B981" />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.historyName}>{item.student_name || `Student ID: ${item.student}`}</Text>
            <Text style={styles.historyPhone}>{phone || 'No Phone'}</Text>
            <View style={[styles.stagePill, { backgroundColor: fs.bg, alignSelf: 'flex-start', marginTop: 4 }]}>
              <Text style={[styles.stageTxt, { color: fs.text }]}>{item.status_display || item.status || 'Call'}</Text>
            </View>
            {item.feedback ? <Text style={styles.historyNotes} numberOfLines={4}>{item.feedback}</Text> : null}
            {item.mentor_name ? <Text style={styles.feedbackMeta}>By {item.mentor_name}</Text> : null}
            {recording ? renderRecording(recording, `call-${item.id}`) : null}
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', justifyContent: 'space-between', minHeight: 40 }}>
          <Text style={styles.historyTime}>{formattedTime}</Text>
          {duration ? (
            <View style={styles.durationBadge}>
              <Text style={styles.durationText}>{duration}</Text>
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  const renderFeedback = (item: any) => {
    const fs = feedbackStyle(item.status);
    const recording = item.recording_url || item.audio_recording;
    const duration = formatDuration(item.call_duration);
    const hasCall = item.call_status || item.call_direction || item.customer_number || duration || recording;
    return (
      <View key={item.id} style={styles.feedbackCard}>
        <View style={styles.feedbackHeader}>
          <View style={[styles.stagePill, { backgroundColor: fs.bg }]}>
            <Text style={[styles.stageTxt, { color: fs.text }]}>{item.status_display || item.status || 'Feedback'}</Text>
          </View>
          <Text style={styles.historyTime}>{formatDate(item.feedback_date)}</Text>
        </View>
        {item.feedback ? <Text style={styles.feedbackText}>{item.feedback}</Text> : null}
        {item.mentor_name ? <Text style={styles.feedbackMeta}>By {item.mentor_name}</Text> : null}
        {item.next_followup_date ? (
          <Text style={styles.followupTxt}>Next follow-up: {formatDate(item.next_followup_date)}</Text>
        ) : null}
        {hasCall ? (
          <View style={styles.callDetails}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <FontAwesome5 name="phone" size={11} color="#10B981" />
              {item.call_direction ? <Text style={styles.callInfo}>{item.call_direction}</Text> : null}
              {item.call_status ? <Text style={styles.callInfo}>• {item.call_status}</Text> : null}
              {duration ? (
                <View style={styles.durationBadge}>
                  <Text style={styles.durationText}>{duration}</Text>
                </View>
              ) : null}
            </View>
            {item.customer_number ? <Text style={styles.callInfo}>{item.customer_number}</Text> : null}
            {recording ? renderRecording(recording, `fb-${item.id}`) : null}
          </View>
        ) : null}
      </View>
    );
  };

  const emptyBlock = (icon: string, title: string, sub?: string) => (
    <View style={styles.center}>
      <FontAwesome5 name={icon} size={36} color="#CBD5E1" />
      <Text style={styles.emptyTitle}>{title}</Text>
      {sub ? <Text style={styles.emptySub}>{sub}</Text> : null}
    </View>
  );

  const errorBlock = (msg: string, onRetry: () => void) => (
    <View style={styles.center}>
      <Text style={{ color: '#EF4444', textAlign: 'center' }}>{msg}</Text>
      <TouchableOpacity style={styles.retryBtn} onPress={onRetry}>
        <Text style={styles.retryTxt}>Retry</Text>
      </TouchableOpacity>
    </View>
  );

  const loadingBlock = (label: string) => (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#F59E0B" />
      <Text style={{ color: '#94A3B8', marginTop: 10, fontSize: 13 }}>{label}</Text>
    </View>
  );

  // ── Header subtitle ───────────────────────────────────────────────────────
  const folderSuffix = mappedFolderInfo
    ? ` • ${mappedFolderInfo.folderName} (${mappedFolderInfo.audioRecordingsCount} rec)`
    : '';
  const subtitle = inStudents
    ? `${students.length} students${folderSuffix}`
    : viewMode === 'CALLS'
    ? `Recent calls${folderSuffix}`
    : `${batches.length} batches${folderSuffix}`;

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* HEADER */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top + 8, 16) }]}>
        <View style={styles.headerTop}>
          {inStudents && (
            <TouchableOpacity
              style={styles.backBtn}
              onPress={backToBatches}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <FontAwesome5 name="chevron-left" size={13} color="#F59E0B" />
            </TouchableOpacity>
          )}
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {inStudents ? (showAll ? 'All Students' : selectedBatch?.name) : 'Mentors'}
            </Text>
            <Text style={styles.headerSub} numberOfLines={1}>{subtitle}</Text>
          </View>
          <TouchableOpacity
            style={[styles.mapBtn, mappedFolderUri && { backgroundColor: '#10B981' }]}
            onPress={handleMapFolderPress}
          >
            <FontAwesome5 name="folder-open" size={13} color="#fff" />
            <Text style={styles.mapBtnTxt}>{mappedFolderUri ? 'Folder Mapped' : 'Map Folder'}</Text>
          </TouchableOpacity>
        </View>

        {/* Stats */}
        {viewMode === 'BATCHES' && !inStudents && (
          <View style={styles.statsRow}>
            <View style={[styles.statCard, { borderLeftColor: '#F59E0B' }]}>
              <Text style={styles.statVal}>{batches.length}</Text>
              <Text style={styles.statLbl}>Batches</Text>
            </View>
            <View style={[styles.statCard, { borderLeftColor: '#10B981' }]}>
              <Text style={[styles.statVal, { color: '#10B981' }]}>{dashStats?.students_all ?? totalBatchStudents}</Text>
              <Text style={styles.statLbl}>Students</Text>
            </View>
            <View style={[styles.statCard, { borderLeftColor: '#F59E0B' }]}>
              <Text style={[styles.statVal, { color: '#F59E0B' }]}>{dashStats?.students ?? '-'}</Text>
              <Text style={styles.statLbl}>Active</Text>
            </View>
          </View>
        )}
        {inStudents && (
          <View style={styles.statsRow}>
            <View style={[styles.statCard, { borderLeftColor: '#F59E0B' }]}>
              <Text style={styles.statVal}>{showAll ? (dashStats?.students_all ?? students.length) : students.length}</Text>
              <Text style={styles.statLbl}>Total</Text>
            </View>
            <View style={[styles.statCard, { borderLeftColor: '#10B981' }]}>
              <Text style={[styles.statVal, { color: '#10B981' }]}>{showAll ? (dashStats?.students ?? countBy('ACTIVE')) : countBy('ACTIVE')}</Text>
              <Text style={styles.statLbl}>Active</Text>
            </View>
            <View style={[styles.statCard, { borderLeftColor: '#F97316' }]}>
              <Text style={[styles.statVal, { color: '#F97316' }]}>{showAll ? (breakStats?.on_break_count ?? countBy('ON_BREAK')) : countBy('ON_BREAK')}</Text>
              <Text style={styles.statLbl}>On Break</Text>
            </View>
            <View style={[styles.statCard, { borderLeftColor: '#EF4444' }]}>
              <Text style={[styles.statVal, { color: '#EF4444' }]}>{showAll ? (breakStats?.discontinued_count ?? countBy('DISCONTINUED')) : countBy('DISCONTINUED')}</Text>
              <Text style={styles.statLbl}>Dropped</Text>
            </View>
          </View>
        )}

        {/* Search */}
        <View style={styles.searchBar}>
          <FontAwesome5 name="search" size={14} color="#94A3B8" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder={
              inStudents ? 'Search name, ID or mobile...'
              : viewMode === 'CALLS' ? 'Search calls by name or phone...'
              : 'Search batches...'
            }
            placeholderTextColor="#94A3B8"
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <FontAwesome5 name="times-circle" size={15} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        {/* Tabs */}
        {!inStudents && (
          <View style={styles.tabContainer}>
            {([['BATCHES', 'Batches'], ['CALLS', 'Recent Calls']] as const).map(([mode, label]) => (
              <TouchableOpacity
                key={mode}
                style={[styles.tabBtn, viewMode === mode && styles.tabBtnActive]}
                onPress={() => switchTab(mode)}
              >
                <Text style={[styles.tabTxt, viewMode === mode && styles.tabTxtActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* BODY */}
      {viewMode === 'CALLS' && !inStudents ? (
        loadingCalls && !callsRefreshing ? (
          loadingBlock('Loading recent calls...')
        ) : (
          <FlatList
            data={recentCalls}
            renderItem={renderRecentCall}
            keyExtractor={item => String(item.id)}
            contentContainerStyle={styles.listContent}
            refreshing={callsRefreshing}
            onRefresh={async () => {
              setCallsRefreshing(true);
              await fetchRecentCalls(1, true);
              setCallsRefreshing(false);
            }}
            onEndReached={() => {
              if (!loadingMoreCalls && hasMoreCalls) fetchRecentCalls(callsPage + 1);
            }}
            onEndReachedThreshold={0.4}
            ListEmptyComponent={emptyBlock('phone-slash', 'No recent calls found')}
            ListFooterComponent={
              loadingMoreCalls ? (
                <View style={{ padding: 16, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color="#F59E0B" />
                </View>
              ) : recentCalls.length > 0 && !hasMoreCalls ? (
                <Text style={styles.footerTxt}>All recent calls loaded</Text>
              ) : null
            }
          />
        )
      ) : inStudents ? (
        loading && !refreshing ? (
          loadingBlock('Loading students...')
        ) : studentError ? (
          errorBlock(studentError, () => loadStudents())
        ) : (
          <FlatList
            data={students}
            renderItem={renderStudent}
            keyExtractor={(item, i) => item.id?.toString() || String(i)}
            contentContainerStyle={styles.listContent}
            refreshing={refreshing}
            onRefresh={() => loadStudents({ refresh: true })}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={emptyBlock('user-graduate', 'No students found', search ? 'Try a different search' : undefined)}
            ListFooterComponent={
              students.length > 0 ? <Text style={styles.footerTxt}>All {students.length} students loaded</Text> : null
            }
          />
        )
      ) : batchLoading && !batchRefreshing ? (
        loadingBlock('Loading batches...')
      ) : batchError ? (
        errorBlock(batchError, () => loadBatches())
      ) : (
        <FlatList
          data={filteredBatches}
          renderItem={renderBatch}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={styles.listContent}
          refreshing={batchRefreshing}
          onRefresh={() => loadBatches(true)}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <TouchableOpacity style={styles.leadRow} onPress={openAllStudents} activeOpacity={0.6}>
              <View style={[styles.stripe, { backgroundColor: '#10B981' }]} />
              <View style={[styles.avatar, { backgroundColor: '#D1FAE5' }]}>
                <FontAwesome5 name="users" size={14} color="#065F46" />
              </View>
              <View style={styles.leadInfo}>
                <Text style={styles.leadName}>All Students</Text>
                <Text style={[styles.phoneRow, { marginTop: 0 }]}>{isAdmin ? 'Across all batches' : 'Across your assigned batches'}</Text>
              </View>
              <FontAwesome5 name="chevron-right" size={12} color="#94A3B8" />
            </TouchableOpacity>
          }
          ListEmptyComponent={emptyBlock('layer-group', 'No batches found', 'Batches assigned to you will appear here.')}
        />
      )}

      {/* STUDENT SHEET: history + feedback form */}
      <Modal
        visible={sheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (sheetMode === 'form') setSheetMode('history');
          else setSheetVisible(false);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalSheet}>
            {/* Header */}
            <View style={styles.modalHeader}>
              {sheetMode === 'form' && (
                <TouchableOpacity
                  onPress={() => setSheetMode('history')}
                  style={{ marginRight: 12 }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <FontAwesome5 name="chevron-left" size={14} color="#F59E0B" />
                </TouchableOpacity>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle} numberOfLines={1}>
                  {sheetMode === 'form' ? 'Add Feedback' : getStudentName(selectedStudent)}
                </Text>
                <Text style={styles.modalSub} numberOfLines={1}>
                  {sheetMode === 'form'
                    ? getStudentName(selectedStudent)
                    : [selectedStudent?.crm_student_id, selectedStudent?.mobile || selectedStudent?.phone]
                        .filter(Boolean)
                        .join('  •  ')}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSheetVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <FontAwesome5 name="times" size={16} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {sheetMode === 'history' ? (
              <>
                <Text style={styles.sectionLbl}>Feedback & calls ({feedbacks.length})</Text>
                {historyLoading ? (
                  <ActivityIndicator size="large" color="#F59E0B" style={{ marginVertical: 30 }} />
                ) : (
                  <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
                    {feedbacks.length > 0 ? (
                      feedbacks.map(renderFeedback)
                    ) : (
                      <View style={{ alignItems: 'center', paddingVertical: 30 }}>
                        <FontAwesome5 name="comment-slash" size={30} color="#CBD5E1" />
                        <Text style={styles.emptyTitle}>No feedback yet</Text>
                        <Text style={styles.emptySub}>Call the student or add the first note.</Text>
                      </View>
                    )}
                  </ScrollView>
                )}
                <View style={styles.sheetActions}>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#10B981' }]}
                    onPress={() => callStudent(selectedStudent)}
                  >
                    <FontAwesome5 name="phone-alt" size={13} color="#fff" />
                    <Text style={styles.actionTxt}>Call</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#D97706', flex: 1.4 }]}
                    onPress={() => openFeedbackForm()}
                  >
                    <FontAwesome5 name="plus" size={12} color="#fff" />
                    <Text style={styles.actionTxt}>Add Feedback</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Text style={styles.sectionLbl}>Outcome *</Text>
                <View style={styles.pillsWrap}>
                  {FEEDBACK_STATUSES.map(s => {
                    const active = status === s.value;
                    return (
                      <TouchableOpacity
                        key={s.value}
                        style={[styles.pill, active && styles.pillActive]}
                        onPress={() => setStatus(s.value)}
                      >
                        <Text style={[styles.pillTxt, active && styles.pillTxtActive]}>{s.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={styles.sectionLbl}>Notes</Text>
                <TextInput
                  style={styles.textArea}
                  placeholder="What was discussed?"
                  placeholderTextColor="#94A3B8"
                  value={feedbackText}
                  onChangeText={setFeedbackText}
                  multiline
                  textAlignVertical="top"
                />

                <Text style={styles.sectionLbl}>Next follow-up</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TouchableOpacity
                    style={[styles.controlBtn, followupDate && { backgroundColor: '#D97706' }]}
                    onPress={() => setShowDatePicker(true)}
                  >
                    <FontAwesome5 name="calendar-alt" size={11} color={followupDate ? '#fff' : '#64748B'} />
                    <Text style={[styles.controlTxt, followupDate && { color: '#fff' }]}>
                      {followupDate ? formatDate(toYMD(followupDate)) : 'Select date'}
                    </Text>
                  </TouchableOpacity>
                  {followupDate && (
                    <TouchableOpacity onPress={() => setFollowupDate(null)}>
                      <FontAwesome5 name="times-circle" size={15} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                </View>
                {showDatePicker && (
                  <DateTimePicker
                    value={followupDate || new Date()}
                    mode="date"
                    display="default"
                    minimumDate={new Date()}
                    onChange={(event: any, date?: Date) => {
                      setShowDatePicker(Platform.OS === 'ios');
                      if (event.type !== 'dismissed' && date) setFollowupDate(date);
                    }}
                  />
                )}

                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#D97706', marginTop: 18 }, saving && { opacity: 0.6 }]}
                  onPress={submitFeedback}
                  disabled={saving}
                >
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionTxt}>Save feedback</Text>}
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ── Styles (same palette as Sales; dark values from Sales' dark variants) ────
const makeStyles = (isDark: boolean) => {
  const T = isDark
    ? { bg: '#0F172A', card: '#1E293B', border: '#334155', rowBorder: '#334155', text: '#F1F5F9', input: '#0F172A', chip: '#334155', tabActive: '#F1F5F9', tabText: '#94A3B8', sub: '#64748B', call: '#422006', audioBg: '#422006', audioBorder: '#92400E', audioTxt: '#FCD34D', body: '#94A3B8' }
    : { bg: '#F8FAFC', card: '#FFFFFF', border: '#E2E8F0', rowBorder: '#F1F5F9', text: '#0F172A', input: '#F1F5F9', chip: '#F1F5F9', tabActive: '#FFFFFF', tabText: '#64748B', sub: '#94A3B8', call: '#FEF3C7', audioBg: '#FEF3C7', audioBorder: '#FDE68A', audioTxt: '#92400E', body: '#334155' };

  return StyleSheet.create({
    root: { flex: 1, backgroundColor: T.bg },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },

    // Header
    header: {
      backgroundColor: T.card, paddingHorizontal: 16, paddingBottom: 8,
      borderBottomWidth: 1, borderBottomColor: T.border,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
    },
    headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    headerTitle: { fontSize: 20, fontWeight: '900', color: T.text, letterSpacing: -0.3 },
    headerSub: { fontSize: 12, color: isDark ? '#64748B' : '#94A3B8', fontWeight: '600', marginTop: 1 },
    backBtn: {
      width: 32, height: 32, borderRadius: 10, backgroundColor: T.call,
      alignItems: 'center', justifyContent: 'center', marginRight: 10,
    },
    mapBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: '#F59E0B', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    },
    mapBtnTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },

    // Stats
    statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    statCard: {
      flex: 1, backgroundColor: T.bg, borderRadius: 10,
      paddingVertical: 8, paddingHorizontal: 8, borderLeftWidth: 3,
    },
    statVal: { fontSize: 15, fontWeight: '900', color: isDark ? '#F1F5F9' : '#1E293B' },
    statLbl: { fontSize: 9, fontWeight: '700', color: '#94A3B8', marginTop: 1, textTransform: 'uppercase' },

    // Search
    searchBar: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: T.input, borderRadius: 12,
      paddingHorizontal: 12, paddingVertical: 6, marginBottom: 6, borderWidth: 1, borderColor: T.border,
    },
    searchInput: { flex: 1, fontSize: 14, color: isDark ? '#F1F5F9' : '#1E293B', fontWeight: '500' },

    // Tabs
    tabContainer: { flexDirection: 'row', backgroundColor: T.chip, borderRadius: 8, padding: 4, marginBottom: 8 },
    tabBtn: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6 },
    tabBtnActive: {
      backgroundColor: T.tabActive, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05, shadowRadius: 2, elevation: 2,
    },
    tabTxt: { fontSize: 13, fontWeight: '600', color: T.tabText },
    tabTxtActive: { color: '#0F172A', fontWeight: '700' },

    // Lists
    listContent: { paddingVertical: 4 },
    footerTxt: { textAlign: 'center', color: '#CBD5E1', fontSize: 12, padding: 16 },
    emptyTitle: { color: '#94A3B8', marginTop: 10, fontSize: 14, fontWeight: '600' },
    emptySub: { color: '#CBD5E1', fontSize: 12, marginTop: 4, textAlign: 'center' },
    retryBtn: { backgroundColor: '#D97706', paddingHorizontal: 20, paddingVertical: 9, borderRadius: 20, marginTop: 14 },
    retryTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },

    // Row (batch / student)
    leadRow: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: T.card,
      paddingVertical: 6, paddingRight: 10, borderBottomWidth: 1, borderBottomColor: T.rowBorder, minHeight: 55,
    },
    stripe: { width: 4, alignSelf: 'stretch' },
    avatar: {
      width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
      marginHorizontal: 10, flexShrink: 0,
    },
    avatarTxt: { fontSize: 13, fontWeight: '900' },
    leadInfo: { flex: 1, marginRight: 8 },
    leadName: { fontSize: 14, fontWeight: '800', color: T.text, marginBottom: 3 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
    stagePill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
    stageTxt: { fontSize: 10, fontWeight: '800', letterSpacing: 0.2 },
    program: { fontSize: 10, color: '#F59E0B', fontWeight: '700', flexShrink: 1 },
    phoneRow: { fontSize: 11, color: T.sub, marginTop: 3, fontWeight: '500' },
    followupTxt: { fontSize: 11, color: '#10B981', fontWeight: '700', marginTop: 3 },
    lastFollowTxt: { fontSize: 11, fontWeight: '700', marginTop: 3 },
    callBtn: {
      width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, backgroundColor: T.call,
    },

    // Recent calls
    historyCard: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: T.rowBorder,
      backgroundColor: T.card,
    },
    historyLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 },
    historyIcon: {
      width: 36, height: 36, borderRadius: 18, backgroundColor: isDark ? '#064E3B' : '#EBF8FF',
      justifyContent: 'center', alignItems: 'center',
    },
    historyName: { fontSize: 15, fontWeight: '700', color: isDark ? '#F1F5F9' : '#1F2937' },
    historyPhone: { fontSize: 13, color: '#6B7280', marginTop: 2 },
    historyNotes: { fontSize: 12, color: T.body, marginTop: 4 },
    historyTime: { fontSize: 11, color: '#9CA3AF' },
    durationBadge: { backgroundColor: isDark ? '#334155' : '#F3F4F6', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
    durationText: { fontSize: 10, fontWeight: '600', color: isDark ? '#CBD5E1' : '#4B5563' },
    audioPlayerMini: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: T.audioBg,
      paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, marginTop: 8,
      borderWidth: 1, borderColor: T.audioBorder, alignSelf: 'flex-start',
    },
    audioTextMini: { marginLeft: 6, fontSize: 11, fontWeight: '700', color: T.audioTxt },

    // Sheet
    modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.5)', justifyContent: 'flex-end' },
    modalSheet: {
      backgroundColor: T.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
      padding: 18, paddingBottom: 28, maxHeight: '90%',
    },
    modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
    modalTitle: { fontSize: 16, fontWeight: '800', color: T.text },
    modalSub: { fontSize: 12, color: '#94A3B8', fontWeight: '600', marginTop: 2 },
    sectionLbl: { fontSize: 12, fontWeight: '800', color: '#64748B', marginTop: 10, marginBottom: 8 },
    sheetActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
    actionBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      paddingVertical: 12, borderRadius: 12, minHeight: 46,
    },
    actionTxt: { color: '#fff', fontSize: 14, fontWeight: '800' },

    feedbackCard: { backgroundColor: T.bg, borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: T.border },
    feedbackHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    feedbackText: { color: T.text, fontSize: 13, lineHeight: 19, marginTop: 8 },
    feedbackMeta: { color: '#94A3B8', fontSize: 11, marginTop: 6, fontWeight: '600' },
    callDetails: { marginTop: 10, padding: 10, backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border },
    callInfo: { color: '#64748B', fontSize: 11, fontWeight: '600', marginTop: 2 },

    // Form
    pillsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingBottom: 4 },
    pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: T.chip, borderWidth: 1, borderColor: T.border },
    pillActive: { backgroundColor: '#D97706', borderColor: '#D97706' },
    pillTxt: { fontSize: 12, fontWeight: '700', color: isDark ? '#94A3B8' : '#64748B' },
    pillTxtActive: { color: '#FFFFFF' },
    textArea: {
      minHeight: 100, borderWidth: 1, borderColor: T.border, backgroundColor: T.input,
      borderRadius: 12, padding: 12, color: isDark ? '#F1F5F9' : '#1E293B', fontSize: 14,
    },
    controlBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: T.chip,
      paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    },
    controlTxt: { fontSize: 12, fontWeight: '700', color: isDark ? '#94A3B8' : '#64748B' },
  });
};