import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
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

  if (loading && !report) {
    return (
      <View style={[styles.center, isDark && styles.darkBg]}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={{marginTop: 12, color: isDark ? '#9CA3AF' : '#4B5563'}}>Loading team report...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, isDark && styles.darkBg]}>
      <View style={[styles.header, isDark && styles.darkHeader]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
           <FontAwesome5 name="chevron-left" size={18} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>TEAM REPORT</Text>
        <View style={{width: 32}} />
      </View>

      <View style={[styles.dateFilterContainer, isDark && styles.darkCard]}>
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

      {report && (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          
          <View style={styles.metricsGrid}>
            <View style={[styles.metricCard, isDark && styles.darkCard]}>
                <Text style={styles.metricLabel}>TOTAL LEADS</Text>
                <Text style={[styles.metricValue, {color: '#4F46E5'}]}>{report.total_leads}</Text>
            </View>
            <View style={[styles.metricCard, isDark && styles.darkCard]}>
                <Text style={styles.metricLabel}>UNASSIGNED</Text>
                <Text style={[styles.metricValue, {color: '#F43F5E'}]}>{report.unassigned_leads}</Text>
            </View>
          </View>
          
          <View style={styles.metricsGrid}>
            <View style={[styles.metricCard, isDark && styles.darkCard]}>
                <Text style={styles.metricLabel}>CONTACTED</Text>
                <Text style={[styles.metricValue, {color: '#10B981'}]}>{report.contacted_leads}</Text>
            </View>
            <View style={[styles.metricCard, isDark && styles.darkCard]}>
                <Text style={styles.metricLabel}>REVENUE</Text>
                <Text style={[styles.metricValue, {color: '#F59E0B'}]}>₹{report.revenue ? report.revenue.toLocaleString('en-IN') : '0'}</Text>
            </View>
          </View>

          <Text style={[styles.sectionTitle, {color: isDark ? '#9CA3AF' : '#4B5563', marginTop: 8}]}>TEAM LEADERBOARD</Text>
          <View style={[styles.listContainer, isDark && styles.darkCard]}>
              {report.leaderboard?.map((rep: any, idx: number) => (
                <TouchableOpacity 
                    key={rep.id} 
                    style={[styles.listItem, idx < report.leaderboard.length - 1 && styles.borderBottom, isDark && { borderBottomColor: '#374151' }]}
                    onPress={() => router.push(`/bde-report?bdeId=${rep.id}` as any)}
                >
                    <View style={styles.repAvatar}>
                        <Text style={styles.repAvatarText}>{rep.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={styles.repInfo}>
                        <Text style={[styles.repName, isDark && styles.darkText]}>{rep.name}</Text>
                        <View style={styles.repStats}>
                            <Text style={styles.repStatText}><FontAwesome5 name="users" size={10} color="#6B7280" /> {rep.assigned} Assigned</Text>
                            <Text style={[styles.repStatText, { marginLeft: 12, color: '#10B981' }]}><FontAwesome5 name="phone-alt" size={10} color="#10B981" /> {rep.contacted} Contacted</Text>
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
