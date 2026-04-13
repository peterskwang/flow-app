import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import wsClient from '../services/ws';

interface Member {
  id: string;
  name: string;
  status?: string;
}

const PLACEHOLDER_MEMBERS: Member[] = [
  { id: '1', name: 'Alex' },
  { id: '2', name: 'Mika' },
  { id: '3', name: 'Sam' }
];

const IntercomScreen = () => {
  const [userName, setUserName] = useState('');
  const [speaking, setSpeaking] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);

  useEffect(() => {
    const loadProfile = async () => {
      const [[, displayName], [, storedGroupId]] = await AsyncStorage.multiGet(['displayName', 'groupId']);
      setUserName(displayName || 'You');
      setGroupId(storedGroupId);
    };

    loadProfile();
  }, []);

  useEffect(() => {
    const handleMessage = (message: any) => {
      if (!message?.type) return;
      if (message.type === 'ptt_start') {
        setSpeaking(message.payload?.name || 'Unknown');
      }
      if (message.type === 'ptt_end') {
        setSpeaking((current) => (current === (message.payload?.name || '') ? null : current));
      }
    };

    wsClient.on('message', handleMessage);
    return () => {
      wsClient.off('message', handleMessage);
    };
  }, []);

  const handlePressIn = useCallback(() => {
    setSpeaking(userName);
    wsClient.send({ type: 'ptt_start', payload: { name: userName, groupId } });
  }, [groupId, userName]);

  const handlePressOut = useCallback(() => {
    setSpeaking(null);
    wsClient.send({ type: 'ptt_end', payload: { name: userName, groupId } });
  }, [groupId, userName]);

  const members = useMemo(() => PLACEHOLDER_MEMBERS, []);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.heading}>Group Members</Text>
        <FlatList
          data={members}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.memberRow}>
              <Text style={styles.memberName}>{item.name}</Text>
              <Text style={[styles.memberStatus, speaking === item.name && styles.activeText]}>
                {speaking === item.name ? 'Talking' : 'Ready'}
              </Text>
            </View>
          )}
        />
      </View>

      <View style={styles.controls}>
        <Text style={styles.status}>{speaking ? `Speaking: ${speaking}` : 'Hold to talk'}</Text>
        <Pressable
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={({ pressed }) => [styles.pttButton, pressed && styles.pttButtonActive]}
        >
          <Text style={styles.pttLabel}>HOLD TO TALK</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#06121f'
  },
  card: {
    flex: 1,
    backgroundColor: '#10243b',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24
  },
  heading: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12
  },
  memberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1e3a5f'
  },
  memberName: {
    color: '#fff',
    fontSize: 16
  },
  memberStatus: {
    color: '#9fb4cc'
  },
  activeText: {
    color: '#64ffda'
  },
  controls: {
    alignItems: 'center'
  },
  status: {
    color: '#9fb4cc',
    marginBottom: 12
  },
  pttButton: {
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#1e88e5',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1e88e5',
    shadowOpacity: 0.6,
    shadowRadius: 20
  },
  pttButtonActive: {
    backgroundColor: '#1565c0'
  },
  pttLabel: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 18
  }
});

export default IntercomScreen;
