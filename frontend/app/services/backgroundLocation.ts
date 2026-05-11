import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import wsClient from './ws';

export const FLOW_LOCATION_TASK = 'FLOW_LOCATION_TASK';

TaskManager.defineTask(FLOW_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('[BgGPS] Task error:', error.message);
    return;
  }

  if (!data) return;
  const { locations } = data as { locations: Location.LocationObject[] };
  if (!locations || locations.length === 0) return;

  const latest = locations[locations.length - 1];
  const { latitude, longitude, altitude, speed } = latest.coords;

  if (wsClient.isConnected()) {
    wsClient.send({
      type: 'location',
      lat: latitude,
      lng: longitude,
      altitude_m: altitude ?? null,
      speed_ms: speed ?? null,
      ts: Date.now(),
    });
  }
});

export async function startBackgroundLocationTask(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(FLOW_LOCATION_TASK);
  if (isRegistered) {
    console.log('[BgGPS] Task already running');
    return;
  }

  await Location.startLocationUpdatesAsync(FLOW_LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 10000,
    distanceInterval: 15,
    foregroundService: {
      notificationTitle: 'FLOW is tracking your location',
      notificationBody: 'Sharing location with your ski group.',
      notificationColor: '#1e88e5',
    },
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    activityType: Location.ActivityType.Fitness,
  });

  console.log('[BgGPS] Background location task started');
}

export async function stopBackgroundLocationTask(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(FLOW_LOCATION_TASK);
  if (!isRegistered) return;

  await Location.stopLocationUpdatesAsync(FLOW_LOCATION_TASK);
  console.log('[BgGPS] Background location task stopped');
}

export function isBackgroundLocationRunning(): Promise<boolean> {
  return TaskManager.isTaskRegisteredAsync(FLOW_LOCATION_TASK);
}
