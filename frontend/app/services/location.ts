import * as Location from 'expo-location';

import wsClient from './ws';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

let locationSubscription: Location.LocationSubscription | null = null;

export const requestPermissions = async () => {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== Location.PermissionStatus.GRANTED) {
    throw new Error('Location permission denied');
  }
};

export const startLocationTracking = async (onUpdate?: (coords: Coordinates) => void) => {
  await requestPermissions();

  if (locationSubscription) {
    locationSubscription.remove();
    locationSubscription = null;
  }

  locationSubscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 5000,
      distanceInterval: 10
    },
    (location) => {
      const coords: Coordinates = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude
      };

      onUpdate?.(coords);

      if (wsClient.isConnected()) {
        wsClient.send({
          type: 'location',
          lat: coords.latitude,
          lng: coords.longitude,
          ts: Date.now()
        });
      }
    }
  );

  return locationSubscription;
};

export const stopLocationTracking = () => {
  if (locationSubscription) {
    locationSubscription.remove();
    locationSubscription = null;
  }
};
