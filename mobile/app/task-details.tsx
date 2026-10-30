import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  useColorScheme,
  StatusBar,
  TextInput,
  Modal,
  RefreshControl,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import client from '../src/api/client';

interface LeadTaskItem {
  id: number;
  task: number;
  lead: number;
  lead_name: string;
  crm_student_id: string;
  mobile: string;
  email: string;
  lead_status: string;
  program_name: string | null;
  course_name: string | null;
  owner_name: string;
  is_completed: boolean;
  completed_at: string | null;
  completed_by_name: string | null;
  notes: string;
  last_interaction: {
    interaction_type: string;
    date: string;
    notes: string;
    call_status: string | null;
    call_duration: number;
  } | null;
}

interface TaskData {
  id: number;
  title: string;
  assigned_to: number;
  assigned_to_name: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  total_leads: number;
  completed_leads: number;
  progress_percent: number;
  created_at: string;
  items: LeadTaskItem[];
}

export default function TaskDetailsScreen() {
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [task, setTask] = useState<TaskData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingLeadId, setUpdatingLeadId] = useState<number | null>(null);

  // Quick note modal
  const [noteModalItem, setNoteModalItem] = useState<LeadTaskItem | null>(null);
  const [leadNoteText, setLeadNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const fetchTaskDetails = useCallback(async () => {
    if (!taskId) return;
    try {
      const res = await client.get(`/crm/lead-tasks/${taskId}/`);
      setTask(res.data);
    } catch (err: any) {
      console.error('Failed to load task details:', err);
      Alert.alert('Error', err.response?.data?.error || 'Failed to load task details.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [taskId]);

  useEffect(() => {
    fetchTaskDetails();
  }, [fetchTaskDetails]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchTaskDetails();
  };

  const handleToggleCompletion = async (item: LeadTaskItem) => {
    if (!task) return;
    setUpdatingLeadId(item.lead);
    const newStatus = !item.is_completed;
    try {
      const res = await client.post(`/crm/lead-tasks/${task.id}/update-lead/`, {
        lead_id: item.lead,
        is_completed: newStatus,
      });
      setTask(res.data);
    } catch (err: any) {
      console.error('Failed to toggle completion:', err);
      Alert.alert('Error', err.response?.data?.error || 'Failed to update lead completion.');
    } finally {
      setUpdatingLeadId(null);
    }
  };

  const handleSaveNote = async () => {
    if (!task || !noteModalItem) return;
    setSavingNote(true);
    try {
      const res = await client.post(`/crm/lead-tasks/${task.id}/update-lead/`, {
        lead_id: noteModalItem.lead,
        notes: leadNoteText,
      });
      setTask(res.data);
      setNoteModalItem(null);
      setLeadNoteText('');
    } catch (err: any) {
      console.error('Failed to save note:', err);
      Alert.alert('Error', err.response?.data?.error || 'Failed to save note.');
    } finally {
      setSavingNote(false);
    }
  };

  const handleCallLead = (mobile: string, leadId: number) => {
    if (!mobile) {
      Alert.alert('No Phone', 'This lead does not have a valid mobile number.');
      return;
    }
    router.push({
      pathname: '/dialpad',
      params: { leadId: String(leadId), phone: mobile },
    } as any);
  };

  const handleOpenLeadDetails = (leadId: number) => {
    router.push({
      pathname: '/lead-details',
      params: { leadId: String(leadId) },
    } as any);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return { bg: '#D1FAE5', text: '#065F46', label: 'Completed' };
      case 'IN_PROGRESS':
        return { bg: '#DBEAFE', text: '#1E40AF', label: 'In Progress' };
      default:
        return { bg: '#FEF3C7', text: '#92400E', label: 'Pending' };
    }
  };

  const renderLeadCard = ({ item }: { item: LeadTaskItem }) => {
    const isBusy = updatingLeadId === item.lead;
    return (
      <View style={[styles.card, isDark && styles.darkCard, item.is_completed && styles.completedCard]}>
        {/* Top Row: Checkbox + Lead Name + Lead Status */}
        <View style={styles.cardHeader}>
          <TouchableOpacity
            style={styles.checkTouch}
            onPress={() => handleToggleCompletion(item)}
            disabled={isBusy}
          >
            {isBusy ? (
              <ActivityIndicator size="small" color="#3B82F6" />
            ) : (
              <FontAwesome5
                name={item.is_completed ? 'check-square' : 'square'}
                size={22}
                color={item.is_completed ? '#10B981' : '#94A3B8'}
                solid={item.is_completed}
              />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerInfo}
            onPress={() => handleOpenLeadDetails(item.lead)}
          >
            <View style={styles.nameRow}>
              <Text style={[styles.leadName, isDark && styles.darkText]} numberOfLines={1}>
                {item.lead_name}
              </Text>
              <Text style={styles.crmId}>
                {item.crm_student_id || `#${item.lead}`}
              </Text>
            </View>
            <View style={styles.statusRow}>
              <View style={styles.statusPill}>
                <Text style={styles.statusPillText}>{item.lead_status || 'NEW'}</Text>
              </View>
              {item.program_name ? (
                <Text style={styles.programText} numberOfLines={1}>
                  {item.program_name}
                </Text>
              ) : null}
            </View>
          </TouchableOpacity>
        </View>

        {/* Contact info row */}
        <View style={styles.infoRow}>
          {item.mobile ? (
            <View style={styles.contactItem}>
              <FontAwesome5 name="phone" size={11} color="#64748B" />
              <Text style={styles.contactText}>{item.mobile}</Text>
            </View>
          ) : null}
          {item.owner_name ? (
            <View style={styles.contactItem}>
              <FontAwesome5 name="user-tie" size={11} color="#64748B" />
              <Text style={styles.contactText} numberOfLines={1}>
                Owner: {item.owner_name}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Previous Interaction / Call Note */}
        {item.last_interaction ? (
          <View style={[styles.interactionBox, isDark && styles.darkSubBox]}>
            <View style={styles.interactionHeader}>
              <FontAwesome5 name="history" size={10} color="#3B82F6" />
              <Text style={styles.interactionType}>
                Last Contact ({item.last_interaction.interaction_type})
              </Text>
              <Text style={styles.interactionDate}>
                {new Date(item.last_interaction.date).toLocaleDateString()}
              </Text>
            </View>
            {item.last_interaction.notes ? (
              <Text style={styles.interactionNotes} numberOfLines={2}>
                "{item.last_interaction.notes}"
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Task Specific Note if exists */}
        {item.notes ? (
          <View style={styles.taskNoteBox}>
            <Text style={styles.taskNoteText}>
              <Text style={{ fontWeight: '700' }}>Task Note: </Text>
              {item.notes}
            </Text>
          </View>
        ) : null}

        {/* Completion timestamp */}
        {item.is_completed && item.completed_at ? (
          <View style={styles.completedBadge}>
            <FontAwesome5 name="check-circle" size={12} color="#059669" />
            <Text style={styles.completedText}>
              Completed on {new Date(item.completed_at).toLocaleDateString()}
            </Text>
          </View>
        ) : null}

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.callButton}
            onPress={() => handleCallLead(item.mobile, item.lead)}
          >
            <FontAwesome5 name="phone-alt" size={13} color="#FFFFFF" />
            <Text style={styles.callButtonText}>Call</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.noteButton}
            onPress={() => {
              setNoteModalItem(item);
              setLeadNoteText(item.notes || '');
            }}
          >
            <FontAwesome5 name="sticky-note" size={13} color="#475569" />
            <Text style={styles.noteButtonText}>Task Note</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.detailsButton}
            onPress={() => handleOpenLeadDetails(item.lead)}
          >
            <FontAwesome5 name="user-edit" size={13} color="#3B82F6" />
            <Text style={styles.detailsButtonText}>CRM Details</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }, isDark && styles.darkBg]}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={[styles.loadingText, isDark && styles.darkSubtext]}>Loading task...</Text>
      </View>
    );
  }

  if (!task) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }, isDark && styles.darkBg]}>
        <FontAwesome5 name="clipboard-list" size={40} color="#CBD5E1" />
        <Text style={{ color: '#94A3B8', marginTop: 12, fontSize: 16, fontWeight: '600' }}>
          Task not found
        </Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const badge = getStatusBadge(task.status);

  return (
    <View style={[styles.container, { paddingTop: insets.top }, isDark && styles.darkBg]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, isDark && styles.darkHeader]}>
        <TouchableOpacity style={styles.headerBackBtn} onPress={() => router.back()}>
          <FontAwesome5 name="arrow-left" size={16} color={isDark ? '#F1F5F9' : '#1E293B'} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={[styles.headerTitle, isDark && styles.darkText]} numberOfLines={1}>
            {task.title}
          </Text>
          <Text style={styles.headerSubtitle}>
            Assigned to {task.assigned_to_name}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.statusBadgeText, { color: badge.text }]}>{badge.label}</Text>
        </View>
      </View>

      {/* Progress Summary Card */}
      <View style={[styles.summaryCard, isDark && styles.darkCard]}>
        <View style={styles.summaryTopRow}>
          <Text style={[styles.summaryTitle, isDark && styles.darkText]}>Task Progress</Text>
          <Text style={styles.summaryCount}>
            <Text style={{ fontWeight: '800', color: '#1E293B' }}>{task.completed_leads}</Text> / {task.total_leads} Leads ({task.progress_percent}%)
          </Text>
        </View>
        <View style={styles.progressBarTrack}>
          <View
            style={[
              styles.progressBarFill,
              { width: `${task.progress_percent}%` },
              task.progress_percent === 100 && { backgroundColor: '#10B981' },
            ]}
          />
        </View>
      </View>

      {/* Associated Leads List */}
      <FlatList
        data={task.items || []}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderLeadCard}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={{ color: '#94A3B8', fontSize: 14 }}>No leads associated with this task.</Text>
          </View>
        }
      />

      {/* Quick Note Modal */}
      <Modal visible={!!noteModalItem} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, isDark && styles.darkCard]}>
            <Text style={[styles.modalTitle, isDark && styles.darkText]}>
              Task Note for {noteModalItem?.lead_name}
            </Text>
            <TextInput
              style={[styles.noteInput, isDark && styles.darkInput]}
              multiline
              numberOfLines={4}
              placeholder="e.g. Lead agreed to callback at 4 PM..."
              placeholderTextColor="#94A3B8"
              value={leadNoteText}
              onChangeText={setLeadNoteText}
            />
            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setNoteModalItem(null)}
                disabled={savingNote}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleSaveNote}
                disabled={savingNote}
              >
                {savingNote ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSaveText}>Save Note</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  darkBg: {
    backgroundColor: '#0F172A',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
  },
  darkText: {
    color: '#F8FAFC',
  },
  darkSubtext: {
    color: '#94A3B8',
  },
  backBtn: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#3B82F6',
    borderRadius: 8,
  },
  backBtnText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 13,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  darkHeader: {
    backgroundColor: '#1E293B',
    borderBottomColor: '#334155',
  },
  headerBackBtn: {
    padding: 8,
    marginRight: 6,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  summaryCard: {
    margin: 16,
    marginBottom: 8,
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  summaryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  summaryCount: {
    fontSize: 12,
    color: '#64748B',
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#3B82F6',
    borderRadius: 4,
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  darkCard: {
    backgroundColor: '#1E293B',
    borderColor: '#334155',
  },
  completedCard: {
    borderColor: '#A7F3D0',
    backgroundColor: '#F0FDF4',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkTouch: {
    paddingRight: 10,
    paddingTop: 2,
  },
  headerInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leadName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
    flex: 1,
  },
  crmId: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: '#64748B',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  statusPill: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2563EB',
  },
  programText: {
    fontSize: 11,
    color: '#94A3B8',
    flex: 1,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 14,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  contactText: {
    fontSize: 11,
    color: '#64748B',
  },
  interactionBox: {
    marginTop: 8,
    padding: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  darkSubBox: {
    backgroundColor: '#0F172A',
    borderColor: '#334155',
  },
  interactionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  interactionType: {
    fontSize: 10,
    fontWeight: '700',
    color: '#3B82F6',
  },
  interactionDate: {
    fontSize: 10,
    color: '#94A3B8',
    marginLeft: 'auto',
  },
  interactionNotes: {
    fontSize: 11,
    color: '#475569',
    fontStyle: 'italic',
  },
  taskNoteBox: {
    marginTop: 8,
    padding: 8,
    backgroundColor: '#FEF9C3',
    borderRadius: 8,
  },
  taskNoteText: {
    fontSize: 11,
    color: '#854D0E',
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  completedText: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  callButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  callButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  noteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  noteButtonText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
  },
  detailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    marginLeft: 'auto',
  },
  detailsButtonText: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 12,
  },
  noteInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    color: '#1E293B',
    textAlignVertical: 'top',
    height: 100,
  },
  darkInput: {
    borderColor: '#334155',
    color: '#F8FAFC',
    backgroundColor: '#0F172A',
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
  },
  modalCancelText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  modalSaveBtn: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
  },
  modalSaveText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
