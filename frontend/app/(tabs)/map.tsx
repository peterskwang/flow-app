import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import api from '../services/api';
import {
  Coordinates,
  startLocationTracking,
  stopLocationTracking
} from '../services/location';

interface Teammate {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

const MapScreen = () => {
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [teammates, setTeammates] = useState<Teammate[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    let mounted = true;

    const loadGroup = async () => {
      try {
        const storedGroupId = await AsyncStorage.getItem('groupId');
        if (mounted) {
          setGroupId(storedGroupId);
          setLoading(false);
        }

        if (storedGroupId) {
          await fetchTeammates(storedGroupId);
          interval = setInterval(() => fetchTeammates(storedGroupId), 10000);
        }
      } catch (error) {
        console.error('Failed to load group', error);
      }
    };

    loadGroup();

    return () => {
      mounted = false;
      if (interval) {
        clearInterval(interval);
      }
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    startLocationTracking((latest) => {
      if (mounted) {
        setCoords(latest);
      }
    }).catch((error) => {
      setLocationError(error.message || 'Location unavailable');
    });

    return () => {
      mounted = false;
      stopLocationTracking();
    };
  }, []);

  const fetchTeammates = async (activeGroupId: string) => {
    try {
      const response = await api.get(`/api/locations/${activeGroupId}`);
      const list: Teammate[] = response.data?.teammates || response.data || [];
      setTeammates(Array.isArray(list) ? list : []);
      setFetchError(null);
    } catch (error: any) {
      console.warn('Failed to fetch teammate locations', error);
      setFetchError(error?.response?.data?.message || 'Unable to load teammate locations');
    }
  };

  const teammateData = useMemo(() => teammates.filter(Boolean), [teammates]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
        <Text style={styles.statusText}>Loading group info...</Text>
      </View>
    );
  }

  if (!groupId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.statusText}>Create or join a group first.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Your Coordinates</Text>
        {coords ? (
          <Text style={styles.coords}>
            Lat: {coords.latitude.toFixed(5)} {'\n'}Lng: {coords.longitude.toFixed(5)}
          </Text>
        ) : (
          <Text style={styles.statusText}>
            {locationError || 'Requesting GPS position...'}
          </Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Teammates</Text>
        {fetchError ? <Text style={styles.error}>{fetchError}</Text> : null}
        <FlatList
          data={teammateData}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<Text style={styles.statusText}>No teammates reported yet.</Text>}
          renderItem={({ item }) => (
            <View style={styles.teammateRow}>
              <Text style={styles.teammateName}>{item.name || 'Unknown'}</Text>
              <Text style={styles.teammateCoords}>
                {item.latitude?.toFixed(4)}, {item.longitude?.toFixed(4)}
              </Text>
            </View>
          )}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#06121f',
    gap: 16
  },
  card: {
    backgroundColor: '#0f2238',
    borderRadius: 16,
    padding: 16,
    flex: 1
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12
  },
  coords: {
    fontSize: 20,
    color: '#64ffda'
  },
  teammateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1e3a5f'
  },
  teammateName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600'
  },
  teammateCoords: {
    color: '#90caf9',
    fontSize: 14
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#06121f'
  },
  statusText: {
    marginTop: 12,
    color: '#9fb4cc',
    textAlign: 'center'
  },
  error: {
    color: '#ff8a80',
    marginBottom: 8
  }
});

export default MapScreen;
