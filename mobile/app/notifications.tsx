import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import client from '../src/api/client';

interface NotificationItem {
  id: number;
  title: string;
  message: string;
  notification_type: string;
  is_read: boolean;
  created_at: string;
  target_url?: string;
}

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  const fetchNotifications = async () => {
    try {
      const response = await client.get('/notifications/');
      if (response.data && Array.isArray(response.data.results)) {
        setNotifications(response.data.results);
      } else if (Array.isArray(response.data)) {
        setNotifications(response.data);
      }
    } catch (err) {
      console.log('Error fetching notifications:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchNotifications();
  };

  const handleMarkAsRead = async (id: number) => {
    try {
      await client.post(`/notifications/${id}/mark_read/`);
      setNotifications((prev) =>
        prev.map((item) => (item.id === id ? { ...item, is_read: true } : item))
      );
    } catch (err) {
      console.log('Error marking notification as read:', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await client.post('/notifications/mark_all_read/');
      setNotifications((prev) => prev.map((item) => ({ ...item, is_read: true })));
    } catch (err) {
      console.log('Error marking all as read:', err);
    }
  };

  const handleDeleteNotification = async (id: number) => {
    try {
      await client.delete(`/notifications/${id}/`);
      setNotifications((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      console.log('Error deleting notification:', err);
    }
  };

  const handleNotificationPress = async (item: NotificationItem) => {
    if (!item.is_read) {
      await handleMarkAsRead(item.id);
    }
    if (item.target_url) {
      router.push(item.target_url as any);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'SUCCESS':
        return { name: 'check-circle', color: '#10B981', bg: '#D1FAE5' };
      case 'WARNING':
        return { name: 'exclamation-triangle', color: '#F59E0B', bg: '#FEF3C7' };
      case 'ERROR':
        return { name: 'times-circle', color: '#EF4444', bg: '#FEE2E2' };
      case 'APPLICATION':
        return { name: 'file-signature', color: '#3B82F6', bg: '#DBEAFE' };
      case 'PAYMENT':
        return { name: 'credit-card', color: '#059669', bg: '#D1FAE5' };
      case 'BATCH':
        return { name: 'layer-group', color: '#8B5CF6', bg: '#EDE9FE' };
      case 'TASK':
        return { name: 'tasks', color: '#EC4899', bg: '#FCE7F3' };
      case 'LEAVE':
        return { name: 'calendar-times', color: '#6366F1', bg: '#E0E7FF' };
      default:
        return { name: 'info-circle', color: '#6B7280', bg: '#F3F4F6' };
    }
  };

  const formatTime = (dateStr: string) => {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHrs = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHrs / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHrs < 24) return `${diffHrs}h ago`;
    if (diffDays === 1) return 'Yesterday';
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const renderItem = ({ item }: { item: NotificationItem }) => {
    const config = getNotificationIcon(item.notification_type);

    return (
      <View style={[styles.card, !item.is_read && styles.unreadCard]}>
        <TouchableOpacity
          onPress={() => handleNotificationPress(item)}
          style={styles.cardMain}
          activeOpacity={0.7}
        >
          <View style={[styles.iconContainer, { backgroundColor: config.bg }]}>
            <FontAwesome5 name={config.name} size={18} color={config.color} />
          </View>
          <View style={styles.contentContainer}>
            <View style={styles.cardHeader}>
              <Text style={[styles.cardTitle, !item.is_read && styles.unreadText]}>
                {item.title}
              </Text>
              <Text style={styles.timeText}>{formatTime(item.created_at)}</Text>
            </View>
            <Text style={styles.cardMessage} numberOfLines={3}>
              {item.message}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => handleDeleteNotification(item.id)}
          style={styles.deleteButton}
          activeOpacity={0.6}
        >
          <FontAwesome5 name="trash-alt" size={14} color="#9CA3AF" />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <FontAwesome5 name="arrow-left" size={18} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>NOTIFICATIONS</Text>
        {notifications.some((n) => !n.is_read) ? (
          <TouchableOpacity onPress={handleMarkAllAsRead} style={styles.actionButton}>
            <Text style={styles.actionText}>Read All</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFD700" />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#FFD700"
              colors={['#FFD700']}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <FontAwesome5 name="bell-slash" size={50} color="#9CA3AF" style={styles.emptyIcon} />
              <Text style={styles.emptyTitle}>All caught up!</Text>
              <Text style={styles.emptySubtitle}>
                No new notifications. We'll alert you when something happens.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#111827', // Rich dark slate background
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#1F2937', // Slightly lighter dark gray
    borderBottomWidth: 1,
    borderColor: '#374151',
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
  actionButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#374151',
    borderRadius: 12,
  },
  actionText: {
    fontSize: 12,
    color: '#FFD700',
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111827',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#1F2937',
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#374151',
    overflow: 'hidden',
    alignItems: 'flex-start',
  },
  unreadCard: {
    borderColor: '#FBBF24', // Yellow highlight for unread
    backgroundColor: '#1E2530',
  },
  cardMain: {
    flex: 1,
    flexDirection: 'row',
    padding: 16,
    alignItems: 'flex-start',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    marginTop: 2,
  },
  contentContainer: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E5E7EB',
    flex: 1,
    marginRight: 8,
  },
  unreadText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  timeText: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  cardMessage: {
    fontSize: 12,
    color: '#9CA3AF',
    lineHeight: 18,
    fontWeight: '500',
  },
  deleteButton: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    alignSelf: 'stretch',
    justifyContent: 'center',
    alignItems: 'center',
    borderLeftWidth: 1,
    borderLeftColor: '#374151',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 100,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    marginBottom: 20,
    opacity: 0.8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: '500',
  },
});
