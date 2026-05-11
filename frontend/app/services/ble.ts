import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { BleManager, Device } from 'react-native-ble-plx';
import { v4 as uuidv4 } from 'uuid';

import wsClient from './ws';

const WOOVERSE_SERVICE_UUID = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E';
const WOOVERSE_RX_CHAR_UUID = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E';
const WOOVERSE_TX_CHAR_UUID = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E';
const STORAGE_KEY = 'wooverseBleDevice';
const LEGACY_STORAGE_KEY = 'flowBlePairedDevice';

// ---------------------------------------------------------------------------
// Goggle Simulator BLE Service UUIDs (separate from iPod/NUS service)
// ---------------------------------------------------------------------------
export const GOGGLE_SERVICE_UUID = 'GOGGLE01-B5A3-F393-E0A9-E50E24DCCA9E';
export const GOGGLE_RX_CHAR_UUID = 'GOGGLE02-B5A3-F393-E0A9-E50E24DCCA9E'; // Central → Goggle commands
export const GOGGLE_TX_CHAR_UUID = 'GOGGLE03-B5A3-F393-E0A9-E50E24DCCA9E'; // Goggle → Central telemetry

export type GoggleCommand = 'start_stream' | 'stop_stream' | 'capture_photo' | 'battery_level_req';
export type GoggleTelemetryEvent = Record<string, unknown>;

export interface WooverseDevice {
  id: string;
  name: string;
  rssi?: number | null;
  simulated?: boolean;
}

interface WooverseStatus {
  pairedDevice: WooverseDevice | null;
  connected: boolean;
}

interface SimulationState {
  device: WooverseDevice | null;
  advertising: boolean;
  paired: boolean;
}

type StateListener = (status: WooverseStatus) => void;
type SimulationListener = (state: SimulationState) => void;
type AudioListener = (chunk: string) => void;

type NullableBleManager = BleManager | null;

let simulationState: SimulationState = { device: null, advertising: false, paired: false };
const simulationListeners = new Set<SimulationListener>();
const simulationDownlinkListeners = new Set<AudioListener>();
const simulationUplinkListeners = new Set<AudioListener>();

function emitSimulationState() {
  const snapshot = { ...simulationState };
  simulationListeners.forEach((listener) => listener(snapshot));
}

function updateSimulationState(patch: Partial<SimulationState>) {
  simulationState = { ...simulationState, ...patch };
  emitSimulationState();
}

function emitToSimulatedPeripheral(chunk: string) {
  simulationDownlinkListeners.forEach((listener) => listener(chunk));
}

function emitFromSimulatedPeripheral(chunk: string) {
  simulationUplinkListeners.forEach((listener) => listener(chunk));
}

async function playBase64Chunk(base64: string) {
  if (!base64) return;
  const cacheDir = FileSystem.cacheDirectory ?? '';
  const file = `${cacheDir}wooverse-ble-${Date.now()}-${Math.random().toString(36).slice(2)}.aac`;
  try {
    await FileSystem.writeAsStringAsync(file, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const { sound } = await Audio.Sound.createAsync({ uri: file }, { shouldPlay: true });
    await new Promise<void>((resolve) => {
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;
        if (status.didJustFinish || !status.isPlaying) {
          sound.setOnPlaybackStatusUpdate(null);
          resolve();
        }
      });
    });
    await sound.unloadAsync();
  } catch (error) {
    console.warn('[BLE] failed to play audio chunk', error);
  } finally {
    await FileSystem.deleteAsync(file, { idempotent: true }).catch(() => null);
  }
}

class WooverseBleBridge {
  private manager: NullableBleManager;
  private pairedDevice: WooverseDevice | null = null;
  private connectedDevice: Device | null = null;
  private txSubscription: { remove: () => void } | null = null;
  private listeners = new Set<StateListener>();

  constructor() {
    try {
      this.manager = Platform.OS === 'web' ? null : new BleManager();
    } catch {
      console.warn('[BLE] Native module unavailable — using simulation mode');
      this.manager = null;
    }
    this.bootstrap();
    simulationUplinkListeners.add((chunk) => this.handleIncomingChunk(chunk));
    simulationListeners.add((state) => {
      if (!state.paired && this.pairedDevice?.simulated) {
        this.pairedDevice = null;
        this.emitState();
      }
    });
  }

  private async bootstrap() {
    try {
      let raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) {
        // Migrate from legacy key
        const legacyRaw = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacyRaw) {
          await AsyncStorage.setItem(STORAGE_KEY, legacyRaw);
          await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
          raw = legacyRaw;
        }
      }
      if (raw) {
        this.pairedDevice = JSON.parse(raw);
      }
    } catch (error) {
      console.warn('[BLE] failed to load paired device', error);
    } finally {
      this.emitState();
    }
  }

  subscribe(listener: StateListener) {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emitState() {
    const snapshot = this.getStatus();
    this.listeners.forEach((listener) => listener(snapshot));
  }

  getStatus(): WooverseStatus {
    const connected = Boolean(
      (this.pairedDevice && this.connectedDevice) ||
        (this.pairedDevice?.simulated && simulationState.paired)
    );
    return { pairedDevice: this.pairedDevice, connected };
  }

  async scanForDevices(timeoutMs = 4000): Promise<WooverseDevice[]> {
    if (!this.manager) {
      return simulationState.advertising && simulationState.device
        ? [{ ...simulationState.device }]
        : [];
    }
    const found: Record<string, WooverseDevice> = {};
    return new Promise((resolve) => {
      try {
        this.manager!.startDeviceScan([WOOVERSE_SERVICE_UUID], null, (error, device) => {
          if (error) {
            console.warn('[BLE] scan error', error);
            return;
          }
          if (device) {
            found[device.id] = {
              id: device.id,
              name: device.name || 'Wooverse Device',
              rssi: device.rssi ?? null,
            };
          }
        });
      } catch (error) {
        console.warn('[BLE] unable to start scan', error);
      }
      setTimeout(() => {
        this.manager!.stopDeviceScan();
        const devices = Object.values(found);
        if (simulationState.advertising && simulationState.device) {
          devices.push({ ...simulationState.device, simulated: true });
        }
        resolve(devices);
      }, timeoutMs);
    });
  }

  async connectToDevice(device: WooverseDevice) {
    if (device.simulated) {
      this.pairedDevice = device;
      updateSimulationState({ paired: true, advertising: false, device });
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(device));
      this.emitState();
      return;
    }
    if (!this.manager) throw new Error('BLE not supported on this platform');
    try {
      const connected = await this.manager.connectToDevice(device.id, { autoConnect: true });
      await connected.discoverAllServicesAndCharacteristics();
      this.connectedDevice = connected;
      this.pairedDevice = device;
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(device));
      this.monitorNotifications();
      this.emitState();
    } catch (error) {
      console.error('[BLE] connection failed', error);
      throw error;
    }
  }

  private monitorNotifications() {
    if (!this.connectedDevice || !this.manager) return;
    this.txSubscription?.remove?.();
    this.txSubscription = this.connectedDevice.monitorCharacteristicForService(
      WOOVERSE_SERVICE_UUID,
      WOOVERSE_TX_CHAR_UUID,
      (error, characteristic) => {
        if (error) {
          console.warn('[BLE] monitor error', error);
          return;
        }
        const chunk = characteristic?.value;
        if (chunk) {
          this.handleIncomingChunk(chunk);
        }
      }
    );
  }

  mirrorPttChunk(base64: string) {
    if (!base64) return;
    if (this.pairedDevice?.simulated && simulationState.paired) {
      emitToSimulatedPeripheral(base64);
      return;
    }
    if (!this.connectedDevice || !this.manager) return;
    this.manager
      .writeCharacteristicWithoutResponseForDevice(
        this.connectedDevice.id,
        WOOVERSE_SERVICE_UUID,
        WOOVERSE_RX_CHAR_UUID,
        base64
      )
      .catch((error) => console.warn('[BLE] write failed', error));
  }

  private handleIncomingChunk(base64: string) {
    if (!base64) return;
    if (wsClient?.isConnected?.()) {
      wsClient.send({ type: 'audio_chunk', data: base64 });
    }
  }

  async disconnect() {
    if (this.connectedDevice && this.manager) {
      try {
        await this.manager.cancelDeviceConnection(this.connectedDevice.id);
      } catch (error) {
        console.warn('[BLE] disconnect error', error);
      }
    }
    this.connectedDevice = null;
    this.txSubscription?.remove?.();
    this.txSubscription = null;
    if (this.pairedDevice?.simulated) {
      updateSimulationState({ paired: false, advertising: true });
    }
    this.pairedDevice = null;
    await AsyncStorage.removeItem(STORAGE_KEY);
    this.emitState();
  }
}

class WooverseSimulator {
  onStateChange(listener: SimulationListener) {
    simulationListeners.add(listener);
    listener({ ...simulationState });
    return () => simulationListeners.delete(listener);
  }

  onDownlinkAudio(listener: AudioListener) {
    simulationDownlinkListeners.add(listener);
    return () => simulationDownlinkListeners.delete(listener);
  }

  startAdvertising(name = 'Wooverse iPod') {
    const device: WooverseDevice = {
      id: simulationState.device?.id || `sim-${uuidv4()}`,
      name,
      simulated: true,
    };
    updateSimulationState({ device, advertising: true, paired: false });
  }

  stopAdvertising() {
    updateSimulationState({ advertising: false, paired: false, device: null });
  }

  notifyPaired() {
    if (!simulationState.device) return;
    updateSimulationState({ paired: true, advertising: false });
  }

  dropPairing() {
    if (!simulationState.device) return;
    updateSimulationState({ paired: false, advertising: true });
  }

  async playIncoming(chunk: string) {
    await playBase64Chunk(chunk);
  }

  sendAudioToCentral(base64: string) {
    emitFromSimulatedPeripheral(base64);
  }
}

const bleBridge = new WooverseBleBridge();
const bleSimulator = new WooverseSimulator();

// ---------------------------------------------------------------------------
// WooverseGoggleBridge
// ---------------------------------------------------------------------------
// Handles BLE peripheral advertising (Goggle Mode via react-native-ble-advertiser)
// and BLE central scanning/connecting (Main Mode via react-native-ble-plx).
// Real cross-device BLE is only available on physical iOS devices.
// Simulation fallback is provided for same-device development.
// ---------------------------------------------------------------------------

type CommandListener = (cmd: GoggleTelemetryEvent) => void;
type TelemetryListener = (evt: GoggleTelemetryEvent) => void;

const GOGGLE_RECONNECT_BASE_DELAY = 1000;
const GOGGLE_RECONNECT_MAX_DELAY = 30000;
const GOGGLE_MAX_RECONNECT_ATTEMPTS = 5;

class WooverseGoggleBridge {
  private commandListeners = new Set<CommandListener>();
  private telemetryListeners = new Set<TelemetryListener>();
  private connectedGoggle: WooverseDevice | null = null;
  private connectedGoggleBle: Device | null = null;
  private goggleTxSubscription: { remove: () => void } | null = null;
  private peripheralActive = false;
  private autoReconnectEnabled = false;
  private reconnectGogglesId: string | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manager: NullableBleManager;

  constructor() {
    try {
      this.manager = Platform.OS === 'web' ? null : new BleManager();
    } catch {
      console.warn('[GoggleBLE] Native BLE manager unavailable — simulation mode only');
      this.manager = null;
    }
  }

  // ---------- Goggle Mode (peripheral side) ----------

  /**
   * Start BLE advertising so the main iPhone can discover this device.
   * Uses react-native-ble-advertiser on physical iOS devices.
   * Falls back to a no-op simulation stub when native module is absent.
   */
  async startPeripheral(gogglesId: string): Promise<void> {
    if (this.peripheralActive) return;
    this.peripheralActive = true;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const BLEAdvertiser = require('react-native-ble-advertiser').default;
      // Advertise with the GOGGLE_SERVICE_UUID so the main iPhone BLE scan picks it up
      await BLEAdvertiser.broadcast(
        GOGGLE_SERVICE_UUID,
        [GOGGLE_RX_CHAR_UUID, GOGGLE_TX_CHAR_UUID],
        { advertiseMode: 0, txPowerLevel: 3, connectable: true, includeDeviceName: true }
      );
      console.log('[GoggleBLE] Peripheral advertising started, gogglesId:', gogglesId);
    } catch (err) {
      console.warn('[GoggleBLE] BLE advertiser unavailable (native module missing or simulator):', err);
      // Simulation path: emit an in-memory advertising state
    }
  }

  stopPeripheral(): void {
    if (!this.peripheralActive) return;
    this.peripheralActive = false;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const BLEAdvertiser = require('react-native-ble-advertiser').default;
      BLEAdvertiser.stopBroadcast();
    } catch (err) {
      console.warn('[GoggleBLE] stopBroadcast error:', err);
    }
  }

  /** Goggle Mode: send telemetry notification to paired central */
  sendTelemetry(evt: GoggleTelemetryEvent): void {
    if (!this.manager || !this.connectedGoggleBle) {
      // Simulation: broadcast to in-process telemetry listeners
      this.telemetryListeners.forEach((l) => l(evt));
      return;
    }
    const json = JSON.stringify(evt);
    // Encode to base64 for BLE characteristic write
    const b64 = btoa(unescape(encodeURIComponent(json)));
    this.manager
      .writeCharacteristicWithoutResponseForDevice(
        this.connectedGoggleBle.id,
        GOGGLE_SERVICE_UUID,
        GOGGLE_TX_CHAR_UUID,
        b64
      )
      .catch((err: Error) => console.warn('[GoggleBLE] sendTelemetry error:', err));
  }

  // ---------- Main Mode (central side) ----------

  /**
   * Scan BLE for devices advertising GOGGLE_SERVICE_UUID.
   * Returns the first device found or null on timeout.
   */
  async scanForGoggle(timeoutMs = 8000): Promise<WooverseDevice | null> {
    if (!this.manager) {
      // Simulation: no real BLE scan
      console.warn('[GoggleBLE] BLE manager unavailable — cannot scan for goggle in this environment');
      return null;
    }
    return new Promise((resolve) => {
      let found: WooverseDevice | null = null;
      try {
        this.manager!.startDeviceScan([GOGGLE_SERVICE_UUID], null, (error, device) => {
          if (error) {
            console.warn('[GoggleBLE] scan error:', error);
            return;
          }
          if (device && !found) {
            found = { id: device.id, name: device.name || 'WOOVERSE-GOGGLE', rssi: device.rssi ?? null };
            this.manager!.stopDeviceScan();
            resolve(found);
          }
        });
      } catch (err) {
        console.warn('[GoggleBLE] unable to start scan:', err);
      }
      setTimeout(() => {
        this.manager!.stopDeviceScan();
        if (!found) resolve(null);
      }, timeoutMs);
    });
  }

  /** Main Mode: connect to a discovered goggle device and subscribe to telemetry */
  async connectToGoggle(device: WooverseDevice): Promise<void> {
    if (!this.manager) throw new Error('[GoggleBLE] BLE not available');
    const connected = await this.manager.connectToDevice(device.id, { autoConnect: true });
    await connected.discoverAllServicesAndCharacteristics();
    this.connectedGoggle = device;
    this.connectedGoggleBle = connected;
    this._subscribeToGoggleTx();
    // Register disconnect listener so BLE drops trigger the reconnect back-off
    connected.onDisconnected((_error, disconnectedDevice) => {
      this.handleGoggleDisconnect(disconnectedDevice.id);
    });
  }

  private _subscribeToGoggleTx() {
    if (!this.manager || !this.connectedGoggleBle) return;
    this.goggleTxSubscription?.remove();
    this.goggleTxSubscription = this.connectedGoggleBle.monitorCharacteristicForService(
      GOGGLE_SERVICE_UUID,
      GOGGLE_TX_CHAR_UUID,
      (error, characteristic) => {
        if (error) {
          console.warn('[GoggleBLE] TX monitor error:', error);
          return;
        }
        const raw = characteristic?.value;
        if (!raw) return;
        try {
          const json = decodeURIComponent(escape(atob(raw)));
          const evt = JSON.parse(json) as GoggleTelemetryEvent;
          this.telemetryListeners.forEach((l) => l(evt));
        } catch (parseErr) {
          console.warn('[GoggleBLE] failed to parse telemetry:', parseErr);
        }
      }
    );
  }

  /** Main Mode: send BLE command to the connected goggle */
  sendCommand(cmd: GoggleCommand): void {
    const payload = JSON.stringify({ cmd });
    const b64 = btoa(unescape(encodeURIComponent(payload)));
    if (!this.manager || !this.connectedGoggleBle) {
      // Simulation: route to in-process command listeners
      this.commandListeners.forEach((l) => l({ cmd }));
      return;
    }
    this.manager
      .writeCharacteristicWithoutResponseForDevice(
        this.connectedGoggleBle.id,
        GOGGLE_SERVICE_UUID,
        GOGGLE_RX_CHAR_UUID,
        b64
      )
      .catch((err: Error) => console.warn('[GoggleBLE] sendCommand error:', err));
  }

  // ---------- Both sides ----------

  /** Subscribe to incoming command notifications (Goggle Mode receives these) */
  onCommand(listener: CommandListener): () => void {
    this.commandListeners.add(listener);
    return () => this.commandListeners.delete(listener);
  }

  /** Subscribe to incoming telemetry notifications (Main Mode receives these) */
  onTelemetry(listener: TelemetryListener): () => void {
    this.telemetryListeners.add(listener);
    return () => this.telemetryListeners.delete(listener);
  }

  /** Disconnect + graceful cleanup */
  async disconnect(): Promise<void> {
    this.disableAutoReconnect();
    this.goggleTxSubscription?.remove();
    this.goggleTxSubscription = null;
    if (this.manager && this.connectedGoggleBle) {
      try {
        await this.manager.cancelDeviceConnection(this.connectedGoggleBle.id);
      } catch (err) {
        console.warn('[GoggleBLE] disconnect error:', err);
      }
    }
    this.connectedGoggle = null;
    this.connectedGoggleBle = null;
    this.stopPeripheral();
  }

  // ---------- Auto-reconnect ----------

  enableAutoReconnect(gogglesId: string): void {
    this.autoReconnectEnabled = true;
    this.reconnectGogglesId = gogglesId;
    this.reconnectAttempts = 0;
  }

  disableAutoReconnect(): void {
    this.autoReconnectEnabled = false;
    this.reconnectGogglesId = null;
    this.reconnectAttempts = 0;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /** Call this when a BLE disconnect is detected while auto-reconnect is enabled */
  handleGoggleDisconnect(_gogglesId?: string): void {
    if (!this.autoReconnectEnabled || !this.reconnectGogglesId) return;
    if (this.reconnectAttempts >= GOGGLE_MAX_RECONNECT_ATTEMPTS) {
      console.warn('[GoggleBLE] Max reconnect attempts reached — giving up');
      this.commandListeners.forEach((l) => l({ evt: 'ble_reconnect_failed' }));
      this.disableAutoReconnect();
      return;
    }
    const delay = Math.min(
      GOGGLE_RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempts),
      GOGGLE_RECONNECT_MAX_DELAY
    );
    this.reconnectAttempts += 1;
    console.log(`[GoggleBLE] BLE reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);
    this.reconnectTimer = setTimeout(async () => {
      try {
        const device = await this.scanForGoggle(8000);
        if (device) {
          await this.connectToGoggle(device);
          console.log('[GoggleBLE] Reconnected to goggle after BLE drop');
          this.reconnectAttempts = 0;
        } else {
          this.handleGoggleDisconnect(); // retry
        }
      } catch (err) {
        console.warn('[GoggleBLE] Reconnect attempt failed:', err);
        this.handleGoggleDisconnect(); // retry
      }
    }, delay);
  }

  getConnectedGoggle(): WooverseDevice | null {
    return this.connectedGoggle;
  }
}

export const goggleBridge = new WooverseGoggleBridge();

export { WOOVERSE_SERVICE_UUID, bleSimulator };
export default bleBridge;
