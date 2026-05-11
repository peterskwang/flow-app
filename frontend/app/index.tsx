import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';

const STORAGE_KEYS = {
  token: 'token',
  groupId: 'groupId'
};

function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const payload = JSON.parse(atob(parts[1]));
    if (!payload.exp) return false;
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

const BootstrapScreen = () => {
  const router = useRouter();

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const token = await AsyncStorage.getItem(STORAGE_KEYS.token);
        if (!token || isTokenExpired(token)) {
          if (token) {
            await AsyncStorage.removeItem(STORAGE_KEYS.token);
          }
          router.replace('/login');
          return;
        }
        const groupId = await AsyncStorage.getItem(STORAGE_KEYS.groupId);
        if (groupId) {
          router.replace('/(tabs)/map');
        } else {
          router.replace('/group-setup');
        }
      } catch {
        router.replace('/login');
      }
    };

    bootstrap();
  }, [router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#1e88e5" />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0c1d2e'
  }
});

export default BootstrapScreen;
