import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';

import api from './services/api';
import { registerForPushNotifications } from './services/push';

const STORAGE_KEYS = {
  token: 'token',
  userId: 'userId',
  displayName: 'displayName',
  email: 'email'
};

const SignupScreen = () => {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignup = useCallback(async () => {
    setError(null);

    if (!displayName.trim()) {
      setError('Display name is required.');
      return;
    }
    if (!email.trim()) {
      setError('Email is required.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setLoading(true);
      const response = await api.post('/api/auth/signup', {
        email: email.trim().toLowerCase(),
        password,
        name: displayName.trim()
      });
      const { token, user } = response.data;

      await AsyncStorage.multiSet([
        [STORAGE_KEYS.token, token],
        [STORAGE_KEYS.userId, user.id.toString()],
        [STORAGE_KEYS.email, user.email],
        [STORAGE_KEYS.displayName, user.name]
      ]);

      registerForPushNotifications().catch(() => null);
      router.replace('/group-setup');
    } catch (err: any) {
      const message = err?.response?.data?.error || err?.message || 'Sign up failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [displayName, email, password, confirmPassword, router]);

  return (
    <View style={styles.container}>
      <Pressable onPress={() => router.back()} style={styles.backButton}>
        <Text style={styles.backButtonText}>← Login</Text>
      </Pressable>

      <Text style={styles.title}>Create Account</Text>
      <Text style={styles.subtitle}>Join Wooverse</Text>

      <TextInput
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="Display name"
        placeholderTextColor="#4a6278"
        autoCapitalize="words"
        style={styles.input}
        editable={!loading}
      />

      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        placeholderTextColor="#4a6278"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, styles.inputSpaced]}
        editable={!loading}
      />

      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Password (min 8 characters)"
        placeholderTextColor="#4a6278"
        secureTextEntry
        style={[styles.input, styles.inputSpaced]}
        editable={!loading}
      />

      <TextInput
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        placeholder="Confirm password"
        placeholderTextColor="#4a6278"
        secureTextEntry
        style={[styles.input, styles.inputSpaced]}
        editable={!loading}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        onPress={handleSignup}
        style={({ pressed }) => [
          styles.button,
          pressed && styles.buttonPressed,
          loading && styles.buttonDisabled
        ]}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Create Account</Text>
        )}
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
  backButton: {
    position: 'absolute',
    top: 60,
    left: 24
  },
  backButtonText: {
    color: '#1e88e5',
    fontSize: 16,
    fontWeight: '600'
  },
  title: {
    fontSize: 36,
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
  inputSpaced: {
    marginTop: 12
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

export default SignupScreen;
