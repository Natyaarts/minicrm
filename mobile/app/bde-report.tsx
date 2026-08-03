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
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'longest_call'>('newest');
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
  }, [bdeId, startDate, endDate, sortBy]);

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
      if (sortBy) queryParams.push(`sort_by=${sortBy}`);
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

  const parseFormattedDuration = (str?: string): number => {
    if (!str) return 0;
    let sec = 0;
    const hoursMatch = str.match(/(\d+)\s*h/i);
    const minsMatch = str.match(/(\d+)\s*m/i);
    const secsMatch = str.match(/(\d+)\s*s/i);
    if (hoursMatch) sec += parseInt(hoursMatch[1], 10) * 3600;
    if (minsMatch) sec += parseInt(minsMatch[1], 10) * 60;
    if (secsMatch) sec += parseInt(secsMatch[1], 10);
    return sec;
  };

  const formatDurationSec = (seconds: number) => {
    if (!seconds || seconds <= 0) return '0s';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const parts = [];
    if (h > 0) parts.push(`${h}h`);
    if (m > 0 || h > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
  };

  const getTotalBdeTalkTime = () => {
    if (report?.metrics?.formatted_total_call_duration) {
      return report.metrics.formatted_total_call_duration;
    }
    if (report?.timeline && report.timeline.length > 0) {
      const sumSec = report.timeline.reduce((acc: number, item: any) => {
        const duration = item.call_duration || parseFormattedDuration(item.formatted_call_duration);
        return acc + duration;
      }, 0);
      if (sumSec > 0) return formatDurationSec(sumSec);
    }
    return '0s';
  };

  const getSortedTimeline = () => {
    if (!report?.timeline) return [];
    let items = [...report.timeline];
    if (sortBy === 'longest_call') {
      items = items.filter((item: any) => item.type === 'CALL' || item.call_duration > 0 || item.formatted_call_duration);
      items.sort((a: any, b: any) => {
        const durA = a.call_duration || parseFormattedDuration(a.formatted_call_duration);
        const durB = b.call_duration || parseFormattedDuration(b.formatted_call_duration);
        return durB - durA;
      });
    } else if (sortBy === 'oldest') {
      items.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
    } else {
      items.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
    return items;
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

      <View style={[styles.dateFilterContainer, isDark && styles.darkCard]}>
        <View style={styles.presetButtonsRow}>
          <TouchableOpacity 
            style={styles.presetChip} 
            onPress={() => {
              const today = new Date();
              setStartDate(today);
              setEndDate(today);
            }}
          >
            <Text style={styles.presetChipText}>Today</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.presetChip} 
            onPress={() => {
              const yesterday = new Date();
              yesterday.setDate(yesterday.getDate() - 1);
              setStartDate(yesterday);
              setEndDate(yesterday);
            }}
          >
            <Text style={styles.presetChipText}>Yesterday</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.presetChip} 
            onPress={() => {
              const today = new Date();
              const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
              setStartDate(firstDay);
              setEndDate(today);
            }}
          >
            <Text style={styles.presetChipText}>This Month</Text>
          </TouchableOpacity>
        </View>

        <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4}}>
          <TouchableOpacity 
            style={[styles.dateButton, isDark && styles.darkCard]} 
            onPress={() => setShowStartPicker(true)}
          >
            <FontAwesome5 name="calendar-alt" size={12} color="#6B7280" />
            <Text style={[styles.dateButtonText, isDark && styles.darkText]}>
              {startDate ? startDate.toLocaleDateString() : 'Start Date'}
            </Text>
          </TouchableOpacity>
          <Text style={{color: '#9CA3AF'}}>-</Text>
          <TouchableOpacity 
            style={[styles.dateButton, isDark && styles.darkCard]} 
            onPress={() => setShowEndPicker(true)}
          >
            <FontAwesome5 name="calendar-alt" size={12} color="#6B7280" />
            <Text style={[styles.dateButtonText, isDark && styles.darkText]}>
              {endDate ? endDate.toLocaleDateString() : 'End Date'}
            </Text>
          </TouchableOpacity>
          
          {(startDate || endDate) && (
            <TouchableOpacity onPress={() => { setStartDate(null); setEndDate(null); }}>
               <Text style={{color: '#EF4444', fontSize: 11, fontWeight: 'bold'}}>CLEAR</Text>
            </TouchableOpacity>
          )}
        </View>
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
         {/* Sort Options Bar */}
         <View style={styles.sortBarContainer}>
           <Text style={styles.sortLabel}>SORT BY:</Text>
           <TouchableOpacity 
             style={[styles.sortChip, sortBy === 'newest' && styles.sortChipActive]}
             onPress={() => setSortBy('newest')}
           >
             <Text style={[styles.sortChipText, sortBy === 'newest' && styles.sortChipTextActive]}>Newest</Text>
           </TouchableOpacity>

           <TouchableOpacity 
             style={[styles.sortChip, sortBy === 'oldest' && styles.sortChipActive]}
             onPress={() => setSortBy('oldest')}
           >
             <Text style={[styles.sortChipText, sortBy === 'oldest' && styles.sortChipTextActive]}>Oldest</Text>
           </TouchableOpacity>

           <TouchableOpacity 
             style={[styles.sortChip, sortBy === 'longest_call' && styles.sortChipActive]}
             onPress={() => setSortBy('longest_call')}
           >
             <Text style={[styles.sortChipText, sortBy === 'longest_call' && styles.sortChipTextActive]}>Longest Call</Text>
           </TouchableOpacity>
         </View>

         <View style={styles.metricsGrid}>
            <View style={[styles.metricCard, isDark && styles.darkCard]}>
               <Text style={styles.metricLabel}>ASSIGNED LEADS</Text>
               <Text style={[styles.metricValue, {color: '#3B82F6'}]}>{report.metrics.total_assigned}</Text>
            </View>
            <View style={[styles.metricCard, isDark && styles.darkCard]}>
               <Text style={styles.metricLabel}>TOTAL TALK TIME</Text>
               <Text style={[styles.metricValue, {color: '#6366F1'}]}>{getTotalBdeTalkTime()}</Text>
            </View>
            <View style={[styles.metricCard, isDark && styles.darkCard]}>
               <Text style={styles.metricLabel}>CALLS LOGGED</Text>
               <Text style={[styles.metricValue, {color: '#10B981'}]}>{report.metrics.total_interactions}</Text>
            </View>
         </View>

         <Text style={[styles.sectionTitle, {color: isDark ? '#9CA3AF' : '#4B5563'}]}>MASTER ACTIVITY TIMELINE</Text>
         <View style={[styles.timelineContainer, isDark && styles.darkCard]}>
            {getSortedTimeline().map((item: any, idx: number) => (
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

                        {item.type === 'CALL' && item.formatted_call_duration && (
                           <View style={styles.durationBadge}>
                              <FontAwesome5 name="clock" size={10} color="#6366F1" />
                              <Text style={styles.durationBadgeText}>{item.formatted_call_duration}</Text>
                           </View>
                        )}
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
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    gap: 6,
  },
  presetButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  presetChip: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4338CA',
  },
  sortBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 6,
  },
  sortLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6B7280',
    marginRight: 4,
  },
  sortChip: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sortChipActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#2563EB',
  },
  sortChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4B5563',
  },
  sortChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 4,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  durationBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4338CA',
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
