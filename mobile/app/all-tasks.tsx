import React, { useState, useEffect } from 'react';
import {
  StyleSheet, FlatList, ActivityIndicator,
  TouchableOpacity, Alert, Text, View, useColorScheme, StatusBar
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import client from '../src/api/client';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function AllTasksScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const res = await client.get('/crm/tasks/', {
        params: {
          status: 'PENDING',
          assigned_to_me: 'true',
          ordering: 'due_date',
        }
      });
      const data = res.data?.results || res.data || [];
      setTasks(data);
    } catch (e) {
      console.log('Failed to fetch all tasks:', e);
      Alert.alert('Error', 'Failed to load follow-ups.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const completeTask = async (taskId: string) => {
    try {
      await client.patch(`/crm/tasks/${taskId}/`, { status: 'COMPLETED' });
      // Remove task locally to animate out
      setTasks(prev => prev.filter(t => t.id !== taskId));
    } catch (err) {
      console.error('Failed to complete task:', err);
      Alert.alert('Error', 'Failed to mark task as completed.');
    }
  };

  const renderTaskItem = ({ item }: { item: any }) => (
    <TouchableOpacity 
      style={[styles.taskCard, isDark && styles.darkCard]}
      onPress={() => router.push(`/lead-details?leadId=${item.student}` as any)}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.taskTitle, isDark && styles.darkText]} numberOfLines={2}>
          {item.title}
        </Text>
        {item.description ? (
          <Text style={styles.taskDesc} numberOfLines={2}>
            {item.description}
          </Text>
        ) : null}
        <View style={styles.taskMetaRow}>
          <View style={styles.dateBadge}>
            <FontAwesome5 name="clock" size={10} color="#F59E0B" />
            <Text style={styles.dateText}>
              {item.due_date ? new Date(item.due_date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'No due date'}
            </Text>
          </View>
          {item.student_name ? (
            <View style={styles.leadBadge}>
              <FontAwesome5 name="user" size={10} color="#3B82F6" />
              <Text style={styles.leadText}>{item.student_name}</Text>
            </View>
          ) : null}
        </View>
      </View>
      
      <TouchableOpacity 
        style={styles.checkButton} 
        onPress={() => completeTask(item.id)}
      >
        <FontAwesome5 name="check-circle" size={24} color="#10B981" />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, isDark && styles.darkBg, { paddingTop: insets.top }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <FontAwesome5 name="arrow-left" size={16} color={isDark ? '#F3F4F6' : '#1F2937'} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, isDark && styles.darkText]}>All Follow-ups</Text>
        <View style={{ width: 32 }} />
      </View>

      {loading && tasks.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FFB800" />
        </View>
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderTaskItem}
          contentContainerStyle={styles.listContent}
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            fetchTasks();
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <FontAwesome5 name="check-double" size={48} color="#10B981" style={{ marginBottom: 16 }} />
              <Text style={[styles.emptyText, isDark && styles.darkText]}>All caught up!</Text>
              <Text style={styles.emptySubText}>No pending follow-ups found.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  darkBg: {
    backgroundColor: '#111827',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#1F2937',
    letterSpacing: 0.5,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 3,
    elevation: 1,
  },
  darkCard: {
    backgroundColor: '#1F2937',
    borderColor: '#374151',
  },
  taskTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 4,
  },
  darkText: {
    color: '#F3F4F6',
  },
  taskDesc: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 8,
  },
  taskMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  dateText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#D97706',
    marginLeft: 4,
  },
  leadBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  leadText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2563EB',
    marginLeft: 4,
  },
  checkButton: {
    padding: 8,
    marginLeft: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 4,
  },
  emptySubText: {
    fontSize: 12,
    color: '#6B7280',
  },
});
