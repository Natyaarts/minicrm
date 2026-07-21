import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, ActivityIndicator, SafeAreaView, useColorScheme } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import DateTimePicker from '@react-native-community/datetimepicker';
import client from '../src/api/client';

export default function BDEReportScreen() {
  const { bdeId } = useLocalSearchParams();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<any>(null);
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (bdeId) {
      setPage(1); // Reset page on filter change
      fetchReport(1);
    }
  }, [bdeId, startDate, endDate]);

  useEffect(() => {
    return sound
      ? () => {
          sound.unloadAsync();
        }
      : undefined;
  }, [sound]);

  const formatDateLocal = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const fetchReport = async (pageNumber = 1) => {
    try {
      if (pageNumber === 1) setLoading(true);
      else setLoadingMore(true);

      let url = `/crm/bde-report/${bdeId}/`;
      
      const queryParams = [];
      if (startDate) queryParams.push(`start_date=${formatDateLocal(startDate)}`);
      if (endDate) queryParams.push(`end_date=${formatDateLocal(endDate)}`);
      queryParams.push(`page=${pageNumber}`);
      
      if (queryParams.length > 0) {
          url += `?${queryParams.join('&')}`;
      }
      
      const res = await client.get(url);
      
      if (pageNumber === 1) {
        setReport(res.data);
      } else {
        setReport(prev => ({
          ...prev,
          timeline: [...prev.timeline, ...res.data.timeline]
        }));
      }
      
      setHasMore(res.data.has_more);
      setPage(pageNumber);

    } catch (err) {
      console.log('Failed to fetch BDE report:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const playAudio = async (url: string, id: string) => {
    if (playingAudio === id) {
       // Stop playing
       if (sound) {
         await sound.stopAsync();
         setPlayingAudio(null);
       }
       return;
    }
    
    try {
      if (sound) {
         await sound.unloadAsync();
      }
      const { sound: newSound } = await Audio.Sound.createAsync({ uri: url });
      setSound(newSound);
      setPlayingAudio(id);
      
      newSound.setOnPlaybackStatusUpdate((status) => {
         if (status.isLoaded && status.didJustFinish) {
            setPlayingAudio(null);
         }
      });
      
      await newSound.playAsync();
    } catch (e) {
      console.log('Audio playback error', e);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, isDark && styles.darkBg]}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  if (!report) {
    return (
      <View style={[styles.center, isDark && styles.darkBg]}>
        <Text style={{color: '#EF4444'}}>Failed to load BDE Report</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, isDark && styles.darkBg]}>
      {/* Header */}
      <View style={[styles.header, isDark && styles.darkHeader]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <FontAwesome5 name="arrow-left" size={18} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{report.bde.name.toUpperCase()} - REPORT</Text>
        <View style={{width: 32}} />
      </View>

      <View style={styles.dateFilterContainer}>
        <TouchableOpacity 
          style={[styles.dateButton, isDark && styles.darkCard]} 
          onPress={() => setShowStartPicker(true)}
        >
          <FontAwesome5 name="calendar-alt" size={14} color="#6B7280" />
          <Text style={[styles.dateButtonText, isDark && styles.darkText]}>
            {startDate ? startDate.toLocaleDateString() : 'Start Date'}
          </Text>
        </TouchableOpacity>
        <Text style={{color: '#9CA3AF'}}>-</Text>
        <TouchableOpacity 
          style={[styles.dateButton, isDark && styles.darkCard]} 
          onPress={() => setShowEndPicker(true)}
        >
          <FontAwesome5 name="calendar-alt" size={14} color="#6B7280" />
          <Text style={[styles.dateButtonText, isDark && styles.darkText]}>
            {endDate ? endDate.toLocaleDateString() : 'End Date'}
          </Text>
        </TouchableOpacity>
        
        {(startDate || endDate) && (
          <TouchableOpacity onPress={() => { setStartDate(null); setEndDate(null); }}>
             <Text style={{color: '#EF4444', fontSize: 12, fontWeight: 'bold'}}>CLEAR</Text>
          </TouchableOpacity>
        )}
      </View>

      {showStartPicker && (
        <DateTimePicker
          value={startDate || new Date()}
          mode="date"
          display="default"
          onChange={(event, date) => {
            setShowStartPicker(false);
            if (date) setStartDate(date);
          }}
        />
      )}

      {showEndPicker && (
        <DateTimePicker
          value={endDate || new Date()}
          mode="date"
          display="default"
          onChange={(event, date) => {
            setShowEndPicker(false);
            if (date) setEndDate(date);
          }}
        />
      )}

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
         <View style={styles.metricsGrid}>
            <View style={[styles.metricCard, isDark && styles.darkCard]}>
               <Text style={styles.metricLabel}>ASSIGNED LEADS</Text>
               <Text style={[styles.metricValue, {color: '#3B82F6'}]}>{report.metrics.total_assigned}</Text>
            </View>
            <View style={[styles.metricCard, isDark && styles.darkCard]}>
               <Text style={styles.metricLabel}>INTERACTIONS</Text>
               <Text style={[styles.metricValue, {color: '#10B981'}]}>{report.metrics.total_interactions}</Text>
            </View>
            <View style={[styles.metricCard, isDark && styles.darkCard]}>
               <Text style={styles.metricLabel}>PENDING TASKS</Text>
               <Text style={[styles.metricValue, {color: '#F59E0B'}]}>{report.metrics.pending_tasks}</Text>
            </View>
         </View>

         <Text style={[styles.sectionTitle, {color: isDark ? '#9CA3AF' : '#4B5563'}]}>MASTER ACTIVITY TIMELINE</Text>
         <View style={[styles.timelineContainer, isDark && styles.darkCard]}>
            {report.timeline.map((item: any, idx: number) => (
               <View key={item.id} style={styles.timelineItem}>
                  <View style={styles.timelineLeft}>
                     <View style={styles.timelineDot} />
                     {idx < report.timeline.length - 1 && <View style={styles.timelineLine} />}
                  </View>
                  <View style={styles.timelineContent}>
                     <View style={styles.timelineHeader}>
                        <Text style={[styles.timelineType, isDark && styles.darkText]}>
                           {item.type === 'CALL' ? 'Phone Call with ' : 
                            item.type === 'WHATSAPP' ? 'WhatsApp with ' : 
                            item.type === 'EMAIL' ? 'Email to ' : 'Note on '}
                           <Text style={{color: '#3B82F6'}}>{item.student_name}</Text>
                        </Text>
                     </View>
                     <Text style={styles.timelineDate}>{new Date(item.date).toLocaleString([], {dateStyle: 'medium', timeStyle: 'short'})}</Text>
                     <Text style={styles.timelineNotes}>{item.notes}</Text>
                     
                     {item.audio_url && (
                        <TouchableOpacity style={styles.audioPlayer} onPress={() => playAudio(item.audio_url, item.id)}>
                           <FontAwesome5 name={playingAudio === item.id ? 'stop-circle' : 'play-circle'} size={24} color="#3B82F6" />
                           <Text style={styles.audioText}>{playingAudio === item.id ? 'Playing...' : 'Play Call Recording'}</Text>
                        </TouchableOpacity>
                     )}
                  </View>
               </View>
            ))}
            {report.timeline.length === 0 && (
               <Text style={styles.emptyText}>No activity logged yet.</Text>
            )}
            
            {hasMore && (
               <TouchableOpacity 
                 style={{ padding: 12, alignItems: 'center', backgroundColor: '#EFF6FF', borderRadius: 8, marginTop: 16 }}
                 onPress={() => fetchReport(page + 1)}
                 disabled={loadingMore}
               >
                 <Text style={{ color: '#3B82F6', fontWeight: 'bold' }}>
                   {loadingMore ? 'Loading...' : 'Load More'}
                 </Text>
               </TouchableOpacity>
            )}
         </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  darkBg: {
    backgroundColor: '#0F172A',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0F172A',
  },
  darkHeader: {
    backgroundColor: '#1E293B',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  backButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  content: {
    padding: 16,
  },
  dateFilterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    gap: 8,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  dateButtonText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    gap: 12,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  darkCard: {
    backgroundColor: '#1E293B',
    borderColor: '#374151',
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6B7280',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '900',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 12,
    marginLeft: 4,
  },
  darkText: {
    color: '#F9FAFB',
  },
  timelineContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 0,
  },
  timelineLeft: {
    alignItems: 'center',
    marginRight: 12,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#CBD5E0',
    marginTop: 4,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#E2E8F0',
    marginTop: 4,
    marginBottom: 4,
  },
  timelineContent: {
    flex: 1,
    paddingBottom: 24,
  },
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timelineType: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  timelineDate: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  timelineNotes: {
    fontSize: 13,
    color: '#4B5563',
    marginTop: 8,
    lineHeight: 18,
  },
  audioPlayer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  audioText: {
    marginLeft: 8,
    fontSize: 12,
    fontWeight: '700',
    color: '#1E40AF',
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 20,
  }
});
