import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { STATUS_COLOR, type BusStatus, type Stop } from '@/components/map/map-html';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import {
  ApiError,
  getFleet,
  getRouteGeometry,
  getRoutes,
  postAlighting,
  postBoarding,
} from '@/services/ApiService';
import { validateAlighting } from '@/utils/validators';

type Bus = {
  bus_id: string;
  route_id: string;
  passengers: number;
  capacity: number;
  percent: number;
  status: BusStatus;
};

function errorMessage(e: unknown, fallback: string) {
  return e instanceof ApiError ? e.message : fallback;
}

type StopsByRoute = Record<string, Stop[]>;

// Mengambil daftar bus + halte setiap rute sekaligus.
async function fetchSetup() {
  const [fleet, routes] = await Promise.all([getFleet(), getRoutes()]);
  const geometries = await Promise.all(
    routes.map((r: { route_id: string }) => getRouteGeometry(r.route_id)),
  );
  const stopsByRoute: StopsByRoute = {};
  routes.forEach((r: { route_id: string }, i: number) => {
    stopsByRoute[r.route_id] = geometries[i].stops;
  });
  return { fleet: fleet as Bus[], stopsByRoute };
}

// Tombol pilihan kecil (untuk memilih bus / halte).
function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: active ? '#1E6FE8' : theme.backgroundSelected },
      ]}>
      <ThemedText type="small" style={active ? styles.chipTextActive : undefined}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

export default function SimulatorScreen() {
  const { user } = useAuth();
  const theme = useTheme();

  const [fleet, setFleet] = useState<Bus[]>([]);
  const [stopsByRoute, setStopsByRoute] = useState<StopsByRoute>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [busId, setBusId] = useState('');
  const [stopId, setStopId] = useState('');
  const [alightText, setAlightText] = useState('');
  const [formError, setFormError] = useState('');

  const [busy, setBusy] = useState(false); // sedang mengirim ke "perangkat"
  const [actionError, setActionError] = useState('');
  const [lastEvent, setLastEvent] = useState('');

  function applySetup(data: { fleet: Bus[]; stopsByRoute: StopsByRoute }) {
    setFleet(data.fleet);
    setStopsByRoute(data.stopsByRoute);
    const first = data.fleet[0];
    setBusId((cur) => cur || first?.bus_id || '');
    setStopId((cur) => cur || (first && data.stopsByRoute[first.route_id]?.[0]?.id) || '');
  }

  // Pemuatan pertama.
  useEffect(() => {
    let active = true;
    fetchSetup()
      .then((d) => active && applySetup(d))
      .catch((e) => active && setLoadError(errorMessage(e, 'Gagal memuat data bus.')))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  function retry() {
    setLoadError('');
    setLoading(true);
    fetchSetup()
      .then(applySetup)
      .catch((e) => setLoadError(errorMessage(e, 'Gagal memuat data bus.')))
      .finally(() => setLoading(false));
  }

  const bus = fleet.find((b) => b.bus_id === busId);
  // Halte yang bisa dipilih = halte di rute bus yang sedang dipilih.
  const stops = bus ? (stopsByRoute[bus.route_id] ?? []) : [];
  const stopName = stops.find((s) => s.id === stopId)?.name ?? '-';

  // Mengganti data satu bus di daftar dengan data terbaru dari ApiService.
  function updateBus(updated: Bus) {
    setFleet((list) => list.map((b) => (b.bus_id === updated.bus_id ? updated : b)));
  }

  async function handleBoarding() {
    if (!bus) return;
    setActionError('');
    setBusy(true);
    try {
      const res = await postBoarding(bus.bus_id, stopId);
      updateBus(res.bus);
      setLastEvent(`Kartu ${res.card} naik di ${stopName}.`);
    } catch (e) {
      setActionError(errorMessage(e, 'Gagal mencatat penumpang naik.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleAlighting() {
    if (!bus) return;
    setActionError('');
    // Validasi form dulu, baru kirim.
    const msg = validateAlighting(alightText, bus.passengers);
    setFormError(msg);
    if (msg) return;

    const count = Number(alightText.trim());
    setBusy(true);
    try {
      const res = await postAlighting(bus.bus_id, stopId, count);
      updateBus(res.bus);
      setLastEvent(`${count} penumpang turun di ${stopName}.`);
      setAlightText('');
    } catch (e) {
      setActionError(errorMessage(e, 'Gagal mencatat penumpang turun.'));
    } finally {
      setBusy(false);
    }
  }

  // --- Tampilan ---
  if (user?.role !== 'operator') {
    return (
      <ThemedView style={[styles.flex, styles.center]}>
        <ThemedText themeColor="textSecondary">Halaman ini khusus operator.</ThemedText>
      </ThemedView>
    );
  }

  if (loading) {
    return (
      <ThemedView style={[styles.flex, styles.center]}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  if (loadError) {
    return (
      <ThemedView style={[styles.flex, styles.center]}>
        <ThemedText style={styles.errorText}>{loadError}</ThemedText>
        <Pressable onPress={retry} style={styles.button}>
          <ThemedText style={styles.buttonText}>Coba lagi</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  if (fleet.length === 0) {
    return (
      <ThemedView style={[styles.flex, styles.center]}>
        <ThemedText themeColor="textSecondary">Belum ada bus untuk disimulasikan.</ThemedText>
      </ThemedView>
    );
  }

  const color = bus ? STATUS_COLOR[bus.status] : '#555';

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <ThemedText type="subtitle">Simulator perangkat bus</ThemedText>

            <View style={styles.demoBanner}>
              <ThemedText style={styles.demoText}>
                Hanya untuk demo, menggantikan tombol dan pembaca kartu di bus.
              </ThemedText>
            </View>

            <ThemedText type="smallBold">Pilih bus</ThemedText>
            <View style={styles.chipRow}>
              {fleet.map((b) => (
                <Chip
                  key={b.bus_id}
                  label={`${b.bus_id} (${b.route_id})`}
                  active={b.bus_id === busId}
                  onPress={() => {
                    setBusId(b.bus_id);
                    // Ganti ke halte pertama rute bus ini kalau halte sekarang tidak dilewati.
                    const routeStops = stopsByRoute[b.route_id] ?? [];
                    if (!routeStops.some((st) => st.id === stopId)) {
                      setStopId(routeStops[0]?.id ?? '');
                    }
                    setFormError('');
                    setActionError('');
                  }}
                />
              ))}
            </View>

            <ThemedText type="smallBold">Halte saat ini</ThemedText>
            <View style={styles.chipRow}>
              {stops.map((s) => (
                <Chip
                  key={s.id}
                  label={s.name}
                  active={s.id === stopId}
                  onPress={() => setStopId(s.id)}
                />
              ))}
            </View>

            {bus && (
              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText type="small" themeColor="textSecondary">
                  Okupansi {bus.bus_id}
                </ThemedText>
                <ThemedText style={[styles.occupancy, { color }]}>
                  {bus.passengers}/{bus.capacity} · {bus.status}
                </ThemedText>
                <View style={[styles.barTrack, { backgroundColor: theme.backgroundSelected }]}>
                  <View
                    style={[styles.barFill, { width: `${Math.min(100, bus.percent)}%`, backgroundColor: color }]}
                  />
                </View>
              </ThemedView>
            )}

            {/* Pembaca kartu: satu tap = satu penumpang naik */}
            <Pressable
              onPress={handleBoarding}
              disabled={busy || !bus}
              style={({ pressed }) => [styles.button, (pressed || busy) && styles.dim]}>
              {busy ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <ThemedText style={styles.buttonText}>Tap naik</ThemedText>
              )}
            </Pressable>

            {/* Tombol turun: jumlah penumpang yang turun di halte ini */}
            <ThemedText type="smallBold">Jumlah turun</ThemedText>
            <View style={styles.alightRow}>
              <TextInput
                style={[
                  styles.input,
                  {
                    color: theme.text,
                    backgroundColor: theme.backgroundElement,
                    borderColor: formError ? '#D93025' : theme.backgroundSelected,
                  },
                ]}
                value={alightText}
                onChangeText={(t) => {
                  setAlightText(t);
                  if (formError) setFormError('');
                }}
                placeholder="mis. 3"
                placeholderTextColor={theme.textSecondary}
                keyboardType="number-pad"
                editable={!busy}
                onSubmitEditing={handleAlighting}
              />
              <Pressable
                onPress={handleAlighting}
                disabled={busy || !bus}
                style={({ pressed }) => [
                  styles.button,
                  styles.alightButton,
                  (pressed || busy) && styles.dim,
                ]}>
                <ThemedText style={styles.buttonText}>Turun</ThemedText>
              </Pressable>
            </View>
            {!!formError && <ThemedText style={styles.fieldError}>{formError}</ThemedText>}

            {!!actionError && (
              <View style={styles.errorBox}>
                <ThemedText style={styles.errorBoxText}>{actionError}</ThemedText>
              </View>
            )}

            {!!lastEvent && !actionError && (
              <ThemedText type="small" themeColor="textSecondary">
                Terakhir: {lastEvent}
              </ThemedText>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  content: {
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  demoBanner: {
    backgroundColor: '#FFF4D6',
    borderColor: '#E8A200',
    borderWidth: 1,
    borderRadius: 8,
    padding: Spacing.three,
  },
  demoText: { color: '#7A5600', fontSize: 14, lineHeight: 20, fontWeight: 600 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { borderRadius: 16, paddingVertical: Spacing.one + 2, paddingHorizontal: Spacing.three },
  chipTextActive: { color: '#ffffff' },
  card: { borderRadius: 12, padding: Spacing.three, gap: Spacing.two },
  occupancy: { fontSize: 28, lineHeight: 36, fontWeight: 700 },
  barTrack: { height: 10, borderRadius: 5, overflow: 'hidden' },
  barFill: { height: 10, borderRadius: 5 },
  button: {
    backgroundColor: '#1E6FE8',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#ffffff', fontWeight: 700 },
  dim: { opacity: 0.7 },
  alightRow: { flexDirection: 'row', gap: Spacing.two },
  alightButton: { backgroundColor: '#E8A200' },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
    fontSize: 16,
  },
  fieldError: { color: '#D93025', fontSize: 13, lineHeight: 18 },
  errorText: { color: '#B3261E', textAlign: 'center', paddingHorizontal: Spacing.four },
  errorBox: { backgroundColor: '#FDECEA', borderRadius: 8, padding: Spacing.three },
  errorBoxText: { color: '#B3261E', fontSize: 14, lineHeight: 20 },
});
