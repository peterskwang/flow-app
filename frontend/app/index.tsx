import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

import api from './services/api';

const STORAGE_KEYS = {
  token: 'token',
  userId: 'userId',
  groupId: 'groupId',
  displayName: 'displayName',
  deviceId: 'deviceId'
};

const RegisterScreen = () => {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const bootstrap = async () => {
      const token = await AsyncStorage.getItem(STORAGE_KEYS.token);
      if (token) {
        router.replace('/(tabs)/map');
      }
    };

    bootstrap();
  }, [router]);

  const handleJoin = useCallback(async () => {
    setError(null);
    if (!displayName.trim()) {
      setError('Display name is required.');
      return;
    }

    try {
      setLoading(true);
      const deviceId = uuidv4();
      const payload = {
        display_name: displayName.trim(),
        device_id: deviceId
      };

      const response = await api.post('/api/auth/register', payload);
      const data = response.data ?? {};

      const token: string | undefined = data.token || data.jwt;
      const resolvedUserId: string | undefined =
        data.userId || data.user_id || data.user?.id?.toString();
      const resolvedGroupId: string | undefined =
        data.groupId || data.group_id || data.group?.id?.toString();

      if (!token || !resolvedUserId) {
        throw new Error('Invalid server response.');
      }

      await AsyncStorage.multiSet([
        [STORAGE_KEYS.token, token],
        [STORAGE_KEYS.userId, resolvedUserId],
        [STORAGE_KEYS.deviceId, deviceId],
        [STORAGE_KEYS.displayName, displayName.trim()]
      ]);

      if (resolvedGroupId) {
        await AsyncStorage.setItem(STORAGE_KEYS.groupId, resolvedGroupId);
      }

      router.replace('/(tabs)/map');
    } catch (joinError: any) {
      console.error('Registration failed', joinError);
      const message = joinError?.response?.data?.message || joinError?.message || 'Unable to register';
      setError(message);
      Alert.alert('Registration failed', message);
    } finally {
      setLoading(false);
    }
  }, [displayName, router]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>FLOW</Text>
      <Text style={styles.subtitle}>Register to join your ski group</Text>

      <TextInput
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="Display name"
        autoCapitalize="words"
        style={styles.input}
        editable={!loading}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        onPress={handleJoin}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, loading && styles.buttonDisabled]}
        disabled={loading}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Join</Text>}
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#0c1d2e'
  },
  title: {
    fontSize: 48,
    fontWeight: '800',
    textAlign: 'center',
    color: '#fff',
    marginBottom: 4
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    color: '#9fb4cc',
    marginBottom: 32
  },
  input: {
    borderWidth: 1,
    borderColor: '#26445f',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#fff',
    backgroundColor: '#13273c'
  },
  button: {
    marginTop: 24,
    backgroundColor: '#1e88e5',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center'
  },
  buttonPressed: {
    opacity: 0.85
  },
  buttonDisabled: {
    opacity: 0.6
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700'
  },
  error: {
    marginTop: 12,
    color: '#ff8a80',
    textAlign: 'center'
  }
});

export default RegisterScreen;
