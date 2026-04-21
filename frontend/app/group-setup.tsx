import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';

import api from './services/api';

const STORAGE_KEY_GROUP = 'groupId';

type Mode = 'choice' | 'create' | 'join' | 'created';

const GroupSetupScreen = () => {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('choice');
  const [groupName, setGroupName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [createdGroup, setCreatedGroup] = useState<{ name: string; invite_code: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateGroup = useCallback(async () => {
    if (!groupName.trim()) {
      setError('Group name is required.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const response = await api.post('/api/groups', { name: groupName.trim() });
      const group = response.data;
      await AsyncStorage.setItem(STORAGE_KEY_GROUP, group.id);
      setCreatedGroup({ name: group.name, invite_code: group.invite_code });
      setMode('created');
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to create group');
    } finally {
      setLoading(false);
    }
  }, [groupName]);

  const handleJoinGroup = useCallback(async () => {
    const code = inviteCode.trim().toUpperCase();
    if (code.length !== 6) {
      setError('Enter the 6-character invite code.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const response = await api.post('/api/groups/join', { invite_code: code });
      const group = response.data;
      await AsyncStorage.setItem(STORAGE_KEY_GROUP, group.id);
      router.replace('/(tabs)/map');
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to join group');
    } finally {
      setLoading(false);
    }
  }, [inviteCode, router]);

  const handleCopyCode = useCallback(async () => {
    if (!createdGroup) return;
    try {
      await Clipboard.setStringAsync(createdGroup.invite_code);
      Alert.alert('Copied!', `Invite code ${createdGroup.invite_code} copied to clipboard.`);
    } catch (err) {
      console.warn('Copy failed', err);
    }
  }, [createdGroup]);

  const handleShareCode = useCallback(async () => {
    if (!createdGroup) return;
    try {
      await Share.share({
        message: `Join my FLOW ski group "${createdGroup.name}" with code: ${createdGroup.invite_code}`,
      });
    } catch (err) {
      console.warn('Share cancelled', err);
    }
  }, [createdGroup]);

  if (mode === 'choice') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Your Squad</Text>
        <Text style={styles.subtitle}>Create a new group or join one with an invite code.</Text>
        <Pressable
          style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
          onPress={() => {
            setError(null);
            setMode('create');
          }}
        >
          <Text style={styles.buttonText}>Create Group</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
          onPress={() => {
            setError(null);
            setMode('join');
          }}
        >
          <Text style={styles.secondaryButtonText}>Join Group</Text>
        </Pressable>
      </View>
    );
  }

  if (mode === 'create') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Create Group</Text>
        <Text style={styles.subtitle}>Give your squad a name.</Text>
        <TextInput
          value={groupName}
          onChangeText={setGroupName}
          placeholder="Group name (e.g. Powder Crew)"
          placeholderTextColor="#4a6278"
          style={styles.input}
          autoCapitalize="words"
          editable={!loading}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.buttonPressed,
            loading && styles.buttonDisabled,
          ]}
          onPress={handleCreateGroup}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create</Text>}
        </Pressable>
        <Pressable
          onPress={() => {
            setMode('choice');
            setError(null);
          }}
        >
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
      </View>
    );
  }

  if (mode === 'join') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Join Group</Text>
        <Text style={styles.subtitle}>Enter the 6-character invite code.</Text>
        <TextInput
          value={inviteCode}
          onChangeText={(v) => setInviteCode(v.toUpperCase())}
          placeholder="ABC123"
          placeholderTextColor="#4a6278"
          style={[styles.input, styles.codeInput]}
          autoCapitalize="characters"
          maxLength={6}
          editable={!loading}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.buttonPressed,
            loading && styles.buttonDisabled,
          ]}
          onPress={handleJoinGroup}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Join</Text>}
        </Pressable>
        <Pressable
          onPress={() => {
            setMode('choice');
            setError(null);
          }}
        >
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Group Created!</Text>
      <Text style={styles.subtitle}>{createdGroup?.name}</Text>
      <View style={styles.codeCard}>
        <Text style={styles.codeLabel}>Invite Code</Text>
        <Text style={styles.codeDisplay}>{createdGroup?.invite_code}</Text>
        <Text style={styles.codeHint}>Share this code with your ski squad.</Text>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
        onPress={handleCopyCode}
      >
        <Text style={styles.buttonText}>Copy Code</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
        onPress={handleShareCode}
      >
        <Text style={styles.secondaryButtonText}>Share via...</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.primaryButton, { marginTop: 8 }, pressed && styles.buttonPressed]}
        onPress={() => router.replace('/(tabs)/map')}
      >
        <Text style={styles.buttonText}>Go to Map →</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#0c1d2e',
    gap: 16,
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#9fb4cc',
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#26445f',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#fff',
    backgroundColor: '#13273c',
  },
  codeInput: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 8,
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: '#1e88e5',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#1e88e5',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  secondaryButtonText: {
    color: '#1e88e5',
    fontSize: 18,
    fontWeight: '700',
  },
  error: {
    color: '#ff8a80',
    textAlign: 'center',
  },
  backText: {
    color: '#9fb4cc',
    textAlign: 'center',
    marginTop: 8,
  },
  codeCard: {
    backgroundColor: '#0d2034',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#64ffda',
  },
  codeLabel: {
    color: '#64ffda',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  codeDisplay: {
    fontSize: 48,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 10,
  },
  codeHint: {
    color: '#9fb4cc',
    fontSize: 14,
    textAlign: 'center',
  },
});

export default GroupSetupScreen;
