import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import client from '../src/api/client';
import { useColorScheme } from '@/components/useColorScheme';

export default function TeamReportScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<any>(null);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  useEffect(() => {
    fetchReport();
  }, [startDate, endDate]);

  const formatDateLocal = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const fetchReport = async () => {
    try {
      setLoading(true);
      let url = `/crm/dashboard-stats/`;

      const queryParams = [];
      if (startDate) queryParams.push(`start_date=${formatDateLocal(startDate)}`);
      if (endDate) queryParams.push(`end_date=${formatDateLocal(endDate)}`);

      if (queryParams.length > 0) {
        url += `?${queryParams.join('&')}`;
      }

      const res = await client.get(url);
      setReport(res.data);
    } catch (err) {
      console.log('Failed to fetch Team report:', err);
    } finally {
      setLoading(false);
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

  const getTotalTalkTimeDisplay = () => {
    if (report?.leaderboard && report.leaderboard.length > 0) {
      const sumSec = report.leaderboard.reduce((acc: number, rep: any) => {
        const repSec = rep.total_call_duration !== undefined ? rep.total_call_duration : parseFormattedDuration(rep.formatted_call_duration);
        return acc + repSec;
      }, 0);
      if (sumSec > 0) {
        return formatDurationSec(sumSec);
      }
    }
    return report?.formatted_total_call_duration || '0s';
  };

  return (
    <SafeAreaView style={[styles.container, isDark && styles.darkBg]}>
      <View style={[styles.header, isDark && styles.darkHeader]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <FontAwesome5 name="chevron-left" size={18} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>TEAM REPORT</Text>
        <View style={{ width: 32 }} />
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

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <TouchableOpacity
            style={[styles.dateButton, isDark && styles.darkCard]}
            onPress={() => setShowStartPicker(true)}
          >
            <FontAwesome5 name="calendar-alt" size={12} color="#6B7280" />
            <Text style={[styles.dateButtonText, isDark && styles.darkText]}>
              {startDate ? startDate.toLocaleDateString() : 'Start Date'}
            </Text>
          </TouchableOpacity>
          <Text style={{ color: '#9CA3AF' }}>-</Text>
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
              <Text style={{ color: '#EF4444', fontSize: 11, fontWeight: 'bold' }}>CLEAR</Text>
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

      {loading ? (
        <View style={[styles.center, isDark && styles.darkBg]}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={{ marginTop: 12, color: isDark ? '#9CA3AF' : '#4B5563' }}>Loading team report...</Text>
        </View>
      ) : report ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

          <View style={styles.metricsGrid}>
            <View style={[styles.metricCard, isDark && styles.darkCard]}>
              <Text style={styles.metricLabel}>TOTAL LEADS</Text>
              <Text style={[styles.metricValue, { color: '#4F46E5' }]}>{report.total_leads}</Text>
            </View>
            <View style={[styles.metricCard, isDark && styles.darkCard]}>
              <Text style={styles.metricLabel}>TOTAL TALK TIME</Text>
              <Text style={[styles.metricValue, { color: '#6366F1' }]}>{getTotalTalkTimeDisplay()}</Text>
            </View>
          </View>

          <View style={styles.metricsGrid}>
            <View style={[styles.metricCard, isDark && styles.darkCard]}>
              <Text style={styles.metricLabel}>CONTACTED</Text>
              <Text style={[styles.metricValue, { color: '#10B981' }]}>{report.contacted_leads}</Text>
            </View>
            <View style={[styles.metricCard, isDark && styles.darkCard]}>
              <Text style={styles.metricLabel}>REVENUE</Text>
              <Text style={[styles.metricValue, { color: '#F59E0B' }]}>₹{report.revenue ? report.revenue.toLocaleString('en-IN') : '0'}</Text>
            </View>
          </View>

          <Text style={[styles.sectionTitle, { color: isDark ? '#9CA3AF' : '#4B5563', marginTop: 8 }]}>TEAM LEADERBOARD</Text>
          <View style={[styles.listContainer, isDark && styles.darkCard]}>
            {report.leaderboard?.map((rep: any, idx: number) => (
              <TouchableOpacity
                key={rep.id}
                style={[styles.listItem, idx < report.leaderboard.length - 1 && styles.borderBottom, isDark && { borderBottomColor: '#374151' }]}
                onPress={() => router.push(`/bde-report?bdeId=${rep.id}` as any)}
              >
                <View style={styles.repAvatar}>
                  <Text style={styles.repAvatarText}>{rep.name ? rep.name.charAt(0).toUpperCase() : 'U'}</Text>
                </View>
                <View style={styles.repInfo}>
                  <Text style={[styles.repName, isDark && styles.darkText]}>{rep.name}</Text>
                  <View style={styles.repStats}>
                    <Text style={styles.repStatText}><FontAwesome5 name="users" size={10} color="#6B7280" /> {rep.assigned} Assigned</Text>
                    <Text style={[styles.repStatText, { marginLeft: 10, color: '#6366F1', fontWeight: '700' }]}><FontAwesome5 name="clock" size={10} color="#6366F1" /> {rep.formatted_call_duration || '0s'}</Text>
                  </View>
                </View>
                <FontAwesome5 name="chevron-right" size={14} color="#9CA3AF" />
              </TouchableOpacity>
            ))}
            {(!report.leaderboard || report.leaderboard.length === 0) && (
              <Text style={styles.emptyText}>No sales representatives found.</Text>
            )}
          </View>

        </ScrollView>
      ) : (
        <View style={[styles.center, isDark && styles.darkBg]}>
          <Text style={{ color: isDark ? '#9CA3AF' : '#4B5563', marginBottom: 12 }}>Unable to load team report.</Text>
          <TouchableOpacity onPress={fetchReport} style={{ backgroundColor: '#3B82F6', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}>
            <Text style={{ color: '#FFF', fontWeight: 'bold' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}
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
    marginBottom: 12,
    gap: 12,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 16,
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
    fontSize: 24,
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
  listContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
  },
  borderBottom: {
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  repAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  repAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#3B82F6',
  },
  repInfo: {
    flex: 1,
  },
  repName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  repStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  repStatText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 20,
  }
});
