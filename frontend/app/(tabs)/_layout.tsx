import React, { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import wsClient from '../services/ws';
import '../services/backgroundLocation';

const STORAGE_KEYS = ['userId', 'groupId', 'displayName'] as const;

type StorageTuple = [string, string | null][];

const TabsLayout = () => {
  useEffect(() => {
    let mounted = true;

    const initConnection = async () => {
      try {
        const entries = (await AsyncStorage.multiGet(STORAGE_KEYS)) as StorageTuple;
        const values = Object.fromEntries(entries);
        if (values.userId && values.groupId && mounted) {
          wsClient.connect(values.userId, values.groupId, values.displayName || '');
        }
      } catch (error) {
        console.warn('Failed to initialize WebSocket', error);
      }
    };

    initConnection();

    return () => {
      mounted = false;
      wsClient.disconnect();
    };
  }, []);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#1e88e5',
        tabBarInactiveTintColor: '#718096',
        headerStyle: { backgroundColor: '#0c1d2e' },
        headerTintColor: '#fff',
        tabBarStyle: { backgroundColor: '#0c1d2e', borderTopColor: '#14283d' }
      }}
    >
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          tabBarIcon: ({ color, size }) => <Ionicons name="map" color={color} size={size} />
        }}
      />
      <Tabs.Screen
        name="intercom"
        options={{
          title: 'Intercom',
          tabBarIcon: ({ color, size }) => <Ionicons name="radio-outline" color={color} size={size} />
        }}
      />
      <Tabs.Screen
        name="sos"
        options={{
          title: 'SOS',
          tabBarIcon: ({ color, size }) => <Ionicons name="alert-circle" color={color} size={size} />
        }}
      />
      <Tabs.Screen
        name="ipod"
        options={{
          title: 'iPod',
          tabBarIcon: ({ color, size }) => <Ionicons name="headset-outline" color={color} size={size} />
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" color={color} size={size} />
        }}
      />
    </Tabs>
  );
};

export default TabsLayout;
