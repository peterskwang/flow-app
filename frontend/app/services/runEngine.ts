import api from './api';
import { Coordinates } from './location';

export type RunState = 'IDLE' | 'ACTIVE' | 'ENDED';

export interface RunSnapshot {
  runId: string | null;
  state: RunState;
  startedAt: Date | null;
  durationSeconds: number;
  verticalMeters: number;
  distanceMeters: number;
  maxSpeedKmh: number;
  avgSpeedKmh: number;
  topAltitudeM: number | null;
}

// Haversine formula — returns distance in metres between two coordinates
function haversineMeters(a: Coordinates, b: Coordinates): number {
  const R = 6371000;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

interface RunStats {
  vertical: number;
  distance: number;
  maxSpeed: number;
  speedSum: number;
  ticks: number;
}

class RunEngine {
  private state: RunState = 'IDLE';
  private triggerBuffer: Coordinates[] = []; // last 3 ticks (speed + altitude check)
  private stopBuffer: number = 0;            // cumulative seconds below speed threshold
  private runId: string | null = null;
  private startedAt: Date | null = null;
  private startAltitude: number | null = null;
  private prevCoords: Coordinates | null = null;
  private stats: RunStats = { vertical: 0, distance: 0, maxSpeed: 0, speedSum: 0, ticks: 0 };

  private listeners: ((snap: RunSnapshot) => void)[] = [];

  /** Register a listener that will be called on every state/stats change */
  onUpdate(cb: (snap: RunSnapshot) => void): void {
    this.listeners.push(cb);
  }

  /** Feed a new GPS coordinate into the state machine */
  async feed(coords: Coordinates, groupId: string | null): Promise<void> {
    const speedKmh = (coords.speed ?? 0) * 3.6;

    if (this.state === 'IDLE') {
      this.triggerBuffer.push(coords);
      if (this.triggerBuffer.length > 3) this.triggerBuffer.shift();
      if (this.shouldStart(speedKmh)) {
        await this.startRun(coords, groupId);
      }
    } else if (this.state === 'ACTIVE') {
      this.updateStats(coords, speedKmh);
      if (this.shouldEnd(speedKmh)) {
        await this.endRun(coords);
      } else {
        this.emit();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // State transition helpers
  // ---------------------------------------------------------------------------

  private shouldStart(speedKmh: number): boolean {
    if (this.triggerBuffer.length < 3) return false;

    const fastEnough = this.triggerBuffer.every((c) => (c.speed ?? 0) * 3.6 >= 15);
    if (!fastEnough) return false;

    // Altitude dropping: first tick altitude is higher than last tick altitude
    const first = this.triggerBuffer[0];
    const last = this.triggerBuffer[2];
    const altAvailable =
      first.altitude !== null && last.altitude !== null;
    const dropping =
      altAvailable && first.altitude! - last.altitude! >= 2;

    // Fallback when GPS altitude is permanently null: require faster speed threshold
    return dropping || (!altAvailable && speedKmh >= 20);
  }

  private shouldEnd(speedKmh: number): boolean {
    const TICK_INTERVAL_S = 5; // approximate GPS tick interval
    if (speedKmh < 5) {
      this.stopBuffer += TICK_INTERVAL_S;
      return this.stopBuffer >= 10;
    }
    this.stopBuffer = 0;
    return false;
  }

  private async startRun(coords: Coordinates, groupId: string | null): Promise<void> {
    this.state = 'ACTIVE';
    this.startedAt = new Date();
    this.startAltitude = coords.altitude;
    this.stats = { vertical: 0, distance: 0, maxSpeed: 0, speedSum: 0, ticks: 0 };
    this.prevCoords = coords;
    this.stopBuffer = 0;

    try {
      const res = await api.post('/api/runs/start', {
        group_id: groupId,
        top_altitude_m: coords.altitude,
        started_at: this.startedAt.toISOString(),
      });
      this.runId = res.data.run_id;
    } catch (err) {
      console.warn('[RunEngine] Failed to start run on server:', err);
      // Keep running locally even if network fails; runId stays null
    }

    this.emit();
  }

  private async endRun(coords: Coordinates): Promise<void> {
    this.state = 'ENDED';
    const ended = new Date();
    const duration = Math.round(
      (ended.getTime() - (this.startedAt?.getTime() ?? ended.getTime())) / 1000
    );
    const avgSpeedKmh =
      this.stats.ticks > 0
        ? Math.round((this.stats.speedSum / this.stats.ticks) * 10) / 10
        : 0;

    if (this.runId) {
      const shouldDiscard = duration < 30 || this.stats.distance < 50;
      try {
        if (shouldDiscard) {
          await api.post(`/api/runs/${this.runId}/discard`);
        } else {
          await api.post(`/api/runs/${this.runId}/end`, {
            ended_at: ended.toISOString(),
            duration_seconds: duration,
            distance_meters: Math.round(this.stats.distance),
            vertical_meters: Math.round(this.stats.vertical),
            max_speed_kmh: Math.round(this.stats.maxSpeed * 10) / 10,
            avg_speed_kmh: avgSpeedKmh,
            bottom_altitude_m: coords.altitude,
          });
        }
      } catch (err) {
        console.warn('[RunEngine] Failed to end/discard run on server:', err);
      }
    }

    this.emit();

    // Auto-reset to IDLE after 2 s (gives UI time to show the summary card)
    setTimeout(() => {
      this.state = 'IDLE';
      this.runId = null;
      this.startedAt = null;
      this.startAltitude = null;
      this.prevCoords = null;
      this.triggerBuffer = [];
      this.stopBuffer = 0;
      this.stats = { vertical: 0, distance: 0, maxSpeed: 0, speedSum: 0, ticks: 0 };
      this.emit();
    }, 2000);
  }

  private updateStats(coords: Coordinates, speedKmh: number): void {
    // Vertical drop from start altitude
    if (coords.altitude !== null && this.startAltitude !== null) {
      const drop = this.startAltitude - coords.altitude;
      this.stats.vertical = Math.max(0, drop);
    }

    // Cumulative distance
    if (this.prevCoords) {
      this.stats.distance += haversineMeters(this.prevCoords, coords);
    }

    // Speed stats
    this.stats.maxSpeed = Math.max(this.stats.maxSpeed, speedKmh);
    this.stats.speedSum += speedKmh;
    this.stats.ticks++;

    this.prevCoords = coords;
  }

  private emit(): void {
    const avgSpeedKmh =
      this.stats.ticks > 0 ? this.stats.speedSum / this.stats.ticks : 0;

    const snap: RunSnapshot = {
      runId: this.runId,
      state: this.state,
      startedAt: this.startedAt,
      durationSeconds: this.startedAt
        ? Math.round((Date.now() - this.startedAt.getTime()) / 1000)
        : 0,
      verticalMeters: this.stats.vertical,
      distanceMeters: this.stats.distance,
      maxSpeedKmh: this.stats.maxSpeed,
      avgSpeedKmh,
      topAltitudeM: this.startAltitude,
    };

    this.listeners.forEach((cb) => cb(snap));
  }
}

export const runEngine = new RunEngine();
export default runEngine;
