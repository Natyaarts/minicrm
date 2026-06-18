import React, { useState, useEffect } from 'react';
import { StyleSheet, ScrollView, TouchableOpacity, TextInput, StatusBar } from 'react-native';
import { Text, View } from '@/components/Themed';
import { FontAwesome5 } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../../src/api/client';

export default function MenuHubScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    loadUser();
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
      console.log('Failed to fetch user details in MenuHubScreen:', err);
    }
  };

  const hasDialerAccess = user?.role === 'SALES' || user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  const menuGroups = [
    {
      category: 'ACADEMICS',
      color: isDark ? 'rgba(59, 130, 246, 0.15)' : '#EBF8FF',
      accent: '#3182CE',
      items: [
        { title: 'Dashboard', icon: 'th-large', route: '/(tabs)' },
        ...(hasDialerAccess
          ? [
              { title: 'Sales/Leads', icon: 'user-friends', route: '/(tabs)/two' },
              { title: 'General Dialer', icon: 'phone-alt', route: '/dialpad?leadId=0' },
            ]
          : []),
        { title: 'Mentor Module', icon: 'chalkboard-teacher', route: '/module?title=Mentor Module&category=Academics' },
        { title: 'Student Portal', icon: 'user-graduate', route: '/module?title=Student Portal&category=Academics' },
        ...(user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN' || user?.role === 'ACADEMIC_COORDINATOR'
          ? [
              { title: 'Academic Hierarchy', icon: 'sitemap', route: '/module?title=Academic Hierarchy&category=Academics' },
              { title: 'Coordinator Module', icon: 'user-tie', route: '/module?title=Coordinator Module&category=Academics' },
            ]
          : []),
        { title: 'Teacher Module', icon: 'book-reader', route: '/module?title=Teacher Module&category=Academics' },
        ...(user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN'
          ? [
              { title: 'Courses', icon: 'book', route: '/module?title=Courses&category=Academics' },
              { title: 'Analytics', icon: 'chart-line', route: '/module?title=Analytics&category=Academics' },
            ]
          : []),
      ],
    },
    {
      category: 'HRMS MODULE',
      color: isDark ? 'rgba(16, 185, 129, 0.15)' : '#E6FFFA',
      accent: '#319795',
      items: [
        ...(user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN'
          ? [{ title: 'Workforce Hub', icon: 'building', route: '/module?title=Workforce Hub&category=HRMS' }]
          : []),
        { title: 'Attendance', icon: 'clock', route: '/module?title=Attendance&category=HRMS' },
        { title: 'Payroll', icon: 'money-check-alt', route: '/module?title=Payroll&category=HRMS' },
        { title: 'Leave Management', icon: 'calendar-alt', route: '/module?title=Leave Management&category=HRMS' },
        { title: 'Tasks & Performance', icon: 'tasks', route: '/module?title=Tasks & Performance&category=HRMS' },
      ],
    },
    {
      category: 'ADMINISTRATIVE',
      color: isDark ? 'rgba(139, 92, 246, 0.15)' : '#FAF5FF',
      accent: '#805AD5',
      items: [
        { title: 'Staff Directory', icon: 'address-book', route: '/module?title=Staff Directory&category=Administrative' },
        ...(user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN'
          ? [
              { title: 'Finance Manager', icon: 'wallet', route: '/module?title=Finance Manager&category=Administrative' },
              { title: 'Admin Panel', icon: 'cogs', route: '/module?title=Admin Panel&category=Administrative' },
            ]
          : []),
      ],
    },
  ];

  // Filter items based on search query
  const filteredGroups = menuGroups.map(group => ({
    ...group,
    items: group.items.filter(item => item.title.toLowerCase().includes(search.toLowerCase()))
  })).filter(group => group.items.length > 0);

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#111827' : '#F9FAFB' }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      {/* Search Header */}
      <View style={[styles.header, { backgroundColor: isDark ? '#1F2937' : '#FFFFFF', borderColor: isDark ? '#374151' : '#E2E8F0' }]}>
        <Text style={[styles.headerTitle, { color: isDark ? '#9CA3AF' : '#4A5568' }]}>ERP MASTER HUB</Text>
        <View style={[styles.searchBar, { backgroundColor: isDark ? '#111827' : '#F9FAFB', borderColor: isDark ? '#374151' : '#E2E8F0' }]}>
          <FontAwesome5 name="search" size={14} color="#A0AEC0" />
          <TextInput
            style={[styles.input, { color: isDark ? '#FFFFFF' : '#1A202C' }]}
            placeholder="Search modules..."
            placeholderTextColor="#A0AEC0"
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <FontAwesome5 name="times-circle" size={16} color="#A0AEC0" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {filteredGroups.map((group, gIdx) => (
          <View key={gIdx} style={styles.groupContainer}>
            <View style={styles.groupHeader}>
              <View style={[styles.badge, { backgroundColor: group.color }]}>
                <Text style={[styles.badgeText, { color: group.accent }]}>{group.category}</Text>
              </View>
            </View>

            <View style={styles.grid}>
              {group.items.map((item, iIdx) => (
                <TouchableOpacity
                  key={iIdx}
                  style={[styles.card, { backgroundColor: isDark ? '#1F2937' : '#FFFFFF', borderColor: isDark ? '#374151' : '#E2E8F0' }]}
                  onPress={() => router.push(item.route as any)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconContainer, { backgroundColor: group.color }]}>
                    <FontAwesome5 name={item.icon} size={18} color={group.accent} />
                  </View>
                  <Text style={[styles.cardTitle, { color: isDark ? '#E5E7EB' : '#1A202C' }]} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <FontAwesome5 name="chevron-right" size={10} color={isDark ? '#4B5563' : '#CBD5E0'} style={styles.chevron} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {filteredGroups.length === 0 && (
          <View style={styles.emptyContainer}>
            <FontAwesome5 name="box-open" size={40} color="#CBD5E0" />
            <Text style={styles.emptyText}>No matching modules found.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 20,
    paddingTop: 55,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 15,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
  },
  input: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  groupContainer: {
    marginBottom: 24,
    backgroundColor: 'transparent',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    backgroundColor: 'transparent',
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    backgroundColor: 'transparent',
  },
  card: {
    width: '48%',
    borderRadius: 20,
    padding: 16,
    alignItems: 'flex-start',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 5,
    elevation: 1,
  },
  iconContainer: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
    marginBottom: 6,
  },
  chevron: {
    marginTop: 'auto',
    alignSelf: 'flex-end',
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 80,
    backgroundColor: 'transparent',
  },
  emptyText: {
    marginTop: 16,
    fontSize: 14,
    color: '#A0AEC0',
    fontWeight: '600',
  },
});
