import React, { useState, useEffect } from 'react';
import { StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Image } from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text, View } from '@/components/Themed';
import { FontAwesome5 } from '@expo/vector-icons';
import { clockIn, clockOut, getAttendanceStatus } from '../../src/api/attendance';
import client from '../../src/api/client';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useRouter } from 'expo-router';

export default function AttendanceScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const themeColors = Colors[colorScheme ?? 'light'];

  const [loading, setLoading] = useState(true);
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [attendance, setAttendance] = useState<any>(null);
  const [location, setLocation] = useState<any>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [stats, setStats] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    loadUser();
    fetchStatus();
    fetchStats();
    requestLocationPermission();
    checkIfClockInWasInterrupted();
  }, []);

  const loadUser = async () => {
    try {
      const cached = await AsyncStorage.getItem('userInfo');
      if (cached) {
        setUser(JSON.parse(cached));
      }
      const res = await client.get('/auth/me/');
      if (res.data) {
        setUser(res.data);
        await AsyncStorage.setItem('userInfo', JSON.stringify(res.data));
      }
    } catch (err) {
      console.log('Failed to fetch user details:', err);
    }
  };

  const requestLocationPermission = async () => {
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'We need location access to verify your attendance.');
      return;
    }
    let loc = await Location.getCurrentPositionAsync({});
    setLocation(loc);
  };

  // If the app reloaded in the middle of a clock-in (e.g. camera dismissed app on Android),
  // inform the user they need to try again.
  const checkIfClockInWasInterrupted = async () => {
    try {
      const pending = await AsyncStorage.getItem('clockInPending');
      if (pending === 'true') {
        await AsyncStorage.removeItem('clockInPending');
        Alert.alert(
          'Clock-In Interrupted',
          'It looks like the app was reloaded during clock-in. Please press the Clock In button again.',
          [{ text: 'OK' }]
        );
      }
    } catch (e) {
      console.warn('checkIfClockInWasInterrupted error:', e);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await client.get('/dashboard-stats/');
      if (res.data) {
        setStats(res.data);
      }
      
      const tasksRes = await client.get('/crm/tasks/', { params: { status: 'PENDING' } });
      const tasksData = tasksRes.data?.results || tasksRes.data || [];
      setTasks(tasksData.slice(0, 3));
    } catch (e) {
      console.log('Failed to fetch dashboard stats', e);
    }
  };

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const data = await getAttendanceStatus(today);
      if (data) {
        const records = data.results || data || [];
        // Only look at TODAY's records — filter by date to avoid stale previous days
        const activeRecord = records.find((r: any) => r.date === today && r.clock_in && !r.clock_out);
        
        if (activeRecord) {
          setIsClockedIn(true);
          setAttendance(activeRecord);
        } else {
          setIsClockedIn(false);
          setAttendance(null);
        }
      }
    } catch (err) {
      console.error('fetchStatus failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAttendance = async () => {
    setLoading(true);
    try {
      if (isClockedIn) {
        const res = await clockOut();
        if (res.success) {
          Alert.alert('Success', 'Clocked out successfully!');
          await fetchStatus();
        } else {
          Alert.alert('Error', res.error);
        }
      } else {
        const cameraPerm = await ImagePicker.requestCameraPermissionsAsync();
        if (cameraPerm.status !== 'granted') {
            Alert.alert('Permission Denied', 'We need camera access to verify your identity for clock-in.');
            return;
        }

        // Mark that we are about to open the camera (in case app gets reloaded)
        await AsyncStorage.setItem('clockInPending', 'true');

        const photoResult = await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            allowsEditing: false,
            quality: 0.5,
            cameraType: 'front' as any,
            base64: true,
        });

        // Camera returned — clear the pending flag
        await AsyncStorage.removeItem('clockInPending');

        if (photoResult.canceled || !photoResult.assets || !photoResult.assets[0].base64) {
            return;
        }

        const base64Photo = `data:image/jpeg;base64,${photoResult.assets[0].base64}`;

        let loc;
        try {
          const locServicesEnabled = await Location.hasServicesEnabledAsync();
          if (!locServicesEnabled) {
            throw new Error('Location services are disabled on your device. Please enable GPS.');
          }
          
          const { status } = await Location.getForegroundPermissionsAsync();
          if (status !== 'granted') {
            throw new Error('Location permissions have not been granted. Please enable location access in settings.');
          }

          loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
        } catch (locErr: any) {
          console.warn('getCurrentPositionAsync failed, trying getLastKnownPositionAsync:', locErr);
          loc = await Location.getLastKnownPositionAsync({});
          if (!loc) {
            throw new Error(locErr.message || 'Could not retrieve your current GPS coordinates. Please ensure GPS is enabled and has signal.');
          }
        }

        const res = await clockIn(loc.coords.latitude, loc.coords.longitude, base64Photo);
        
        if (res.success) {
          if (res.data.is_face_verified) {
             Alert.alert('Success', `Clocked in! Identity verified securely (Confidence: ${res.data.verification_confidence}%).`);
          } else {
             Alert.alert('Warning', 'Clocked in, but Face Verification failed or no reference profile photo exists.');
          }
          await fetchStatus();
        } else {
          Alert.alert('Error', res.error);
        }
      }
    } catch (error: any) {
      console.error('Attendance execution error:', error);
      Alert.alert('Error', error.message || 'An unexpected error occurred during attendance check.');
    } finally {
      setLoading(false);
    }
  };

  const getGreeting = () => {
    const hours = currentTime.getHours();
    if (hours < 12) return 'Good Morning';
    if (hours < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  if (loading && !attendance && !user) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: isDark ? '#111827' : '#F9FAFB' }]}>
        <ActivityIndicator size="large" color="#FBBF24" />
      </View>
    );
  }

  const welcomeName = user ? `${user.first_name || user.username}` : 'Member';
  const roleName = user ? `${user.role || 'Staff'}`.replace('_', ' ') : 'MEMBER';

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: isDark ? '#111827' : '#F9FAFB' }]} 
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Welcome Bar */}
      <View style={[styles.welcomeBar, { backgroundColor: 'transparent' }]}>
        <View style={{ backgroundColor: 'transparent' }}>
          <Text style={[styles.greetingText, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>
            {getGreeting()},
          </Text>
          <Text style={[styles.nameText, { color: isDark ? '#FFFFFF' : '#111827' }]}>
            {welcomeName}
          </Text>
        </View>
        <View style={styles.roleBadge}>
          <Text style={styles.roleBadgeText}>{roleName}</Text>
        </View>
      </View>

      {/* Hero Header Clock Card */}
      <View style={styles.heroCard}>
        <Text style={styles.heroTitle}>PORTAL HUB</Text>
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
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <FontAwesome5 name={isClockedIn ? "sign-out-alt" : "fingerprint"} size={20} color="#FFF" />
              <Text style={styles.buttonText}>{isClockedIn ? "Clock Out Now" : "Scan Fingerprint / Clock In"}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Status Section */}
      <View style={[styles.section, { backgroundColor: 'transparent' }]}>
        <Text style={[styles.sectionTitle, { color: isDark ? '#9CA3AF' : '#4B5563' }]}>ATTENDANCE REGISTRY</Text>
        <View style={[styles.statusCard, { backgroundColor: isDark ? '#1F2937' : '#FFFFFF', borderColor: isDark ? '#374151' : '#E5E7EB' }]}>
          <View style={styles.statusRow}>
            <FontAwesome5 name="map-marker-alt" size={16} color={location ? '#10B981' : '#EF4444'} />
            <Text style={[styles.statusLabel, { color: isDark ? '#D1D5DB' : '#374151' }]}>Geofencing Lock</Text>
            <Text style={[styles.statusValue, { color: location ? '#10B981' : '#EF4444' }]}>
              {location ? 'Locked In' : 'Acquiring GPS...'}
            </Text>
          </View>
          
          {isClockedIn && (
            <View style={[styles.statusRow, { borderTopWidth: 1, borderTopColor: isDark ? '#374151' : '#F3F4F6', marginTop: 12, paddingTop: 12 }]}>
              <FontAwesome5 name="clock" size={16} color="#3B82F6" />
              <Text style={[styles.statusLabel, { color: isDark ? '#D1D5DB' : '#374151' }]}>Shift Clock In</Text>
              <Text style={[styles.statusValue, { color: isDark ? '#FFFFFF' : '#111827' }]}>
                {attendance?.clock_in
                  ? attendance.clock_in.substring(0, 5) // "09:30" from "09:30:00"
                  : 'Pending'}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Dashboard Stats Section */}
      <View style={[styles.section, { backgroundColor: 'transparent' }]}>
        <Text style={[styles.sectionTitle, { color: isDark ? '#9CA3AF' : '#4B5563' }]}>ACADEMY QUICK LOOK</Text>
        <View style={styles.statsGrid}>
          <TouchableOpacity 
            style={[styles.statCard, { backgroundColor: isDark ? '#1F2937' : '#FFFFFF', borderColor: isDark ? '#374151' : '#E5E7EB' }]}
            onPress={() => router.push('/module?title=Academic Hierarchy&category=Academics' as any)}
            activeOpacity={0.8}
          >
            <View style={styles.statHeader}>
              <FontAwesome5 name="graduation-cap" size={16} color="#3B82F6" />
              <Text style={[styles.statBadge, { color: '#3B82F6', backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>Live</Text>
            </View>
            <Text style={[styles.statNumber, { color: isDark ? '#FFFFFF' : '#111827' }]}>{stats?.students ?? '0'}</Text>
            <Text style={[styles.statName, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>Students</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.statCard, { backgroundColor: isDark ? '#1F2937' : '#FFFFFF', borderColor: isDark ? '#374151' : '#E5E7EB' }]}
            onPress={() => router.push('/module?title=Mentor Module&category=Academics' as any)}
            activeOpacity={0.8}
          >
            <View style={styles.statHeader}>
              <FontAwesome5 name="university" size={16} color="#8B5CF6" />
              <Text style={[styles.statBadge, { color: '#8B5CF6', backgroundColor: 'rgba(139, 92, 246, 0.15)' }]}>Active</Text>
            </View>
            <Text style={[styles.statNumber, { color: isDark ? '#FFFFFF' : '#111827' }]}>{stats?.batches ?? '0'}</Text>
            <Text style={[styles.statName, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>Batches</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.statCard, { backgroundColor: isDark ? '#1F2937' : '#FFFFFF', borderColor: isDark ? '#374151' : '#E5E7EB' }]}
            onPress={() => router.push('/(tabs)/two' as any)}
            activeOpacity={0.8}
          >
            <View style={styles.statHeader}>
              <FontAwesome5 name="user-friends" size={16} color="#F59E0B" />
              <Text style={[styles.statBadge, { color: '#F59E0B', backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>Pipeline</Text>
            </View>
            <Text style={[styles.statNumber, { color: isDark ? '#FFFFFF' : '#111827' }]}>{stats?.leads ?? '0'}</Text>
            <Text style={[styles.statName, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>Leads</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.statCard, { backgroundColor: isDark ? '#1F2937' : '#FFFFFF', borderColor: isDark ? '#374151' : '#E5E7EB' }]}
            onPress={() => router.push('/module?title=Finance Manager&category=Administrative' as any)}
            activeOpacity={0.8}
          >
            <View style={styles.statHeader}>
              <FontAwesome5 name="wallet" size={16} color="#10B981" />
              <Text style={[styles.statBadge, { color: '#10B981', backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>INR</Text>
            </View>
            <Text style={[styles.statNumber, { color: isDark ? '#FFFFFF' : '#111827' }]}>
              ₹{stats?.expenses ? Math.round(stats.expenses).toLocaleString('en-IN') : '0'}
            </Text>
            <Text style={[styles.statName, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>Expenses</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Sales CRM Hub Section */}
      {(user?.role === 'SALES' || user?.role === 'SUPER_ADMIN') && (
        <View style={[styles.section, { backgroundColor: 'transparent' }]}>
          <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12}}>
            <Text style={[styles.sectionTitle, { color: isDark ? '#9CA3AF' : '#4B5563', marginBottom: 0 }]}>SALES CRM HUB</Text>
            <TouchableOpacity onPress={() => router.push(`/bde-report?bdeId=${user.id}` as any)}>
               <Text style={{color: '#3B82F6', fontSize: 12, fontWeight: '700'}}>MY FULL REPORT &gt;</Text>
            </TouchableOpacity>
          </View>
          
          <View style={[styles.tasksCard, { backgroundColor: isDark ? '#1F2937' : '#FFFFFF', borderColor: isDark ? '#374151' : '#E5E7EB' }]}>
             <Text style={[styles.tasksHeader, { color: isDark ? '#D1D5DB' : '#374151' }]}>My Upcoming Follow-ups</Text>
             {tasks.length > 0 ? tasks.map(task => (
                <TouchableOpacity key={task.id} style={[styles.taskItem, { borderTopColor: isDark ? '#374151' : '#F3F4F6' }]} onPress={() => router.push(`/lead-details?leadId=${task.student}` as any)}>
                   <View style={{flex: 1}}>
                      <Text style={[styles.taskTitle, { color: isDark ? '#F9FAFB' : '#111827' }]} numberOfLines={1}>{task.title}</Text>
                      <Text style={styles.taskDate}>
                         <FontAwesome5 name="clock" size={10} color="#F59E0B" /> {new Date(task.due_date).toLocaleString([], {month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'})}
                      </Text>
                   </View>
                   <FontAwesome5 name="chevron-right" size={14} color="#9CA3AF" />
                </TouchableOpacity>
             )) : (
                <Text style={styles.emptyTaskText}>No pending follow-ups.</Text>
             )}
          </View>
        </View>
      )}

      {/* Geofence Alert Info */}
      <View style={[styles.infoCard, { backgroundColor: isDark ? '#1E3A8A' : '#EFF6FF', borderColor: isDark ? '#3B82F6' : '#BFDBFE' }]}>
        <FontAwesome5 name="info-circle" size={18} color="#3B82F6" />
        <Text style={[styles.infoText, { color: isDark ? '#93C5FD' : '#1E40AF' }]}>
          Secure Face Recognition & Geofenced boundary validation is enabled. Please log in when physically inside the facility premises.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingTop: 45,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  welcomeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  greetingText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  nameText: {
    fontSize: 26,
    fontWeight: '900',
    marginTop: 2,
  },
  roleBadge: {
    backgroundColor: '#374151',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'center',
  },
  roleBadgeText: {
    color: '#FFD700',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  heroCard: {
    backgroundColor: '#1E293B', // Beautiful deep steel dark gray
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 8,
    marginBottom: 24,
  },
  heroTitle: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2.5,
    marginBottom: 8,
  },
  clockText: {
    color: '#FFFFFF',
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 4,
  },
  dateText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 20,
  },
  clockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 16,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  buttonIn: {
    backgroundColor: '#10B981', // Emerald green
  },
  buttonOut: {
    backgroundColor: '#EF4444', // Crimson red
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    marginLeft: 10,
    letterSpacing: 0.5,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 12,
    marginLeft: 4,
  },
  statusCard: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
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
    fontWeight: '700',
  },
  statusValue: {
    fontSize: 14,
    fontWeight: '900',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
    gap: 12,
  },
  statCard: {
    borderRadius: 20,
    padding: 16,
    width: '48%',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  statHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'transparent',
    marginBottom: 10,
  },
  statBadge: {
    fontSize: 9,
    fontWeight: '900',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 2,
  },
  statName: {
    fontSize: 12,
    fontWeight: '700',
  },
  tasksCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
  },
  tasksHeader: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 12,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  taskTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  taskDate: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  emptyTaskText: {
    fontSize: 13,
    color: '#9CA3AF',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 12,
  },
  infoCard: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 30,
  },
  infoText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
});
