import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import api from '../services/api';

interface Run {
  id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  distance_meters: number;
  vertical_meters: number;
  max_speed_kmh: number;
  avg_speed_kmh: number;
  top_altitude_m: number | null;
  bottom_altitude_m: number | null;
}

const formatDuration = (s: number): string => {
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

interface StatCellProps {
  label: string;
  value: string;
}

const StatCell = ({ label, value }: StatCellProps) => (
  <View style={styles.statCell}>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const RunsScreen = () => {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get('/api/runs')
      .then((r) => {
        setRuns(r.data.runs ?? []);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load runs');
        setLoading(false);
      });
  }, []);

  const renderRun = ({ item, index }: { item: Run; index: number }) => (
    <View style={styles.runCard}>
      <View style={styles.runHeader}>
        <Text style={styles.runIndex}>Run #{runs.length - index}</Text>
        <Text style={styles.runDate}>
          {new Date(item.started_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </View>
      <View style={styles.statsGrid}>
        <StatCell
          label="Duration"
          value={formatDuration(item.duration_seconds ?? 0)}
        />
        <StatCell
          label="Vertical"
          value={`${item.vertical_meters?.toFixed(0) ?? '—'} m`}
        />
        <StatCell
          label="Distance"
          value={`${((item.distance_meters ?? 0) / 1000).toFixed(2)} km`}
        />
        <StatCell
          label="Top Speed"
          value={`${item.max_speed_kmh?.toFixed(0) ?? '—'} km/h`}
        />
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Run History</Text>
      {loading ? (
        <ActivityIndicator color="#64ffda" style={styles.loader} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : runs.length === 0 ? (
        <Text style={styles.empty}>No runs yet — go ski! 🎿</Text>
      ) : (
        <FlatList
          data={runs}
          keyExtractor={(r) => r.id}
          renderItem={renderRun}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#06121f' },
  header: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    margin: 16,
    marginBottom: 8,
  },
  loader: { marginTop: 40 },
  error: { color: '#ff8a80', textAlign: 'center', marginTop: 40 },
  empty: { color: '#9fb4cc', textAlign: 'center', marginTop: 60, fontSize: 16 },
  list: { paddingHorizontal: 12, paddingBottom: 24 },
  runCard: {
    backgroundColor: '#0f2238',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  runHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  runIndex: { color: '#fff', fontSize: 16, fontWeight: '700' },
  runDate: { color: '#9fb4cc', fontSize: 13 },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCell: {
    width: '45%',
  },
  statValue: { color: '#64ffda', fontSize: 18, fontWeight: '700' },
  statLabel: { color: '#9fb4cc', fontSize: 12, marginTop: 2 },
});

export default RunsScreen;
