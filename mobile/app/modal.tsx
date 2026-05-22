import React, { useState, useEffect } from 'react';
import { StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Text, View } from '@/components/Themed';
import { FontAwesome5 } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logoutUser } from '../src/api/auth';

export default function ProfileScreen() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUser();
  }, []);

  const fetchUser = async () => {
    try {
      const userData = await AsyncStorage.getItem('userInfo');
      if (userData) {
        setUser(JSON.parse(userData));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      "Logout",
      "Are you sure you want to exit?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Logout", 
          style: "destructive",
          onPress: async () => {
            await logoutUser();
            router.replace('/login');
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3182CE" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Avatar Section */}
      <View style={styles.avatarContainer}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user?.username?.[0]?.toUpperCase() || 'U'}</Text>
        </View>
        <Text style={styles.name}>{user?.username || 'User'}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{user?.role || 'Staff Member'}</Text>
        </View>
      </View>

      {/* Info List */}
      <View style={styles.infoList}>
        <View style={styles.infoRow}>
          <FontAwesome5 name="id-card" size={16} color="#718096" style={styles.icon} />
          <Text style={styles.label}>Username</Text>
          <Text style={styles.value}>{user?.username}</Text>
        </View>
        <View style={styles.infoRow}>
          <FontAwesome5 name="envelope" size={16} color="#718096" style={styles.icon} />
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{user?.email || 'Not set'}</Text>
        </View>
      </View>

      {/* Logout Section */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <FontAwesome5 name="sign-out-alt" size={16} color="#FFF" />
        <Text style={styles.logoutText}>Log Out from ERP</Text>
      </TouchableOpacity>

      <Text style={styles.footer}>Natya ERP Mobile v1.0.0</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarContainer: {
    alignItems: 'center',
    marginVertical: 40,
    backgroundColor: 'transparent',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#F7FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#E2E8F0',
    marginBottom: 15,
  },
  avatarText: {
    fontSize: 40,
    fontWeight: '900',
    color: '#3182CE',
  },
  name: {
    fontSize: 24,
    fontWeight: '900',
    color: '#1A202C',
    marginBottom: 8,
  },
  roleBadge: {
    backgroundColor: '#EBF8FF',
    paddingHorizontal: 15,
    paddingVertical: 5,
    borderRadius: 12,
  },
  roleText: {
    color: '#3182CE',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
  infoList: {
    backgroundColor: '#F7FAFC',
    borderRadius: 25,
    padding: 20,
    marginBottom: 40,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    backgroundColor: 'transparent',
  },
  icon: {
    width: 25,
  },
  label: {
    flex: 1,
    fontSize: 14,
    color: '#718096',
    fontWeight: '700',
    marginLeft: 10,
  },
  value: {
    fontSize: 14,
    color: '#1A202C',
    fontWeight: '900',
  },
  logoutButton: {
    backgroundColor: '#F56565',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 20,
    shadowColor: '#F56565',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  logoutText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '900',
    marginLeft: 10,
  },
  footer: {
    marginTop: 'auto',
    textAlign: 'center',
    color: '#CBD5E0',
    fontSize: 10,
    fontWeight: '600',
    paddingBottom: 20,
  },
});
