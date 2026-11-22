import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import {
  ApiError,
  getAnalyticsCorridors,
  getAnalyticsHourly,
  getAnalyticsStops,
} from '@/services/ApiService';

type Stop = { stop_id: string; name: string; boardings: number; alightings: number };
type Corridor = { route_id: string; boardings: number; alightings: number; busiest_stop: string };
type HourRow = { hour: number; boardings: number; alightings: number };
type Data = { stops: Stop[]; corridors: Corridor[]; hours: HourRow[] };

const COLOR_BOARD = '#1E6FE8'; // naik
const COLOR_ALIGHT = '#E8A200'; // turun

// Mengambil ketiga data analitik sekaligus lewat ApiService.
async function fetchAnalytics(): Promise<Data> {
  const [stops, corridors, hourly] = await Promise.all([
    getAnalyticsStops(),
    getAnalyticsCorridors(),
    getAnalyticsHourly(),
  ]);
  return { stops, corridors, hours: hourly.by_hour };
}

function errorMessage(e: unknown) {
  return e instanceof ApiError ? e.message : 'Gagal memuat data analitik.';
}

// Satu batang mendatar: lebar diatur dari nilai dibanding nilai maksimum.
function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const theme = useTheme();
  const percent = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <View style={[styles.barTrack, { backgroundColor: theme.backgroundSelected }]}>
      <View style={[styles.barFill, { width: `${percent}%`, backgroundColor: color }]} />
    </View>
  );
}

function Legend() {
  return (
    <View style={styles.legend}>
      <View style={[styles.dot, { backgroundColor: COLOR_BOARD }]} />
      <ThemedText type="small">Naik</ThemedText>
      <View style={[styles.dot, { backgroundColor: COLOR_ALIGHT }]} />
      <ThemedText type="small">Turun</ThemedText>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <ThemedView type="backgroundElement" style={styles.section}>
      <ThemedText type="smallBold">{title}</ThemedText>
      {children}
    </ThemedView>
  );
}

function StopsSection({ stops }: { stops: Stop[] }) {
  const max = Math.max(...stops.map((s) => s.boardings), 0);
  return (
    <Section title="Halte tersibuk (penumpang naik)">
      {stops.map((s, i) => (
        <View key={s.stop_id} style={styles.item}>
          <View style={styles.row}>
            <ThemedText type="small">
              {i + 1}. {s.name}
            </ThemedText>
            <ThemedText type="smallBold">{s.boardings}</ThemedText>
          </View>
          <Bar value={s.boardings} max={max} color={COLOR_BOARD} />
        </View>
      ))}
    </Section>
  );
}

function CorridorsSection({ corridors }: { corridors: Corridor[] }) {
  const max = Math.max(...corridors.flatMap((c) => [c.boardings, c.alightings]), 0);
  return (
    <Section title="Perbandingan koridor">
      <Legend />
      {corridors.map((c) => (
        <View key={c.route_id} style={styles.item}>
          <View style={styles.row}>
            <ThemedText type="smallBold">Koridor {c.route_id}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Tersibuk: {c.busiest_stop}
            </ThemedText>
          </View>
          <Bar value={c.boardings} max={max} color={COLOR_BOARD} />
          <Bar value={c.alightings} max={max} color={COLOR_ALIGHT} />
          <ThemedText type="small" themeColor="textSecondary">
            Naik {c.boardings} · Turun {c.alightings}
          </ThemedText>
        </View>
      ))}
    </Section>
  );
}

// Diagram batang tegak 24 jam, dibuat dari View biasa.
function HourlySection({ hours }: { hours: HourRow[] }) {
  const max = Math.max(...hours.flatMap((h) => [h.boardings, h.alightings]), 0);
  const CHART_HEIGHT = 120;
  const peak = hours.reduce((a, b) => (b.boardings > a.boardings ? b : a), hours[0]);

  return (
    <Section title="Pola per jam">
      <Legend />
      <View style={[styles.chart, { height: CHART_HEIGHT }]}>
        {hours.map((h) => (
          <View key={h.hour} style={styles.hourCol}>
            <View
              style={{
                height: max > 0 ? (h.boardings / max) * CHART_HEIGHT : 0,
                backgroundColor: COLOR_BOARD,
                width: '45%',
              }}
            />
            <View
              style={{
                height: max > 0 ? (h.alightings / max) * CHART_HEIGHT : 0,
                backgroundColor: COLOR_ALIGHT,
                width: '45%',
              }}
            />
          </View>
        ))}
      </View>
      <View style={styles.hourLabels}>
        {hours.map((h) => (
          <View key={h.hour} style={styles.hourCol}>
            <ThemedText style={styles.hourLabel} themeColor="textSecondary">
              {h.hour % 3 === 0 ? h.hour : ''}
            </ThemedText>
          </View>
        ))}
      </View>
      {peak && peak.boardings > 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          Jam tersibuk: {String(peak.hour).padStart(2, '0')}.00 ({peak.boardings} naik)
        </ThemedText>
      )}
    </Section>
  );
}

export default function AnalyticsScreen() {
  const { user } = useAuth();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Pemuatan pertama (state diubah di dalam .then/.catch sesuai aturan React).
  useEffect(() => {
    let active = true;
    fetchAnalytics()
      .then((d) => active && setData(d))
      .catch((e) => active && setError(errorMessage(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const retry = useCallback(() => {
    setError('');
    setLoading(true);
    fetchAnalytics()
      .then(setData)
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  // Tab disembunyikan untuk non-operator, tapi layar ini tetap menolak kalau dibuka lewat URL.
  if (user?.role !== 'operator') {
    return (
      <ThemedView style={[styles.flex, styles.center]}>
        <ThemedText themeColor="textSecondary">Halaman ini khusus operator.</ThemedText>
      </ThemedView>
    );
  }

  const isEmpty = !!data && data.stops.length === 0 && data.corridors.length === 0 && data.hours.length === 0;

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <ThemedText style={styles.errorText}>{error}</ThemedText>
            <Pressable onPress={retry} style={styles.retry}>
              <ThemedText style={styles.retryText}>Coba lagi</ThemedText>
            </Pressable>
          </View>
        ) : isEmpty || !data ? (
          <View style={styles.center}>
            <ThemedText themeColor="textSecondary">Belum ada data analitik.</ThemedText>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            <ThemedText type="subtitle">Analitik</ThemedText>
            <ThemedText themeColor="textSecondary">Arus penumpang hari ini.</ThemedText>
            {data.stops.length > 0 && <StopsSection stops={data.stops} />}
            {data.corridors.length > 0 && <CorridorsSection corridors={data.corridors} />}
            {data.hours.length > 0 && <HourlySection hours={data.hours} />}
          </ScrollView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  content: {
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  section: { borderRadius: 12, padding: Spacing.three, gap: Spacing.three },
  item: { gap: Spacing.one },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  barTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dot: { width: 10, height: 10, borderRadius: 5 },
  chart: { flexDirection: 'row', alignItems: 'flex-end' },
  hourCol: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' },
  hourLabels: { flexDirection: 'row' },
  hourLabel: { fontSize: 10, lineHeight: 14 },
  errorText: { color: '#B3261E', textAlign: 'center', paddingHorizontal: Spacing.four },
  retry: {
    backgroundColor: '#1E6FE8',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: Spacing.five,
  },
  retryText: { color: '#ffffff', fontWeight: 700 },
});
