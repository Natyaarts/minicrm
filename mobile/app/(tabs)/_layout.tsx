import React, { useState, useEffect } from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Link, Tabs } from 'expo-router';
import { Pressable, View } from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { usePushNotifications } from '../../src/hooks/usePushNotifications';
import NotificationBell from '../../components/NotificationBell';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../../src/api/client';

// You can explore the built-in icon families and icons on the web at https://icons.expo.fyi/
function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={28} style={{ marginBottom: -3 }} {...props} />;
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
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
      console.log('Failed to fetch user details in TabLayout:', err);
    }
  };

  const hasDialerAccess = user?.role === 'SALES' || user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  
  // Register for push notifications when tabs load
  usePushNotifications();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        // Disable the static render of the header on web
        // to prevent a hydration error in React Navigation v6.
        headerShown: useClientOnlyValue(false, true),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => <TabBarIcon name="home" color={color} />,
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {hasDialerAccess && (
                <Link href="/dialpad?leadId=0" asChild>
                  <Pressable style={{ marginRight: 15 }}>
                    {({ pressed }) => (
                      <FontAwesome
                        name="phone"
                        size={20}
                        color={Colors[colorScheme ?? 'light'].text}
                        style={{ opacity: pressed ? 0.5 : 1 }}
                      />
                    )}
                  </Pressable>
                </Link>
              )}
              <NotificationBell color={Colors[colorScheme ?? 'light'].text} />
              <Link href="/modal" asChild>
                <Pressable>
                  {({ pressed }) => (
                    <FontAwesome
                      name="user-circle"
                      size={22}
                      color={Colors[colorScheme ?? 'light'].text}
                      style={{ marginRight: 15, opacity: pressed ? 0.5 : 1 }}
                    />
                  )}
                </Pressable>
              </Link>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="two"
        options={{
          title: 'Sales',
          tabBarIcon: ({ color }) => <TabBarIcon name="users" color={color} />,
          href: hasDialerAccess ? '/two' : null,
        }}
      />
      <Tabs.Screen
        name="three"
        options={{
          title: 'Menu',
          tabBarIcon: ({ color }) => <TabBarIcon name="th" color={color} />,
        }}
      />
    </Tabs>
  );
}
