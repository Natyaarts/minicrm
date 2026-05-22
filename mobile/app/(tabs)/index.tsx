import React, { useState, useEffect } from 'react';
import { StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import * as Location from 'expo-location';
import { Text, View } from '@/components/Themed';
import { FontAwesome5 } from '@expo/vector-icons';
import { clockIn, clockOut, getAttendanceStatus } from '../../src/api/attendance';
import client from '../../src/api/client';

export default function AttendanceScreen() {
  const [loading, setLoading] = useState(true);
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [attendance, setAttendance] = useState<any>(null);
  const [location, setLocation] = useState<any>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [stats, setStats] = useState<any>(null);

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchStats();
    requestLocationPermission();
  }, []);

  const requestLocationPermission = async () => {
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'We need location access to verify your attendance.');
      return;
    }
    let loc = await Location.getCurrentPositionAsync({});
    setLocation(loc);
  };

  const fetchStats = async () => {
    try {
      const res = await client.get('/dashboard-stats/');
      if (res.data) {
        setStats(res.data);
      }
    } catch (e) {
      console.log('Failed to fetch dashboard stats', e);
    }
  };

  const fetchStatus = async () => {
    setLoading(true);
    const data = await getAttendanceStatus();
    if (data) {
      // Find if there's an active record for today
      const today = new Date().toISOString().split('T')[0];
      const records = data.results || data || [];
      const activeRecord = records.find((r: any) => r.date === today && r.clock_in && !r.clock_out);
      
      if (activeRecord) {
        setIsClockedIn(true);
        setAttendance(activeRecord);
      } else {
        setIsClockedIn(false);
        setAttendance(null);
      }
    }
    setLoading(false);
  };

  const handleAttendance = async () => {
    if (isClockedIn) {
      // Clock Out
      setLoading(true);
      const res = await clockOut();
      if (res.success) {
        Alert.alert('Success', 'Clocked out successfully!');
        fetchStatus();
      } else {
        Alert.alert('Error', res.error);
      }
      setLoading(false);
    } else {
      // Clock In
      setLoading(true);
      // Get fresh location
      let loc = await Location.getCurrentPositionAsync({});
      const res = await clockIn(loc.coords.latitude, loc.coords.longitude);
      if (res.success) {
        Alert.alert('Success', 'Clocked in successfully!');
        fetchStatus();
      } else {
        Alert.alert('Error', res.error);
      }
      setLoading(false);
    }
  };

  if (loading && !attendance) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FFD700" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Hero Header */}
      <View style={styles.heroCard}>
        <Text style={styles.heroTitle}>YOUR WORK HUB</Text>
        <Text style={styles.clockText}>
          {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </Text>
        <Text style={styles.dateText}>
          {currentTime.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
        </Text>

        <TouchableOpacity 
          style={[styles.clockButton, isClockedIn ? styles.buttonOut : styles.buttonIn]}
          onPress={handleAttendance}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <FontAwesome5 name={isClockedIn ? "stop-circle" : "play-circle"} size={20} color="#FFF" />
              <Text style={styles.buttonText}>{isClockedIn ? "Clock Out Now" : "Clock In Now"}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Status Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>CURRENT STATUS</Text>
        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <FontAwesome5 name="map-marker-alt" size={16} color="#4A5568" />
            <Text style={styles.statusLabel}>Location Status</Text>
            <Text style={[styles.statusValue, { color: location ? '#48BB78' : '#F56565' }]}>
              {location ? 'Active' : 'Disconnected'}
            </Text>
          </View>
          
          {isClockedIn && (
            <View style={[styles.statusRow, { borderTopWidth: 1, borderTopColor: '#EDF2F7', marginTop: 12, paddingTop: 12 }]}>
              <FontAwesome5 name="clock" size={16} color="#4A5568" />
              <Text style={styles.statusLabel}>Clocked In At</Text>
              <Text style={styles.statusValue}>{attendance?.clock_in?.split('.')[0]}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Dashboard Stats Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>DASHBOARD QUICK SUMMARY</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <View style={styles.statHeader}>
              <FontAwesome5 name="graduation-cap" size={16} color="#3182CE" />
              <Text style={[styles.statBadge, { color: '#3182CE', backgroundColor: '#EBF8FF' }]}>Live</Text>
            </View>
            <Text style={styles.statNumber}>{stats?.students ?? '...'}</Text>
            <Text style={styles.statName}>Active Students</Text>
          </View>
          <View style={styles.statCard}>
            <View style={styles.statHeader}>
              <FontAwesome5 name="university" size={16} color="#805AD5" />
              <Text style={[styles.statBadge, { color: '#805AD5', backgroundColor: '#F3E8FF' }]}>Active</Text>
            </View>
            <Text style={styles.statNumber}>{stats?.batches ?? '...'}</Text>
            <Text style={styles.statName}>Total Batches</Text>
          </View>
          <View style={styles.statCard}>
            <View style={styles.statHeader}>
              <FontAwesome5 name="user-friends" size={16} color="#DD6B20" />
              <Text style={[styles.statBadge, { color: '#DD6B20', backgroundColor: '#FEEBC8' }]}>Leads</Text>
            </View>
            <Text style={styles.statNumber}>{stats?.leads ?? '...'}</Text>
            <Text style={styles.statName}>Unassigned Leads</Text>
          </View>
          <View style={styles.statCard}>
            <View style={styles.statHeader}>
              <FontAwesome5 name="wallet" size={16} color="#38A169" />
              <Text style={[styles.statBadge, { color: '#38A169', backgroundColor: '#C6F6D5' }]}>INR</Text>
            </View>
            <Text style={styles.statNumber}>₹{stats?.expenses ? Math.round(stats.expenses) : '0'}</Text>
            <Text style={styles.statName}>Monthly Expenses</Text>
          </View>
        </View>
      </View>

      {/* Info Section */}
      <View style={styles.infoCard}>
        <FontAwesome5 name="info-circle" size={20} color="#3182CE" />
        <Text style={styles.infoText}>
          Your location is verified against office geofencing coordinates for attendance accuracy.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7FAFC',
  },
  content: {
    padding: 20,
    paddingTop: 60,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1A202C',
  },
  heroCard: {
    backgroundColor: '#1A202C',
    borderRadius: 30,
    padding: 30,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  heroTitle: {
    color: '#A0AEC0',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 10,
  },
  clockText: {
    color: '#FFFFFF',
    fontSize: 42,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    marginBottom: 5,
  },
  dateText: {
    color: '#CBD5E0',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 30,
  },
  clockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 40,
    borderRadius: 20,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 5,
  },
  buttonIn: {
    backgroundColor: '#48BB78',
  },
  buttonOut: {
    backgroundColor: '#F56565',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    marginLeft: 12,
  },
  section: {
    marginTop: 30,
    backgroundColor: 'transparent',
  },
  sectionTitle: {
    color: '#4A5568',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 15,
    marginLeft: 5,
  },
  statusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  statusLabel: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    color: '#4A5568',
    fontWeight: '700',
  },
  statusValue: {
    fontSize: 14,
    fontWeight: '900',
    color: '#1A202C',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
    gap: 12,
  },
  statCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    width: '47%',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  statHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'transparent',
    marginBottom: 8,
  },
  statBadge: {
    fontSize: 10,
    fontWeight: '900',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 8,
    overflow: 'hidden',
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '900',
    color: '#1A202C',
    marginBottom: 4,
  },
  statName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#718096',
  },
  infoCard: {
    marginTop: 30,
    flexDirection: 'row',
    backgroundColor: '#EBF8FF',
    padding: 20,
    borderRadius: 20,
    alignItems: 'center',
  },
  infoText: {
    flex: 1,
    marginLeft: 15,
    color: '#2C5282',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
});
