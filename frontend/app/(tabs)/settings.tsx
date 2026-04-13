import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';

import api from '../services/api';

const SettingsScreen = () => {
  const router = useRouter();

  const [displayName, setDisplayName] = useState('');
  const [editedName, setEditedName] = useState('');
  const [alwaysOn, setAlwaysOn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [[, name], [, alwaysOnVal]] = await AsyncStorage.multiGet(['displayName', 'alwaysOn']);
        setDisplayName(name || '');
        setEditedName(name || '');
        setAlwaysOn(alwaysOnVal === 'true');
      } catch (error) {
        console.warn('Failed to load settings', error);
      }
    };
    loadSettings();
  }, []);

  const handleSaveName = useCallback(async () => {
    const trimmed = editedName.trim();
    if (!trimmed) {
      Alert.alert('Display name cannot be empty');
      return;
    }
    try {
      setSaving(true);
      setSaveSuccess(false);
      const deviceId = await AsyncStorage.getItem('deviceId');
      await api.post('/api/auth/register', {
        display_name: trimmed,
        device_id: deviceId
      });
      await AsyncStorage.setItem('displayName', trimmed);
      setDisplayName(trimmed);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error: any) {
      Alert.alert('Failed to save', error?.response?.data?.message || error?.message || 'Server error');
    } finally {
      setSaving(false);
    }
  }, [editedName]);

  const handleToggleAlwaysOn = useCallback(async (value: boolean) => {
    setAlwaysOn(value);
    await AsyncStorage.setItem('alwaysOn', value ? 'true' : 'false');
  }, []);

  const handleLeaveGroup = useCallback(() => {
    Alert.alert(
      'Leave Group',
      'Are you sure you want to leave your current group?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              setLeaving(true);
              const groupId = await AsyncStorage.getItem('groupId');
              if (groupId) {
                try {
                  await api.post(`/api/groups/${groupId}/leave`);
                } catch (error) {
                  console.warn('Leave group API failed (proceeding anyway)', error);
                }
              }
              await AsyncStorage.multiRemove(['groupId', 'token', 'userId']);
              router.replace('/');
            } catch (error: any) {
              Alert.alert('Error', error?.message || 'Failed to leave group');
            } finally {
              setLeaving(false);
            }
          }
        }
      ]
    );
  }, [router]);

  const nameChanged = editedName.trim() !== displayName;
  const appVersion = Constants.expoConfig?.version || Constants.manifest?.version || '1.0.0';

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Display Name</Text>
        <TextInput
          value={editedName}
          onChangeText={setEditedName}
          style={styles.input}
          placeholder="Enter display name"
          placeholderTextColor="#4a6278"
          autoCapitalize="words"
          editable={!saving}
        />
        {nameChanged ? (
          <Pressable
            onPress={handleSaveName}
            disabled={saving}
            style={({ pressed }) => [styles.saveButton, pressed && styles.saveButtonPressed, saving && styles.saveButtonDisabled]}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Save</Text>
            )}
          </Pressable>
        ) : null}
        {saveSuccess ? <Text style={styles.successText}>Saved!</Text> : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferences</Text>
        <View style={styles.row}>
          <View>
            <Text style={styles.rowLabel}>Always-On Mode</Text>
            <Text style={styles.rowSub}>Keep location active in background</Text>
          </View>
          <Switch
            value={alwaysOn}
            onValueChange={handleToggleAlwaysOn}
            trackColor={{ false: '#26445f', true: '#1e88e5' }}
            thumbColor={alwaysOn ? '#64ffda' : '#9fb4cc'}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Group</Text>
        <Pressable
          onPress={handleLeaveGroup}
          disabled={leaving}
          style={({ pressed }) => [styles.leaveButton, pressed && styles.leaveButtonPressed, leaving && styles.saveButtonDisabled]}
        >
          {leaving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.leaveButtonText}>Leave Group</Text>
          )}
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <Text style={styles.versionText}>FLOW v{appVersion}</Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#06121f' },
  container: { padding: 16, gap: 16 },
  section: { backgroundColor: '#10243b', borderRadius: 16, padding: 16, gap: 12 },
  sectionTitle: { color: '#9fb4cc', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  input: {
    borderWidth: 1,
    borderColor: '#26445f',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#fff',
    backgroundColor: '#0d1f30'
  },
  saveButton: {
    backgroundColor: '#1e88e5',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center'
  },
  saveButtonPressed: { opacity: 0.85 },
  saveButtonDisabled: { opacity: 0.5 },
  saveButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  successText: { color: '#4caf50', textAlign: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { color: '#fff', fontSize: 16 },
  rowSub: { color: '#7f8ea3', fontSize: 13, marginTop: 2 },
  leaveButton: {
    backgroundColor: '#b71c1c',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center'
  },
  leaveButtonPressed: { opacity: 0.85 },
  leaveButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  versionText: { color: '#7f8ea3', fontSize: 14 }
});

export default SettingsScreen;
