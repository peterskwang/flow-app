import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';

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

const MAP_HTML = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="initial-scale=1, maximum-scale=1" />
    <style>
      html, body, #map { height: 100%; margin: 0; padding: 0; background: #02101f; }
      .user-marker { width:14px;height:14px;border-radius:7px;background:#64ffda;border:2px solid #02101f; }
      .teammate-marker { padding:6px 10px;background:rgba(255,152,0,0.9);color:#02101f;border-radius:12px;font-size:12px;font-weight:700;white-space:nowrap; }
    </style>
    <script src="https://webapi.amap.com/maps?v=1.4.15&key=YOUR_GAODE_KEY"></script>
  </head>
  <body>
    <div id="map"></div>
    <script>
      var markers = {};
      var map = null;
      var userMarker = null;
      function ensureMap() {
        if (!map && window.AMap) {
          map = new AMap.Map('map', { zoom: 12, center: [116.39, 39.91], viewMode: '2D' });
        }
      }
      function updateUserLocation(coords) {
        if (!coords || typeof coords.latitude !== 'number') return;
        ensureMap();
        if (!map) return;
        var pos = [coords.longitude, coords.latitude];
        map.setCenter(pos);
        if (!userMarker) {
          userMarker = new AMap.Marker({ position: pos, content: '<div class="user-marker"></div>', offset: new AMap.Pixel(-7,-7) });
          map.add(userMarker);
        } else { userMarker.setPosition(pos); }
      }
      function updateTeammates(list) {
        ensureMap();
        if (!map || !Array.isArray(list)) return;
        var seen = {};
        list.forEach(function(m) {
          if (!m || typeof m.longitude !== 'number' || typeof m.latitude !== 'number') return;
          var id = m.id || m.user_id;
          if (!id) return;
          seen[id] = true;
          if (!markers[id]) {
            markers[id] = new AMap.Marker({ position: [m.longitude, m.latitude], content: '<div class="teammate-marker">' + (m.name || 'Teammate') + '</div>' });
            map.add(markers[id]);
          } else { markers[id].setPosition([m.longitude, m.latitude]); }
        });
        Object.keys(markers).forEach(function(key) {
          if (!seen[key]) { map.remove(markers[key]); delete markers[key]; }
        });
      }
      function onMessage(event) {
        var data = event.data;
        if (typeof data === 'string') { try { data = JSON.parse(data); } catch(e) { return; } }
        if (!data || !data.type) return;
        if (data.type === 'setUserLocation') updateUserLocation(data.coords);
        if (data.type === 'setTeammates') updateTeammates(data.teammates);
      }
      window.addEventListener('message', onMessage);
      document.addEventListener('message', onMessage);
      ensureMap();
    </script>
  </body>
</html>
`;

const MapScreen = () => {
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [teammates, setTeammates] = useState<Teammate[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const webViewRef = useRef<WebView>(null);

  const postToMap = useCallback((msg: object) => {
    webViewRef.current?.postMessage(JSON.stringify(msg));
  }, []);

  useEffect(() => {
    if (coords) {
      postToMap({ type: 'setUserLocation', coords: { latitude: coords.latitude, longitude: coords.longitude } });
    }
  }, [coords, postToMap]);

  useEffect(() => {
    postToMap({ type: 'setTeammates', teammates });
  }, [teammates, postToMap]);

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
      if (interval) clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    startLocationTracking((latest) => {
      if (mounted) setCoords(latest);
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
      <View style={styles.mapContainer}>
        <WebView
          ref={webViewRef}
          source={{ html: MAP_HTML }}
          style={styles.webView}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          originWhitelist={['*']}
          onError={(e) => console.warn('[MapWebView] error', e.nativeEvent)}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Your Position</Text>
        {coords ? (
          <Text style={styles.coords}>
            {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
          </Text>
        ) : (
          <Text style={styles.statusText}>{locationError || 'Requesting GPS...'}</Text>
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
  container: { flex: 1, backgroundColor: '#06121f' },
  mapContainer: { height: 300 },
  webView: { flex: 1 },
  card: { backgroundColor: '#0f2238', borderRadius: 16, padding: 16, margin: 12, marginTop: 0 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 8 },
  coords: { fontSize: 16, color: '#64ffda' },
  teammateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1e3a5f' },
  teammateName: { color: '#fff', fontSize: 16, fontWeight: '600' },
  teammateCoords: { color: '#90caf9', fontSize: 14 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#06121f' },
  statusText: { marginTop: 8, color: '#9fb4cc', textAlign: 'center' },
  error: { color: '#ff8a80', marginBottom: 8 }
});

export default MapScreen;
