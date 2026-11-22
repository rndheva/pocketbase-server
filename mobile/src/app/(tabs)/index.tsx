import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { STATUS_COLOR, type BusStatus } from '@/components/map/map-html';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, getBuses } from '@/services/ApiService';

const POLL_MS = 5000; // ambil data baru tiap 5 detik selama layar ini dibuka

// status (low/light/medium/high) dihitung backend, layar hanya menampilkan.
type Bus = {
  id: string;
  plate: string;
  route: string;
  occupancy: number;
  capacity: number;
  status: BusStatus;
};

function BusCard({ bus }: { bus: Bus }) {
  const theme = useTheme();
  const color = STATUS_COLOR[bus.status] ?? '#555';
  const percent = Math.min(100, Math.round((bus.occupancy / bus.capacity) * 100));

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.row}>
        <ThemedText type="smallBold">{bus.plate}</ThemedText>
        <ThemedText type="smallBold" style={{ color }}>
          {bus.status}
        </ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {bus.route}
      </ThemedText>
      <View style={[styles.barTrack, { backgroundColor: theme.backgroundSelected }]}>
        <View style={[styles.barFill, { width: `${percent}%`, backgroundColor: color }]} />
      </View>
      <ThemedText type="small">
        {bus.occupancy} / {bus.capacity} penumpang ({percent}%)
      </ThemedText>
    </ThemedView>
  );
}

export default function BusListScreen() {
  const [buses, setBuses] = useState<Bus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // Mengambil data bus lewat ApiService, lalu mengisi daftar atau pesan error.
  const fetchBuses = useCallback(async () => {
    try {
      setBuses(await getBuses());
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal memuat data bus.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Selama layar ini dibuka: ambil data, tunggu 5 detik, ulangi. Permintaan berikutnya
  // baru dijadwalkan setelah yang sebelumnya selesai, jadi tidak pernah menumpuk.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      async function poll() {
        await fetchBuses();
        if (active) timer = setTimeout(poll, POLL_MS);
      }
      poll();
      return () => {
        active = false;
        clearTimeout(timer);
      };
    }, [fetchBuses]),
  );

  // Tarik ke bawah untuk memperbarui.
  function handleRefresh() {
    setRefreshing(true);
    fetchBuses();
  }

  // Tombol "Coba lagi" setelah error.
  function handleRetry() {
    setError('');
    setLoading(true);
    fetchBuses();
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <View style={styles.header}>
          <ThemedText type="subtitle">Keterisian Bus</ThemedText>
          <ThemedText themeColor="textSecondary">Diperbarui otomatis tiap 5 detik.</ThemedText>
          {/* Gagal memperbarui tidak menghapus daftar yang sudah tampil. */}
          {!!error && buses.length > 0 && (
            <ThemedText type="small" style={styles.staleText}>
              {error} Menampilkan data terakhir.
            </ThemedText>
          )}
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" />
          </View>
        ) : error && buses.length === 0 ? (
          <View style={styles.center}>
            <ThemedText style={styles.errorText}>{error}</ThemedText>
            <Pressable onPress={handleRetry} style={styles.retry}>
              <ThemedText style={styles.retryText}>Coba lagi</ThemedText>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={buses}
            keyExtractor={(b) => b.id}
            renderItem={({ item }) => <BusCard bus={item} />}
            contentContainerStyle={styles.list}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            ListEmptyComponent={
              <ThemedText themeColor="textSecondary" style={styles.empty}>
                Belum ada data bus.
              </ThemedText>
            }
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  list: {
    padding: Spacing.four,
    paddingTop: 0,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  card: { borderRadius: 12, padding: Spacing.three, gap: Spacing.two },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  barTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  errorText: { color: '#B3261E', textAlign: 'center', paddingHorizontal: Spacing.four },
  staleText: { color: '#B3261E' },
  retry: {
    backgroundColor: '#1E6FE8',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: Spacing.five,
  },
  retryText: { color: '#ffffff', fontWeight: 700 },
  empty: { textAlign: 'center', marginTop: Spacing.five },
});
