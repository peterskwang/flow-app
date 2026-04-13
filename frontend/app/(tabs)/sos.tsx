import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import api from '../services/api';
import wsClient from '../services/ws';

const SosScreen = () => {
  const [sending, setSending] = useState(false);
  const [active, setActive] = useState(false);

  const triggerSos = useCallback(() => {
    Alert.alert('Confirm SOS', 'Are you sure you want to send an SOS to your group?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Send SOS', style: 'destructive', onPress: sendSos }
    ]);
  }, []);

  const sendSos = useCallback(async () => {
    if (sending) return;
    try {
      setSending(true);
      await api.post('/api/sos');
      wsClient.send({ type: 'sos', payload: { timestamp: Date.now() } });
      setActive(true);
    } catch (error) {
      console.error('SOS failed', error);
      Alert.alert('SOS Failed', 'Could not reach the server.');
    } finally {
      setSending(false);
    }
  }, [sending]);

  return (
    <View style={styles.container}>
      <Pressable
        onLongPress={triggerSos}
        delayLongPress={1500}
        style={({ pressed }) => [styles.sosButton, pressed && styles.sosButtonPressed, active && styles.activeButton]}
      >
        <Text style={styles.sosLabel}>SOS</Text>
      </Pressable>
      <Text style={styles.helper}>Long press for 1.5 seconds to send SOS.</Text>
      {active ? <Text style={styles.activeText}>SOS Active</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#06121f',
    paddingHorizontal: 24
  },
  sosButton: {
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#d32f2f',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#d32f2f',
    shadowOpacity: 0.7,
    shadowRadius: 18
  },
  sosButtonPressed: {
    backgroundColor: '#b71c1c'
  },
  activeButton: {
    backgroundColor: '#7f1d1d'
  },
  sosLabel: {
    color: '#fff',
    fontSize: 48,
    fontWeight: '900'
  },
  helper: {
    marginTop: 24,
    color: '#f8bbd0'
  },
  activeText: {
    marginTop: 8,
    color: '#ff8a80',
    fontWeight: '700'
  }
});

export default SosScreen;
