import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import api from '../services/api';

// --- Interfaces ---

interface SeasonStats {
  total_runs: number;
  total_vertical_m: number;
  total_duration_s: number;
  total_distance_m: number;
  days_on_mountain: number;
}

interface PersonalBests {
  top_speed_kmh: number;
  best_day_vert_m: number;
  longest_run_s: number;
  longest_distance_m: number;
}

interface ChartDay {
  day: string;       // "YYYY-MM-DD"
  vert_m: number;
  run_count: number;
}

interface StatsPayload {
  season: SeasonStats;
  personal_bests: PersonalBests;
  skill_score: number;         // 0–100
  chart: ChartDay[];
}

// --- Pure-RN bar chart ---

const VertChart = ({ data }: { data: ChartDay[] }) => {
  if (!data.length) return null;
  const maxVert = Math.max(...data.map(d => d.vert_m), 1);
  const BAR_MAX_HEIGHT = 80;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', paddingVertical: 8, gap: 4 }}>
        {data.map(d => {
          const barH = Math.max((d.vert_m / maxVert) * BAR_MAX_HEIGHT, 4);
          const label = d.day.slice(5); // "MM-DD"
          return (
            <View key={d.day} style={{ alignItems: 'center', width: 28 }}>
              <View style={{ width: 20, height: barH, backgroundColor: '#1e88e5', borderRadius: 4 }} />
              <Text style={{ color: '#9fb4cc', fontSize: 9, marginTop: 3 }}>{label}</Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
};

// --- Helpers ---

const formatDuration = (s: number): string => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const skillTier = (score: number): string => {
  if (score < 20) return 'Beginner';
  if (score < 40) return 'Intermediate';
  if (score < 60) return 'Advanced';
  if (score < 80) return 'Expert';
  return 'Elite';
};

// --- Sub-components ---

const StatCard = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.statCard}>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const SectionHeader = ({ title }: { title: string }) => (
  <Text style={styles.sectionHeader}>{title}</Text>
);

// --- Main screen ---

const StatsScreen = () => {
  const [data, setData] = useState<StatsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<StatsPayload>('/api/stats/me')
      .then(r => { setData(r.data); setLoading(false); })
      .catch(() => { setError('Failed to load stats'); setLoading(false); });
  }, []);

  if (loading) return <ActivityIndicator color="#64ffda" style={styles.loader} />;
  if (error) return <Text style={styles.error}>{error}</Text>;
  if (!data) return null;

  const isEmpty = data.season.total_runs === 0;

  if (isEmpty) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.emptyIcon}>🎿</Text>
        <Text style={styles.emptyTitle}>No runs yet this season</Text>
        <Text style={styles.emptySubtitle}>
          Head out on the mountain — your stats will appear here after your first run.
        </Text>
      </View>
    );
  }

  const { season, personal_bests: pb, skill_score, chart } = data;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.header}>Stats</Text>

      {/* Personal Bests */}
      <SectionHeader title="⭐  Personal Bests" />
      <View style={styles.grid}>
        <StatCard label="Top Speed" value={`${pb.top_speed_kmh.toFixed(0)} km/h`} />
        <StatCard label="Best Day Vert" value={`${pb.best_day_vert_m.toFixed(0)} m`} />
        <StatCard label="Longest Run" value={formatDuration(pb.longest_run_s)} />
        <StatCard label="Longest Distance" value={`${(pb.longest_distance_m / 1000).toFixed(2)} km`} />
      </View>

      {/* Season Totals */}
      <SectionHeader title="📅  This Season" />
      <View style={styles.grid}>
        <StatCard label="Total Runs" value={String(season.total_runs)} />
        <StatCard label="Total Vertical" value={`${season.total_vertical_m.toFixed(0)} m`} />
        <StatCard label="Days on Mountain" value={String(season.days_on_mountain)} />
        <StatCard label="Total Time" value={formatDuration(season.total_duration_s)} />
      </View>

      {/* Chart */}
      <SectionHeader title="📊  Vertical Per Day" />
      <View style={styles.chartContainer}>
        <VertChart data={chart} />
      </View>

      {/* Skill Score */}
      <SectionHeader title="🎯  Skill Score" />
      <View style={styles.skillContainer}>
        <View style={styles.skillCircle}>
          <Text style={styles.skillNumber}>{skill_score}</Text>
          <Text style={styles.skillOutOf}>/100</Text>
        </View>
        <Text style={styles.skillTier}>{skillTier(skill_score)}</Text>
        <Text style={styles.skillHint}>
          Based on top speed, consistency, and total vertical
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#06121f' },
  content: { paddingBottom: 40 },
  center: { justifyContent: 'center', alignItems: 'center', padding: 32 },
  loader: { flex: 1, marginTop: 60 },
  error: { color: '#ff8a80', textAlign: 'center', marginTop: 60, fontSize: 16 },
  header: { fontSize: 22, fontWeight: '800', color: '#fff', margin: 16, marginBottom: 4 },
  sectionHeader: { color: '#64ffda', fontSize: 14, fontWeight: '700', marginHorizontal: 16, marginTop: 20, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 10 },
  statCard: { width: '45%', backgroundColor: '#0f2238', borderRadius: 14, padding: 14, marginHorizontal: 4 },
  statValue: { color: '#64ffda', fontSize: 20, fontWeight: '800' },
  statLabel: { color: '#9fb4cc', fontSize: 12, marginTop: 4 },
  chartContainer: { marginHorizontal: 16, backgroundColor: '#0f2238', borderRadius: 14, padding: 12 },
  skillContainer: { alignItems: 'center', backgroundColor: '#0f2238', borderRadius: 14, marginHorizontal: 16, paddingVertical: 24 },
  skillCircle: { flexDirection: 'row', alignItems: 'flex-end' },
  skillNumber: { color: '#64ffda', fontSize: 56, fontWeight: '900', lineHeight: 64 },
  skillOutOf: { color: '#9fb4cc', fontSize: 18, marginBottom: 8, marginLeft: 2 },
  skillTier: { color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 4 },
  skillHint: { color: '#9fb4cc', fontSize: 12, marginTop: 6, textAlign: 'center', paddingHorizontal: 24 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 8 },
  emptySubtitle: { color: '#9fb4cc', fontSize: 14, textAlign: 'center', lineHeight: 22 },
});

export default StatsScreen;
