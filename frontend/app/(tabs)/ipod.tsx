import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';

import bleBridge, { bleSimulator } from '../services/ble';

interface SimUiState {
  advertising: boolean;
  paired: boolean;
  deviceName: string;
}

const IpodScreen = () => {
  const [state, setState] = useState<SimUiState>({ advertising: false, paired: false, deviceName: 'FLOW iPod' });
  const [lastDownlink, setLastDownlink] = useState<number | null>(null);
  const [lastUplink, setLastUplink] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);

  useEffect(() => {
    const unsubscribeState = bleSimulator.onStateChange((simState) => {
      setState({
        advertising: simState.advertising,
        paired: simState.paired,
        deviceName: simState.device?.name || 'FLOW iPod'
      });
    });
    const unsubscribeAudio = bleSimulator.onDownlinkAudio(async (chunk) => {
      await bleSimulator.playIncoming(chunk);
      setLastDownlink(Date.now());
    });
    return () => {
      unsubscribeState?.();
      unsubscribeAudio?.();
    };
  }, []);

  const toggleAdvertising = useCallback(() => {
    if (state.advertising) {
      bleSimulator.stopAdvertising();
    } else {
      bleSimulator.startAdvertising(state.deviceName);
    }
  }, [state.advertising, state.deviceName]);

  const disconnect = useCallback(() => {
    bleSimulator.dropPairing();
    const current = bleBridge.getStatus();
    if (current.pairedDevice?.simulated) {
      void bleBridge.disconnect();
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (recording) return;
    try {
      setPermissionError(null);
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        setPermissionError('Microphone permission denied');
        return;
      }
      const recordingObj = new Audio.Recording();
      await recordingObj.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recordingObj.startAsync();
      recordingRef.current = recordingObj;
      setRecording(true);
    } catch (error) {
      console.warn('[iPod] failed to start recording', error);
      setPermissionError('Unable to access microphone');
    }
  }, [recording]);

  const stopRecording = useCallback(async () => {
    const activeRecording = recordingRef.current;
    if (!activeRecording && !recording) return;
    try {
      if (activeRecording) {
        await activeRecording.stopAndUnloadAsync();
        const uri = activeRecording.getURI();
        if (uri) {
          const base64 = await FileSystem.readAsStringAsync(uri, {
            encoding: FileSystem.EncodingType.Base64
          });
          if (base64) {
            bleSimulator.sendAudioToCentral(base64);
            setLastUplink(Date.now());
          }
          await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => null);
        }
      }
    } catch (error) {
      console.warn('[iPod] failed to stop recording', error);
    } finally {
      recordingRef.current = null;
      setRecording(false);
    }
  }, [recording]);

  const statusText = state.paired
    ? 'Paired with FLOW app'
    : state.advertising
    ? 'Advertising FLOW service'
    : 'Idle — tap connect to advertise';

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>FLOW iPod Simulator</Text>
        <Text style={styles.subtitle}>{statusText}</Text>

        <Pressable
          onPress={toggleAdvertising}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
        >
          <Text style={styles.primaryButtonText}>
            {state.advertising ? 'Stop Advertising' : 'Start Advertising'}
          </Text>
        </Pressable>

        {state.paired ? (
          <Pressable
            onPress={disconnect}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
          >
            <Text style={styles.secondaryButtonText}>Disconnect</Text>
          </Pressable>
        ) : null}

        <View style={styles.row}>
          <Text style={styles.label}>Last audio received:</Text>
          <Text style={styles.value}>{lastDownlink ? new Date(lastDownlink).toLocaleTimeString() : '—'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Last audio sent:</Text>
          <Text style={styles.value}>{lastUplink ? new Date(lastUplink).toLocaleTimeString() : '—'}</Text>
        </View>
      </View>

      <View style={styles.pttCard}>
        <Text style={styles.pttTitle}>Push-to-Talk</Text>
        <Pressable
          onPressIn={startRecording}
          onPressOut={stopRecording}
          disabled={!state.paired}
          style={({ pressed }) => [
            styles.pttButton,
            (pressed || recording) && styles.pttButtonActive,
            !state.paired && styles.pttButtonDisabled
          ]}
        >
          {recording ? <ActivityIndicator color="#fff" /> : <Text style={styles.pttLabel}>HOLD TO TALK</Text>}
        </Pressable>
        {permissionError ? <Text style={styles.error}>{permissionError}</Text> : null}
        {!state.paired ? <Text style={styles.hint}>Pair from Settings to enable audio bridge.</Text> : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 16, backgroundColor: '#06121f' },
  card: { backgroundColor: '#10243b', borderRadius: 18, padding: 20, gap: 12 },
  title: { fontSize: 20, fontWeight: '800', color: '#fff' },
  subtitle: { color: '#9fb4cc', marginBottom: 4 },
  primaryButton: { backgroundColor: '#1e88e5', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  primaryButtonPressed: { opacity: 0.85 },
  primaryButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondaryButton: { borderWidth: 1, borderColor: '#ff8a80', paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  secondaryButtonPressed: { opacity: 0.85 },
  secondaryButtonText: { color: '#ff8a80', fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { color: '#9fb4cc' },
  value: { color: '#fff', fontWeight: '700' },
  pttCard: { flex: 1, backgroundColor: '#0d2034', borderRadius: 18, padding: 20, alignItems: 'center', gap: 16 },
  pttTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  pttButton: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#1e88e5',
    alignItems: 'center',
    justifyContent: 'center'
  },
  pttButtonActive: { backgroundColor: '#1565c0' },
  pttButtonDisabled: { opacity: 0.4 },
  pttLabel: { color: '#fff', fontSize: 16, fontWeight: '700' },
  error: { color: '#ff8a80' },
  hint: { color: '#7f8ea3', textAlign: 'center' }
});

export default IpodScreen;
