/**
 * ipod.tsx — Wooverse Goggle Simulator + iPod (PTT)
 *
 * Mode selector (persisted in AsyncStorage):
 *   'select'  → Choose Goggle Mode or Main Mode (first open)
 *   'goggle'  → Second iPhone acts as FLOW goggle (BLE peripheral + WebRTC sender)
 *   'main'    → Primary iPhone receives goggle feed (BLE central + WebRTC receiver)
 *
 * Legacy FLOW iPod / PTT simulator is preserved and accessible from the
 * 'select' screen when no goggle mode is active.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
  Platform,
} from 'react-native';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
// expo-battery: graceful no-op when native module not available
const getBatteryLevelAsync = async (): Promise<number> => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Battery = require('expo-battery');
    return await Battery.getBatteryLevelAsync();
  } catch {
    return -1; // unavailable
  }
};
import * as FileSystem from 'expo-file-system/legacy';
import { RTCView } from 'react-native-webrtc';
import { v4 as uuidv4 } from 'uuid';

import bleBridge, { bleSimulator, goggleBridge, GOGGLE_SERVICE_UUID } from '../services/ble';
import {
  acceptGogglesStream,
  startGogglesStream,
  stopGogglesStream,
} from '../services/webrtc';
import wsClient from '../services/ws';

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------
const MODE_KEY = 'wooverse.goggle.mode';
const GOGGLE_ID_KEY = 'wooverse.goggle.id';

type GoggleMode = 'select' | 'goggle' | 'main';

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------
function showToast(msg: string) {
  if (Platform.OS === 'android') {
    ToastAndroid.show(msg, ToastAndroid.SHORT);
  } else {
    Alert.alert('', msg);
  }
}

// ---------------------------------------------------------------------------
// ModeSelectScreen
// ---------------------------------------------------------------------------
interface ModeSelectProps {
  onSelectMode: (mode: 'goggle' | 'main') => void;
  onOpenIpod: () => void;
}

const ModeSelectScreen = ({ onSelectMode, onOpenIpod }: ModeSelectProps) => (
  <ScrollView contentContainerStyle={styles.container}>
    <Text style={styles.bigTitle}>Goggle Simulator</Text>
    <Text style={styles.bigSubtitle}>Choose the role for this iPhone</Text>

    <Pressable
      style={({ pressed }) => [styles.modeCard, styles.modeCardGoggle, pressed && styles.modeCardPressed]}
      onPress={() => onSelectMode('goggle')}
    >
      <Text style={styles.modeCardEmoji}>📷</Text>
      <Text style={styles.modeCardTitle}>Goggle Mode</Text>
      <Text style={styles.modeCardDesc}>
        This iPhone acts as the FLOW goggle.{'\n'}Advertises BLE, streams camera + audio.
      </Text>
    </Pressable>

    <Pressable
      style={({ pressed }) => [styles.modeCard, styles.modeCardMain, pressed && styles.modeCardPressed]}
      onPress={() => onSelectMode('main')}
    >
      <Text style={styles.modeCardEmoji}>📺</Text>
      <Text style={styles.modeCardTitle}>Main Mode</Text>
      <Text style={styles.modeCardDesc}>
        This iPhone is the wrist unit.{'\n'}Scans for goggle, receives live feed.
      </Text>
    </Pressable>

    <Pressable style={({ pressed }) => [styles.linkButton, pressed && { opacity: 0.7 }]} onPress={onOpenIpod}>
      <Text style={styles.linkButtonText}>Open PTT / iPod Simulator →</Text>
    </Pressable>
  </ScrollView>
);

// ---------------------------------------------------------------------------
// GoggleModeScreen
// ---------------------------------------------------------------------------
const GoggleModeScreen = ({ onBack }: { onBack: () => void }) => {
  const [status, setStatus] = useState<string>('Initialising…');
  const [bleStatus, setBleStatus] = useState<'advertising' | 'connected' | 'idle'>('idle');
  const [streaming, setStreaming] = useState(false);
  const [localStream, setLocalStream] = useState<any>(null);
  const [battery, setBattery] = useState<number | null>(null);
  const pcRef = useRef<any>(null);
  const gogglesIdRef = useRef<string>('');
  const batteryIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsGroupIdRef = useRef<string>('');

  // Battery helper
  const fetchAndSendBattery = useCallback(async () => {
    try {
      const level = await getBatteryLevelAsync();
      const pct = Math.round(level * 100);
      setBattery(pct);
      goggleBridge.sendTelemetry({ evt: 'battery_level', pct });
    } catch (_) {
      // Battery API not available in simulator
    }
  }, []);

  // Teardown helper
  const teardown = useCallback(async (notifyWs = true) => {
    stopGogglesStream(pcRef.current);
    pcRef.current = null;
    setLocalStream(null);
    setStreaming(false);
    goggleBridge.stopPeripheral();
    goggleBridge.disableAutoReconnect();
    if (batteryIntervalRef.current) {
      clearInterval(batteryIntervalRef.current);
      batteryIntervalRef.current = null;
    }
    if (notifyWs && gogglesIdRef.current) {
      wsClient.send({
        type: 'goggle_disconnect',
        gogglesId: gogglesIdRef.current,
        groupId: wsGroupIdRef.current,
      });
    }
  }, []);

  useEffect(() => {
    let unmounted = false;
    let removeWsListener: (() => void) | null = null;
    let removeCmdListener: (() => void) | null = null;

    const init = async () => {
      // Retrieve or create a stable gogglesId for this session
      let gid = await AsyncStorage.getItem(GOGGLE_ID_KEY);
      if (!gid) {
        gid = uuidv4();
        await AsyncStorage.setItem(GOGGLE_ID_KEY, gid);
      }
      gogglesIdRef.current = gid;

      // Get groupId from session storage
      const groupId = (await AsyncStorage.getItem('groupId')) ?? '';
      wsGroupIdRef.current = groupId;

      if (unmounted) return;

      // Start BLE peripheral advertising
      await goggleBridge.startPeripheral(gid);
      setBleStatus('advertising');
      setStatus('Advertising BLE — waiting for Main Mode to connect…');

      // Register with WS signaling server
      wsClient.send({ type: 'goggle_register', gogglesId: gid, groupId });

      // Listen for BLE commands (start/stop/photo)
      removeCmdListener = goggleBridge.onCommand(async (cmdObj: any) => {
        const cmd = cmdObj.cmd as string;
        if (cmd === 'start_stream' && !streaming) {
          if (unmounted) return;
          setStatus('Starting camera stream…');
          setBleStatus('connected');
          try {
            const pc = await startGogglesStream(
              gid!,
              groupId,
              (stream) => {
                if (!unmounted) setLocalStream(stream);
              },
              () => {
                // WebRTC reconnect needed
                console.warn('[GoggleMode] WebRTC reconnect needed');
              }
            );
            pcRef.current = pc;
            setStreaming(true);
            setStatus('Streaming to Main');
            goggleBridge.sendTelemetry({ evt: 'stream_started' });
            // Battery telemetry
            await fetchAndSendBattery();
            batteryIntervalRef.current = setInterval(fetchAndSendBattery, 60000);
          } catch (err) {
            console.warn('[GoggleMode] startGogglesStream error:', err);
            setStatus('Stream error — try again');
          }
        } else if (cmd === 'stop_stream') {
          stopGogglesStream(pcRef.current);
          pcRef.current = null;
          setLocalStream(null);
          setStreaming(false);
          setStatus('Stream stopped');
          goggleBridge.sendTelemetry({ evt: 'stream_stopped' });
        } else if (cmd === 'capture_photo') {
          // Signal photo taken; actual frame capture requires native integration
          const ts = Math.floor(Date.now() / 1000);
          goggleBridge.sendTelemetry({ evt: 'photo_taken', ts });
          setStatus('📷 Photo captured');
        } else if (cmd === 'battery_level_req') {
          await fetchAndSendBattery();
        }
      });

      // WS goggle_command fallback (when BLE unavailable)
      removeWsListener = wsClient.onGoggleSignal((msg: any) => {
        if (msg.type === 'goggle_command' && msg.gogglesId === gid) {
          removeCmdListener?.(  );
          goggleBridge['commandListeners']?.forEach?.((l: any) => l({ cmd: msg.cmd }));
          removeCmdListener = goggleBridge.onCommand(async (cmdObj: any) => {
            // already set above; just re-emit via same path
          });
          // Direct dispatch
          (async () => {
            const cmd = msg.cmd as string;
            if (cmd === 'start_stream' && !pcRef.current) {
              setStatus('Starting camera stream (WS fallback)…');
              try {
                const pc = await startGogglesStream(
                  gid!,
                  groupId,
                  (stream) => { if (!unmounted) setLocalStream(stream); },
                  () => {}
                );
                pcRef.current = pc;
                setStreaming(true);
                setStatus('Streaming to Main');
                goggleBridge.sendTelemetry({ evt: 'stream_started' });
                await fetchAndSendBattery();
                batteryIntervalRef.current = setInterval(fetchAndSendBattery, 60000);
              } catch (err) {
                console.warn('[GoggleMode] WS fallback startGogglesStream error:', err);
              }
            } else if (cmd === 'stop_stream') {
              stopGogglesStream(pcRef.current);
              pcRef.current = null;
              setLocalStream(null);
              setStreaming(false);
              setStatus('Stream stopped');
              goggleBridge.sendTelemetry({ evt: 'stream_stopped' });
            } else if (cmd === 'capture_photo') {
              const ts = Math.floor(Date.now() / 1000);
              goggleBridge.sendTelemetry({ evt: 'photo_taken', ts });
            } else if (cmd === 'battery_level_req') {
              await fetchAndSendBattery();
            }
          })();
        }
      });

      // Battery on connect
      await fetchAndSendBattery();
    };

    init().catch((err) => {
      if (!unmounted) setStatus(`Init error: ${err.message}`);
    });

    return () => {
      unmounted = true;
      removeWsListener?.();
      removeCmdListener?.();
      teardown(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStopStream = useCallback(async () => {
    stopGogglesStream(pcRef.current);
    pcRef.current = null;
    setLocalStream(null);
    setStreaming(false);
    setStatus('Stream stopped');
    goggleBridge.sendTelemetry({ evt: 'stream_stopped' });
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.bigTitle}>WOOVERSE GOGGLE</Text>
        {streaming && <View style={styles.liveIndicator}><Text style={styles.liveText}>● LIVE</Text></View>}
        {battery !== null && (
          <Text style={styles.batteryText}>🔋 {battery}%</Text>
        )}
      </View>

      <View style={styles.videoBox}>
        {localStream ? (
          <RTCView
            streamURL={(localStream as any).toURL?.() ?? ''}
            style={styles.rtcView}
            objectFit="cover"
            mirror
          />
        ) : (
          <View style={styles.videoPlaceholder}>
            <Text style={styles.videoPlaceholderText}>Camera off</Text>
          </View>
        )}
      </View>

      <Text style={styles.statusText}>{status}</Text>
      <Text style={styles.bleStatusText}>
        BLE: {bleStatus === 'advertising' ? 'Advertising' : bleStatus === 'connected' ? '✅ Connected' : 'Idle'}
      </Text>

      {streaming && (
        <Pressable
          style={({ pressed }) => [styles.stopButton, pressed && { opacity: 0.8 }]}
          onPress={handleStopStream}
        >
          <Text style={styles.stopButtonText}>■ Stop Streaming</Text>
        </Pressable>
      )}

      <Pressable
        style={({ pressed }) => [styles.linkButton, pressed && { opacity: 0.7 }]}
        onPress={() => { teardown(true); onBack(); }}
      >
        <Text style={styles.linkButtonText}>← Back to Mode Select</Text>
      </Pressable>
    </ScrollView>
  );
};

// ---------------------------------------------------------------------------
// MainModeScreen
// ---------------------------------------------------------------------------
const MainModeScreen = ({ onBack }: { onBack: () => void }) => {
  const [status, setStatus] = useState<'idle' | 'scanning' | 'connecting' | 'connected' | 'streaming'>('idle');
  const [remoteStream, setRemoteStream] = useState<any>(null);
  const [discoveredGoggle, setDiscoveredGoggle] = useState<any>(null);
  const [gogglesId, setGogglesId] = useState<string>('');
  const [battery, setBattery] = useState<number | null>(null);
  const [rssi, setRssi] = useState<number | null>(null);
  const pcRef = useRef<any>(null);
  const wsGroupIdRef = useRef<string>('');
  const webrtcReconnectAttemptsRef = useRef(0);
  const MAX_WEBRTC_RECONNECTS = 3;

  const teardown = useCallback(async () => {
    stopGogglesStream(pcRef.current);
    pcRef.current = null;
    setRemoteStream(null);
    setStatus('idle');
    await goggleBridge.disconnect();
  }, []);

  const startWebRtcFlow = useCallback(async (gid: string, offer: { type: string; sdp: string }) => {
    const groupId = wsGroupIdRef.current;
    try {
      const pc = await acceptGogglesStream(
        gid,
        groupId,
        offer,
        (stream) => {
          setRemoteStream(stream);
          setStatus('streaming');
        },
        async () => {
          // WebRTC reconnect
          if (webrtcReconnectAttemptsRef.current >= MAX_WEBRTC_RECONNECTS) {
            setStatus('connected');
            showToast('WebRTC failed — tap Start Stream to retry');
            return;
          }
          webrtcReconnectAttemptsRef.current += 1;
          stopGogglesStream(pcRef.current);
          pcRef.current = null;
          setRemoteStream(null);
          setStatus('connected');
          // Re-trigger stream via BLE
          setTimeout(() => {
            goggleBridge.sendCommand('start_stream');
          }, 2000);
        }
      );
      pcRef.current = pc;
    } catch (err) {
      console.warn('[MainMode] acceptGogglesStream error:', err);
      setStatus('connected');
    }
  }, []);

  useEffect(() => {
    let unmounted = false;
    let removeWsListener: (() => void) | null = null;
    let removeTelemetryListener: (() => void) | null = null;

    const init = async () => {
      const groupId = (await AsyncStorage.getItem('groupId')) ?? '';
      wsGroupIdRef.current = groupId;

      if (unmounted) return;
      setStatus('scanning');

      // Listen for goggle telemetry (battery etc.)
      removeTelemetryListener = goggleBridge.onTelemetry((evt: any) => {
        if (evt.evt === 'battery_level') setBattery(evt.pct ?? null);
        if (evt.evt === 'photo_taken') showToast('📷 Photo captured by goggle!');
        if (evt.evt === 'stream_started') setStatus('streaming');
        if (evt.evt === 'stream_stopped') {
          setRemoteStream(null);
          setStatus('connected');
        }
      });

      // WS listener for goggle signaling
      removeWsListener = wsClient.onGoggleSignal((msg: any) => {
        if (msg.type === 'goggle_ready' && msg.gogglesId === gogglesId) {
          setStatus('connected');
        }
        if (msg.type === 'goggle_offer' && msg.gogglesId === gogglesId) {
          startWebRtcFlow(msg.gogglesId, { type: 'offer', sdp: msg.sdp });
        }
        if (msg.type === 'goggle_disconnect' && msg.gogglesId === gogglesId) {
          setStatus('idle');
          setRemoteStream(null);
          pcRef.current && stopGogglesStream(pcRef.current);
          pcRef.current = null;
        }
      });

      // Scan BLE for goggle
      const device = await goggleBridge.scanForGoggle(8000);
      if (unmounted) return;

      if (device) {
        setDiscoveredGoggle(device);
        setRssi(device.rssi ?? null);
        setStatus('idle'); // Wait for user to tap Connect
      } else {
        setStatus('idle');
        showToast('No WOOVERSE-GOGGLE found. Make sure Goggle Mode is active.');
      }
    };

    init().catch((err) => {
      if (!unmounted) {
        setStatus('idle');
        console.warn('[MainMode] init error:', err);
      }
    });

    return () => {
      unmounted = true;
      removeWsListener?.();
      removeTelemetryListener?.();
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = useCallback(async () => {
    if (!discoveredGoggle) return;
    const groupId = wsGroupIdRef.current;
    setStatus('connecting');
    try {
      await goggleBridge.connectToGoggle(discoveredGoggle);
      const gid = discoveredGoggle.id;
      setGogglesId(gid);
      goggleBridge.enableAutoReconnect(gid);
      // Register as central waiting for this goggle
      wsClient.send({ type: 'goggle_await', gogglesId: gid, groupId });
      setStatus('connected');
    } catch (err) {
      console.warn('[MainMode] connectToGoggle error:', err);
      setStatus('idle');
      showToast('Failed to connect to goggle. Try again.');
    }
  }, [discoveredGoggle]);

  const handleStartStream = useCallback(() => {
    if (!gogglesId) return;
    webrtcReconnectAttemptsRef.current = 0;
    goggleBridge.sendCommand('start_stream');
    // Also send via WS as fallback
    wsClient.send({ type: 'goggle_command', gogglesId, groupId: wsGroupIdRef.current, cmd: 'start_stream' });
  }, [gogglesId]);

  const handleStopStream = useCallback(() => {
    goggleBridge.sendCommand('stop_stream');
    wsClient.send({ type: 'goggle_command', gogglesId, groupId: wsGroupIdRef.current, cmd: 'stop_stream' });
    stopGogglesStream(pcRef.current);
    pcRef.current = null;
    setRemoteStream(null);
    setStatus('connected');
  }, [gogglesId]);

  const handleCapturePhoto = useCallback(() => {
    goggleBridge.sendCommand('capture_photo');
    wsClient.send({ type: 'goggle_command', gogglesId, groupId: wsGroupIdRef.current, cmd: 'capture_photo' });
  }, [gogglesId]);

  const handleRescan = useCallback(async () => {
    setStatus('scanning');
    setDiscoveredGoggle(null);
    const device = await goggleBridge.scanForGoggle(8000);
    if (device) {
      setDiscoveredGoggle(device);
      setRssi(device.rssi ?? null);
    } else {
      showToast('No WOOVERSE-GOGGLE found nearby.');
    }
    setStatus('idle');
  }, []);

  const signalBars = rssi !== null
    ? rssi > -60 ? '████' : rssi > -75 ? '███░' : rssi > -90 ? '██░░' : '█░░░'
    : '░░░░';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.bigTitle}>Goggle Feed</Text>
        {battery !== null && <Text style={styles.batteryText}>🔋 {battery}%</Text>}
      </View>

      <View style={styles.videoBox}>
        {remoteStream ? (
          <RTCView
            streamURL={(remoteStream as any).toURL?.() ?? ''}
            style={styles.rtcView}
            objectFit="cover"
          />
        ) : (
          <View style={styles.videoPlaceholder}>
            <Text style={styles.videoPlaceholderText}>
              {status === 'scanning' ? 'Scanning for goggle…' : 'No feed'}
            </Text>
            {status === 'scanning' && <ActivityIndicator color="#1e88e5" style={{ marginTop: 8 }} />}
          </View>
        )}
      </View>

      <View style={styles.infoRow}>
        <Text style={styles.bleStatusText}>
          BLE: {status === 'scanning' ? 'Scanning…' : status === 'connecting' ? 'Connecting…' : status === 'idle' ? (discoveredGoggle ? `Found: ${discoveredGoggle.name}` : 'No device') : '✅ Connected'}
        </Text>
        {rssi !== null && <Text style={styles.signalText}>Signal: {signalBars}</Text>}
      </View>

      {discoveredGoggle && (status === 'idle') && (
        <Pressable
          style={({ pressed }) => [styles.primaryButton, pressed && { opacity: 0.85 }]}
          onPress={handleConnect}
        >
          <Text style={styles.primaryButtonText}>Connect to {discoveredGoggle.name}</Text>
        </Pressable>
      )}

      {status === 'idle' && !discoveredGoggle && (
        <Pressable
          style={({ pressed }) => [styles.primaryButton, pressed && { opacity: 0.85 }]}
          onPress={handleRescan}
        >
          <Text style={styles.primaryButtonText}>🔍 Scan for Goggle</Text>
        </Pressable>
      )}

      {(status === 'connected' || status === 'streaming') && (
        <View style={styles.controlRow}>
          <Pressable
            style={({ pressed }) => [styles.actionButton, styles.actionButtonGreen, pressed && { opacity: 0.8 }]}
            onPress={handleStartStream}
            disabled={status === 'streaming'}
          >
            <Text style={styles.actionButtonText}>▶ Start Stream</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.actionButton, styles.actionButtonBlue, pressed && { opacity: 0.8 }]}
            onPress={handleCapturePhoto}
          >
            <Text style={styles.actionButtonText}>📷 Photo</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.actionButton, styles.actionButtonRed, pressed && { opacity: 0.8 }]}
            onPress={handleStopStream}
            disabled={status !== 'streaming'}
          >
            <Text style={styles.actionButtonText}>■ Stop</Text>
          </Pressable>
        </View>
      )}

      <Pressable
        style={({ pressed }) => [styles.linkButton, pressed && { opacity: 0.7 }]}
        onPress={() => { teardown(); onBack(); }}
      >
        <Text style={styles.linkButtonText}>← Back to Mode Select</Text>
      </Pressable>
    </ScrollView>
  );
};

// ---------------------------------------------------------------------------
// Legacy iPod / PTT screen (preserved for no-mode path)
// ---------------------------------------------------------------------------
interface SimUiState {
  advertising: boolean;
  paired: boolean;
  deviceName: string;
}

const IpodSimulatorScreen = ({ onBack }: { onBack: () => void }) => {
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
        deviceName: simState.device?.name || 'FLOW iPod',
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
    if (state.advertising) bleSimulator.stopAdvertising();
    else bleSimulator.startAdvertising(state.deviceName);
  }, [state.advertising, state.deviceName]);

  const disconnect = useCallback(() => {
    bleSimulator.dropPairing();
    const current = bleBridge.getStatus();
    if (current.pairedDevice?.simulated) void bleBridge.disconnect();
  }, []);

  const startRecording = useCallback(async () => {
    if (recording) return;
    try {
      setPermissionError(null);
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') { setPermissionError('Microphone permission denied'); return; }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true, playsInSilentModeIOS: true,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        shouldDuckAndroid: true, playThroughEarpieceAndroid: false, staysActiveInBackground: false,
      });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      recordingRef.current = rec;
      setRecording(true);
    } catch { setPermissionError('Unable to access microphone'); }
  }, [recording]);

  const stopRecording = useCallback(async () => {
    const activeRec = recordingRef.current;
    if (!activeRec && !recording) return;
    try {
      if (activeRec) {
        await activeRec.stopAndUnloadAsync();
        const uri = activeRec.getURI();
        if (uri) {
          const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
          if (base64) { bleSimulator.sendAudioToCentral(base64); setLastUplink(Date.now()); }
          await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => null);
        }
      }
    } catch { /* ignore */ }
    finally { recordingRef.current = null; setRecording(false); }
  }, [recording]);

  const statusText = state.paired
    ? 'Paired with FLOW app'
    : state.advertising
    ? 'Advertising FLOW service'
    : 'Idle — tap connect to advertise';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable style={({ pressed }) => [styles.linkButton, pressed && { opacity: 0.7 }]} onPress={onBack}>
        <Text style={styles.linkButtonText}>← Back to Mode Select</Text>
      </Pressable>

      <View style={styles.card}>
        <Text style={styles.title}>FLOW iPod Simulator</Text>
        <Text style={styles.subtitle}>{statusText}</Text>
        <Pressable onPress={toggleAdvertising} style={({ pressed }) => [styles.primaryButton, pressed && { opacity: 0.85 }]}>
          <Text style={styles.primaryButtonText}>{state.advertising ? 'Stop Advertising' : 'Start Advertising'}</Text>
        </Pressable>
        {state.paired && (
          <Pressable onPress={disconnect} style={({ pressed }) => [styles.secondaryButton, pressed && { opacity: 0.85 }]}>
            <Text style={styles.secondaryButtonText}>Disconnect</Text>
          </Pressable>
        )}
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
          onPressIn={startRecording} onPressOut={stopRecording}
          disabled={!state.paired}
          style={({ pressed }) => [styles.pttButton, (pressed || recording) && styles.pttButtonActive, !state.paired && styles.pttButtonDisabled]}
        >
          {recording ? <ActivityIndicator color="#fff" /> : <Text style={styles.pttLabel}>HOLD TO TALK</Text>}
        </Pressable>
        {permissionError ? <Text style={styles.error}>{permissionError}</Text> : null}
        {!state.paired ? <Text style={styles.hint}>Pair from Settings to enable audio bridge.</Text> : null}
      </View>
    </ScrollView>
  );
};

// ---------------------------------------------------------------------------
// Root component — manages mode state
// ---------------------------------------------------------------------------
const IpodScreen = () => {
  const [mode, setMode] = useState<GoggleMode | null>(null);
  const [showIpod, setShowIpod] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(MODE_KEY).then((saved) => {
      if (saved === 'goggle' || saved === 'main') setMode(saved);
      else setMode('select');
    }).catch(() => setMode('select'));
  }, []);

  const handleSelectMode = useCallback(async (m: 'goggle' | 'main') => {
    await AsyncStorage.setItem(MODE_KEY, m);
    setMode(m);
  }, []);

  const handleBack = useCallback(async () => {
    await AsyncStorage.removeItem(MODE_KEY);
    setMode('select');
    setShowIpod(false);
  }, []);

  if (mode === null) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color="#1e88e5" />
      </View>
    );
  }

  if (showIpod) return <IpodSimulatorScreen onBack={() => setShowIpod(false)} />;
  if (mode === 'select') {
    return (
      <ModeSelectScreen
        onSelectMode={handleSelectMode}
        onOpenIpod={() => setShowIpod(true)}
      />
    );
  }
  if (mode === 'goggle') return <GoggleModeScreen onBack={handleBack} />;
  if (mode === 'main') return <MainModeScreen onBack={handleBack} />;

  return null;
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 16, gap: 16, backgroundColor: '#06121f' },
  bigTitle: { fontSize: 24, fontWeight: '800', color: '#fff' },
  bigSubtitle: { color: '#9fb4cc', marginBottom: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  modeCard: { borderRadius: 18, padding: 24, gap: 8, alignItems: 'center' },
  modeCardGoggle: { backgroundColor: '#1a3a5c' },
  modeCardMain: { backgroundColor: '#1a3a2c' },
  modeCardPressed: { opacity: 0.8 },
  modeCardEmoji: { fontSize: 40 },
  modeCardTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  modeCardDesc: { color: '#9fb4cc', textAlign: 'center' },
  videoBox: { borderRadius: 14, overflow: 'hidden', height: 260, backgroundColor: '#0d1e2f' },
  rtcView: { flex: 1 },
  videoPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  videoPlaceholderText: { color: '#9fb4cc' },
  liveIndicator: { backgroundColor: '#c62828', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  liveText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  batteryText: { color: '#9fb4cc' },
  statusText: { color: '#9fb4cc', textAlign: 'center' },
  bleStatusText: { color: '#9fb4cc' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between' },
  signalText: { color: '#9fb4cc', fontFamily: 'monospace' },
  stopButton: { backgroundColor: '#c62828', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  stopButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  controlRow: { flexDirection: 'row', gap: 8 },
  actionButton: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  actionButtonGreen: { backgroundColor: '#2e7d32' },
  actionButtonBlue: { backgroundColor: '#1565c0' },
  actionButtonRed: { backgroundColor: '#c62828' },
  actionButtonText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  linkButton: { padding: 12, alignItems: 'center' },
  linkButtonText: { color: '#1e88e5', fontWeight: '600' },
  // Legacy iPod styles
  card: { backgroundColor: '#10243b', borderRadius: 18, padding: 20, gap: 12 },
  title: { fontSize: 20, fontWeight: '800', color: '#fff' },
  subtitle: { color: '#9fb4cc', marginBottom: 4 },
  primaryButton: { backgroundColor: '#1e88e5', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondaryButton: { borderWidth: 1, borderColor: '#ff8a80', paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  secondaryButtonText: { color: '#ff8a80', fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { color: '#9fb4cc' },
  value: { color: '#fff', fontWeight: '700' },
  pttCard: { flex: 1, backgroundColor: '#0d2034', borderRadius: 18, padding: 20, alignItems: 'center', gap: 16 },
  pttTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  pttButton: { width: 200, height: 200, borderRadius: 100, backgroundColor: '#1e88e5', alignItems: 'center', justifyContent: 'center' },
  pttButtonActive: { backgroundColor: '#1565c0' },
  pttButtonDisabled: { opacity: 0.4 },
  pttLabel: { color: '#fff', fontSize: 16, fontWeight: '700' },
  error: { color: '#ff8a80' },
  hint: { color: '#7f8ea3', textAlign: 'center' },
});

export default IpodScreen;
