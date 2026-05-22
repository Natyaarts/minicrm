import React, { useState } from 'react';
import { StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { Text, View } from '@/components/Themed';
import { FontAwesome5 } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

export default function MenuHubScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');

  const menuGroups = [
    {
      category: 'ACADEMICS',
      color: '#EBF8FF',
      accent: '#3182CE',
      items: [
        { title: 'Dashboard', icon: 'th-large', route: '/(tabs)' },
        { title: 'Sales/Leads', icon: 'user-friends', route: '/(tabs)/two' },
        { title: 'Mentor Module', icon: 'chalkboard-teacher', route: '/module?title=Mentor Module&category=Academics' },
        { title: 'Student Portal', icon: 'user-graduate', route: '/module?title=Student Portal&category=Academics' },
        { title: 'Academic Hierarchy', icon: 'sitemap', route: '/module?title=Academic Hierarchy&category=Academics' },
        { title: 'Coordinator Module', icon: 'user-tie', route: '/module?title=Coordinator Module&category=Academics' },
        { title: 'Teacher Module', icon: 'book-reader', route: '/module?title=Teacher Module&category=Academics' },
        { title: 'Courses', icon: 'book', route: '/module?title=Courses&category=Academics' },
        { title: 'Analytics', icon: 'chart-line', route: '/module?title=Analytics&category=Academics' },
      ],
    },
    {
      category: 'HRMS MODULE',
      color: '#E6FFFA',
      accent: '#319795',
      items: [
        { title: 'Workforce Hub', icon: 'building', route: '/module?title=Workforce Hub&category=HRMS' },
        { title: 'Attendance', icon: 'clock', route: '/module?title=Attendance&category=HRMS' },
        { title: 'Payroll', icon: 'money-check-alt', route: '/module?title=Payroll&category=HRMS' },
        { title: 'Leave Management', icon: 'calendar-alt', route: '/module?title=Leave Management&category=HRMS' },
        { title: 'Tasks & Performance', icon: 'tasks', route: '/module?title=Tasks & Performance&category=HRMS' },
      ],
    },
    {
      category: 'ADMINISTRATIVE',
      color: '#FAF5FF',
      accent: '#805AD5',
      items: [
        { title: 'Staff Directory', icon: 'address-book', route: '/module?title=Staff Directory&category=Administrative' },
        { title: 'Finance Manager', icon: 'wallet', route: '/module?title=Finance Manager&category=Administrative' },
        { title: 'Admin Panel', icon: 'cogs', route: '/module?title=Admin Panel&category=Administrative' },
      ],
    },
  ];

  // Filter items based on search query
  const filteredGroups = menuGroups.map(group => ({
    ...group,
    items: group.items.filter(item => item.title.toLowerCase().includes(search.toLowerCase()))
  })).filter(group => group.items.length > 0);

  return (
    <View style={styles.container}>
      {/* Search Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>ERP MASTER HUB</Text>
        <View style={styles.searchBar}>
          <FontAwesome5 name="search" size={16} color="#A0AEC0" />
          <TextInput
            style={styles.input}
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

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
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
                  style={styles.card}
                  onPress={() => router.push(item.route as any)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconContainer, { backgroundColor: group.color }]}>
                    <FontAwesome5 name={item.icon} size={22} color={group.accent} />
                  </View>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <FontAwesome5 name="chevron-right" size={10} color="#CBD5E0" style={styles.chevron} />
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
    backgroundColor: '#F7FAFC',
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#4A5568',
    letterSpacing: 2,
    marginBottom: 15,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7FAFC',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  input: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    color: '#1A202C',
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
    marginBottom: 30,
    backgroundColor: 'transparent',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: 'transparent',
  },
  badge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    backgroundColor: 'transparent',
  },
  card: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1A202C',
    lineHeight: 20,
    marginBottom: 8,
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
    fontSize: 15,
    color: '#A0AEC0',
    fontWeight: '600',
  },
});
