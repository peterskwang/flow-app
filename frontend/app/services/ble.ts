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

export { WOOVERSE_SERVICE_UUID, bleSimulator };
export default bleBridge;
