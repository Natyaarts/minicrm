import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  useColorScheme,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import client from '../src/api/client';

interface InteractionItem {
  id: number;
  interaction_type: string;
  notes: string;
  date: string;
  author_name?: string;
  audio_recording?: string;
}

export default function LeadDetailsScreen() {
  const { leadId } = useLocalSearchParams();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<any>(null);
  const [interactions, setInteractions] = useState<InteractionItem[]>([]);
  const [loadingInteractions, setLoadingInteractions] = useState(true);

  // New interaction form state
  const [noteType, setNoteType] = useState('NOTE');
  const [noteText, setNoteText] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [followUpDate, setFollowUpDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    if (leadId) {
      fetchLeadDetails();
      fetchInteractions();
    }
  }, [leadId]);

  const fetchLeadDetails = async () => {
    try {
      const res = await client.get(`/students/${leadId}/`);
      setStudent(res.data);
    } catch (err) {
      console.log('Failed to fetch student details:', err);
      // Fallback dummy for design testing
      setStudent({
        id: leadId,
        first_name: 'Lead',
        last_name: 'Details',
        crm_student_id: 'NAT-2026-003',
        phone: '+91 98765 43212',
        mobile: '+91 98765 43212',
        email: 'lead@example.com',
        program_name: 'Natya Career Academy',
        course_name: 'Bharathanatyam Advanced',
        status: 'NEW',
        dynamic_values_list: [
          { field_label: 'Date of Birth', value: '1998-05-15', field_group: 'INITIAL' },
          { field_label: 'Previous Experience', value: '3 years in classical dance', field_group: 'INITIAL' },
        ]
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchInteractions = async () => {
    setLoadingInteractions(true);
    try {
      const res = await client.get('/crm/interactions/', {
        params: { student_id: leadId }
      });
      const data = res.data?.results || res.data || [];
      setInteractions(data);
    } catch (err) {
      console.log('Failed to fetch interactions:', err);
      setInteractions([
        {
          id: 1,
          interaction_type: 'CALL',
          notes: 'Outbound call lasting 02:15 (Call logged successfully via Dialpad)',
          date: new Date(Date.now() - 3600000).toISOString(),
          author_name: 'Super Admin'
        },
        {
          id: 2,
          interaction_type: 'NOTE',
          notes: 'Interested in advanced classes. Needs weekend batch info.',
          date: new Date(Date.now() - 86400000).toISOString(),
          author_name: 'Super Admin'
        }
      ]);
    } finally {
      setLoadingInteractions(false);
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) {
      Alert.alert('Required', 'Please enter some details for this activity.');
      return;
    }

    setSubmittingNote(true);
    try {
      const payload: any = {
        student: parseInt(leadId as string),
        interaction_type: noteType,
        notes: noteText
      };
      
      if (followUpDate) {
        payload.next_followup_date = followUpDate.toISOString();
      }

      await client.post('/crm/interactions/', payload);
      Alert.alert('Success', 'Activity logged successfully!');
      setNoteText('');
      setFollowUpDate(null);
      setShowAddForm(false);
      fetchInteractions();
    } catch (err) {
      console.log('Failed to log interaction:', err);
      Alert.alert('Log Activity', 'Mock activity logged locally.');
      // Local addition for simulation
      const newAct: InteractionItem = {
        id: Date.now(),
        interaction_type: noteType,
        notes: noteText,
        date: new Date().toISOString(),
        author_name: 'Super Admin'
      };
      setInteractions(prev => [newAct, ...prev]);
      setNoteText('');
      setFollowUpDate(null);
      setShowAddForm(false);
    } finally {
      setSubmittingNote(false);
    }
  };

  const getInteractionIcon = (type: string) => {
    switch (type) {
      case 'CALL':
        return { name: 'phone-alt', color: '#3B82F6', bg: isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF' };
      case 'EMAIL':
        return { name: 'envelope', color: '#10B981', bg: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5' };
      case 'MEETING':
        return { name: 'users', color: '#8B5CF6', bg: isDark ? 'rgba(139, 92, 246, 0.15)' : '#F5F3FF' };
      case 'WHATSAPP':
        return { name: 'whatsapp', color: '#059669', bg: isDark ? 'rgba(5, 150, 105, 0.15)' : '#ECFDF5' };
      default:
        return { name: 'file-alt', color: '#6B7280', bg: isDark ? 'rgba(107, 114, 128, 0.15)' : '#F9FAFB' };
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <View style={[styles.center, isDark && styles.darkBg]}>
        <ActivityIndicator size="large" color="#FBBF24" />
      </View>
    );
  }

  const phoneNum = student?.phone || student?.mobile || '';

  return (
    <SafeAreaView style={[styles.container, isDark && styles.darkBg]}>
      <StatusBar barStyle="light-content" />
      
      {/* Header */}
      <View style={[styles.header, isDark && styles.darkHeader]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <FontAwesome5 name="arrow-left" size={18} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>LEAD DETAILS</Text>
        <TouchableOpacity 
          onPress={() => phoneNum && router.push({ pathname: '/dialpad', params: { leadId: student.id, phone: phoneNum } } as any)}
          style={[styles.callButtonHeader, { opacity: phoneNum ? 1 : 0.5 }]}
          disabled={!phoneNum}
        >
          <FontAwesome5 name="phone-alt" size={14} color="#0F172A" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <View style={[styles.profileCard, isDark && styles.darkCard]}>
          <View style={styles.profileHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{student?.first_name?.[0] || '?'}</Text>
            </View>
            <View style={styles.profileMeta}>
              <Text style={[styles.profileName, isDark && styles.darkText]}>
                {student?.first_name} {student?.last_name}
              </Text>
              <Text style={styles.profileCrmId}>{student?.crm_student_id || 'TEMP LEAD'}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: student?.status === 'ACTIVE' ? '#D1FAE5' : student?.status === 'NEW' ? '#DBEAFE' : '#FEF3C7' }]}>
              <Text style={[styles.statusText, { color: student?.status === 'ACTIVE' ? '#065F46' : student?.status === 'NEW' ? '#1E40AF' : '#92400E' }]}>
                {student?.status || 'NEW'}
              </Text>
            </View>
          </View>

          <View style={[styles.divider, isDark && styles.darkDivider]} />

          {/* Academic Info */}
          <View style={styles.infoRow}>
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>PROGRAM</Text>
              <Text style={[styles.infoValue, isDark && styles.darkText]}>{student?.program_name || 'Not Specified'}</Text>
            </View>
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>COURSE</Text>
              <Text style={[styles.infoValue, isDark && styles.darkText]}>{student?.course_name || 'Not Specified'}</Text>
            </View>
          </View>

          {/* Contact Details */}
          <View style={[styles.contactBox, isDark && styles.darkContactBox]}>
            <TouchableOpacity 
              style={styles.contactItem}
              onPress={() => phoneNum && Linking.openURL(`tel:${phoneNum}`)}
            >
              <FontAwesome5 name="phone" size={12} color="#FBBF24" style={styles.contactIcon} />
              <Text style={[styles.contactText, isDark && styles.darkText]} numberOfLines={1}>{phoneNum || 'No Phone'}</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.contactItem}
              onPress={() => student?.email && Linking.openURL(`mailto:${student.email}`)}
            >
              <FontAwesome5 name="envelope" size={12} color="#FBBF24" style={styles.contactIcon} />
              <Text style={[styles.contactText, isDark && styles.darkText]} numberOfLines={1}>{student?.email || 'No Email'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Dynamic Fields */}
        {student?.dynamic_values_list && student.dynamic_values_list.length > 0 && (
          <View style={[styles.sectionCard, isDark && styles.darkCard]}>
            <Text style={styles.sectionTitle}>DYNAMIC FIELDS (FORM DATA)</Text>
            <View style={styles.grid}>
              {student.dynamic_values_list.map((field: any, idx: number) => (
                <View key={idx} style={styles.gridCol}>
                  <Text style={styles.fieldLabel}>{field.field_label.toUpperCase()}</Text>
                  <Text style={[styles.fieldValue, isDark && styles.darkText]}>{field.value || '-'}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Action Panel */}
        <View style={styles.actionPanel}>
          <TouchableOpacity 
            style={[styles.actionBtn, { backgroundColor: '#10B981' }]}
            onPress={() => phoneNum && Linking.openURL(`https://wa.me/${phoneNum.replace(/\D/g, '')}`)}
          >
            <FontAwesome5 name="whatsapp" size={14} color="#FFF" />
            <Text style={styles.actionBtnText}>WhatsApp</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.actionBtn, { backgroundColor: '#3B82F6' }]}
            onPress={() => phoneNum && router.push({ pathname: '/dialpad', params: { leadId: student.id, phone: phoneNum } } as any)}
          >
            <FontAwesome5 name="phone-alt" size={14} color="#FFF" />
            <Text style={styles.actionBtnText}>Dialpad</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.actionBtn, { backgroundColor: '#6B7280' }]}
            onPress={() => setShowAddForm(!showAddForm)}
          >
            <FontAwesome5 name="pen" size={14} color="#FFF" />
            <Text style={styles.actionBtnText}>{showAddForm ? 'Close' : 'Add Note'}</Text>
          </TouchableOpacity>
        </View>

        {/* Inline Add Note Form */}
        {showAddForm && (
          <View style={[styles.noteFormCard, isDark && styles.darkCard]}>
            <Text style={styles.formTitle}>LOG NEW INTERACTION</Text>
            
            <View style={styles.typeSelector}>
              {['NOTE', 'CALL', 'MEETING', 'EMAIL'].map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[styles.typeBtn, noteType === type && styles.typeBtnActive]}
                  onPress={() => setNoteType(type)}
                >
                  <Text style={[styles.typeBtnText, noteType === type && styles.typeBtnTextActive]}>{type}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={[styles.formInput, isDark && styles.darkInput]}
              placeholder="What happened during this interaction?"
              placeholderTextColor="#64748B"
              multiline
              numberOfLines={4}
              value={noteText}
              onChangeText={setNoteText}
            />

            <View style={styles.followUpContainer}>
              <Text style={styles.followUpLabel}>Schedule Next Follow-up?</Text>
              <View style={styles.followUpRow}>
                <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowDatePicker(true)}>
                  <FontAwesome5 name="calendar-alt" size={14} color="#64748B" />
                  <Text style={styles.datePickerText}>
                    {followUpDate ? followUpDate.toLocaleString([], {dateStyle: 'medium', timeStyle: 'short'}) : 'No Follow-up Scheduled'}
                  </Text>
                </TouchableOpacity>
                {followUpDate && (
                  <TouchableOpacity onPress={() => setFollowUpDate(null)} style={{marginLeft: 10}}>
                    <FontAwesome5 name="times-circle" size={20} color="#EF4444" />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {showDatePicker && (
              <DateTimePicker
                value={followUpDate || new Date()}
                mode="datetime"
                display="default"
                onChange={(event, selectedDate) => {
                  setShowDatePicker(Platform.OS === 'ios');
                  if (selectedDate) setFollowUpDate(selectedDate);
                }}
              />
            )}

            <TouchableOpacity 
              style={styles.submitBtn} 
              onPress={handleAddNote}
              disabled={submittingNote}
            >
              {submittingNote ? (
                <ActivityIndicator color="#0F172A" />
              ) : (
                <>
                  <Text style={styles.submitBtnText}>Save Interaction Log</Text>
                  <FontAwesome5 name="check" size={12} color="#0F172A" style={{ marginLeft: 6 }} />
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Timeline / Call & Note History */}
        <View style={[styles.timelineSection, { backgroundColor: 'transparent' }]}>
          <Text style={styles.sectionTitle}>ACTIVITY TIMELINE & CALL HISTORY</Text>

          {loadingInteractions ? (
            <ActivityIndicator size="small" color="#FBBF24" style={{ marginTop: 20 }} />
          ) : interactions.length > 0 ? (
            interactions.map((item, idx) => {
              const iconConfig = getInteractionIcon(item.interaction_type);
              return (
                <View key={item.id || idx} style={styles.timelineItem}>
                  <View style={styles.timelineLeft}>
                    <View style={[styles.timelineIconContainer, { backgroundColor: iconConfig.bg }]}>
                      <FontAwesome5 name={iconConfig.name} size={14} color={iconConfig.color} />
                    </View>
                    {idx < interactions.length - 1 && (
                      <View style={[styles.timelineLine, isDark && styles.darkTimelineLine]} />
                    )}
                  </View>
                  <View style={[styles.timelineCard, isDark && styles.darkCard]}>
                    <View style={styles.timelineHeader}>
                      <Text style={[styles.timelineType, isDark && styles.darkText]}>{item.interaction_type}</Text>
                      <Text style={styles.timelineDate}>{formatTime(item.date)}</Text>
                    </View>
                    <Text style={styles.timelineNotes}>{item.notes}</Text>
                    {item.audio_recording && (
                      <View style={styles.audioIndicator}>
                        <FontAwesome5 name="volume-up" size={12} color="#10B981" />
                        <Text style={styles.audioIndicatorText}>Audio recording saved on server</Text>
                      </View>
                    )}
                    {item.author_name && (
                      <Text style={styles.timelineAuthor}>Logged by: {item.author_name}</Text>
                    )}
                  </View>
                </View>
              );
            })
          ) : (
            <View style={[styles.emptyBox, isDark && styles.darkCard]}>
              <FontAwesome5 name="bell-slash" size={24} color="#64748B" style={{ marginBottom: 8 }} />
              <Text style={styles.emptyText}>No call history or notes logged yet.</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A', // Slate 900
  },
  darkBg: {
    backgroundColor: '#0F172A',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F172A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#1E293B', // Slate 800
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  darkHeader: {
    backgroundColor: '#1E293B',
    borderBottomColor: '#334155',
  },
  backButton: {
    padding: 8,
    borderRadius: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  callButtonHeader: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#FBBF24',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  profileCard: {
    backgroundColor: '#1E293B',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 20,
  },
  darkCard: {
    backgroundColor: '#1E293B',
    borderColor: '#334155',
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.3)',
  },
  avatarText: {
    color: '#FBBF24',
    fontSize: 22,
    fontWeight: '900',
  },
  profileMeta: {
    flex: 1,
    marginLeft: 15,
    backgroundColor: 'transparent',
  },
  profileName: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  profileCrmId: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    alignSelf: 'center',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '900',
  },
  divider: {
    height: 1,
    backgroundColor: '#334155',
    marginVertical: 16,
  },
  darkDivider: {
    backgroundColor: '#334155',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
  },
  infoCol: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  infoLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: '#94A3B8',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  darkText: {
    color: '#FFFFFF',
  },
  contactBox: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: 'transparent',
  },
  darkContactBox: {
    backgroundColor: 'transparent',
  },
  contactItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  contactIcon: {
    marginRight: 8,
  },
  contactText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#E2E8F0',
  },
  sectionCard: {
    backgroundColor: '#1E293B',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
    letterSpacing: 2,
    marginBottom: 16,
    marginLeft: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: 'transparent',
    gap: 16,
  },
  gridCol: {
    width: '45%',
    backgroundColor: 'transparent',
  },
  fieldLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: '#94A3B8',
    letterSpacing: 1,
    marginBottom: 4,
  },
  fieldValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  actionPanel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 20,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 16,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  actionBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
  },
  noteFormCard: {
    backgroundColor: '#1E293B',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 20,
  },
  formTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FBBF24',
    letterSpacing: 1.5,
    marginBottom: 16,
  },
  typeSelector: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  typeBtnActive: {
    backgroundColor: '#FBBF24',
  },
  typeBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
  },
  typeBtnTextActive: {
    color: '#0F172A',
    fontWeight: '900',
  },
  formInput: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 14,
    color: '#FFFFFF',
    fontSize: 14,
    height: 100,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  darkInput: {
    backgroundColor: '#0F172A',
    borderColor: '#334155',
  },
  submitBtn: {
    flexDirection: 'row',
    backgroundColor: '#FBBF24',
    borderRadius: 16,
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FBBF24',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  submitBtnText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '900',
  },
  timelineSection: {
    marginBottom: 20,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 16,
    backgroundColor: 'transparent',
  },
  timelineLeft: {
    alignItems: 'center',
    width: 40,
    backgroundColor: 'transparent',
  },
  timelineIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: '#334155',
    marginTop: 4,
    zIndex: 1,
  },
  darkTimelineLine: {
    backgroundColor: '#334155',
  },
  timelineCard: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'transparent',
    marginBottom: 8,
  },
  timelineType: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
  },
  followUpContainer: {
    marginTop: 16,
    marginBottom: 8,
  },
  followUpRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  followUpLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flex: 1,
  },
  datePickerText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#334155',
    fontWeight: '500',
  },
  timelineDate: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '600',
  },
  timelineNotes: {
    fontSize: 13,
    color: '#CBD5E0',
    lineHeight: 18,
    fontWeight: '500',
  },
  audioIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
    backgroundColor: 'transparent',
  },
  audioIndicatorText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '700',
  },
  timelineAuthor: {
    fontSize: 9,
    color: '#94A3B8',
    marginTop: 8,
    fontStyle: 'italic',
  },
  emptyBox: {
    backgroundColor: '#1E293B',
    borderRadius: 24,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});
