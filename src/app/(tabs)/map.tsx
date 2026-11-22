import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LeafletMap } from '@/components/map/leaflet-map';
import {
  STATUS_COLOR,
  type BusPosition,
  type BusStatus,
  type LatLng,
  type MapRoute,
  type RouteGeometry,
  type Stop,
} from '@/components/map/map-html';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  ApiError,
  getArrivals,
  getBusPositions,
  getRouteGeometry,
  getRoutes,
} from '@/services/ApiService';

const POLL_MS = 5000; // posisi bus diperbarui tiap 5 detik
const BAR_HEIGHT = 52; // tinggi bilah atas
const BLUE = '#1A73E8';
const GREEN = '#0F7B3F';

type Route = { route_id: string; name: string; color: string; destination: string };
type Arrival = {
  bus_id: string;
  route_id: string;
  eta_minutes: number;
  destination: string;
  passengers: number;
  capacity: number;
  percent: number;
  status: BusStatus;
};

function errorMessage(e: unknown, fallback: string) {
  return e instanceof ApiError ? e.message : fallback;
}

// Mengambil daftar rute + geometri semua rute sekaligus.
async function fetchRoutes() {
  const routes: Route[] = await getRoutes();
  const geometries: RouteGeometry[] = await Promise.all(
    routes.map((r) => getRouteGeometry(r.route_id)),
  );
  const mapRoutes: MapRoute[] = routes.map((r, i) => ({
    route_id: r.route_id,
    color: r.color,
    ...geometries[i],
  }));
  return { routes, mapRoutes };
}

function RouteBadge({ id, color }: { id: string; color: string }) {
  return (
    <View style={[styles.routeBadge, { backgroundColor: color }]}>
      <ThemedText style={styles.routeBadgeText}>{id}</ThemedText>
    </View>
  );
}

// Ikon target (tombol lokasi), dibuat dari View.
function TargetIcon({ color }: { color: string }) {
  return (
    <View style={styles.targetWrap}>
      <View style={[styles.tick, styles.tickTop, { backgroundColor: color }]} />
      <View style={[styles.tick, styles.tickBottom, { backgroundColor: color }]} />
      <View style={[styles.tick, styles.tickLeft, { backgroundColor: color }]} />
      <View style={[styles.tick, styles.tickRight, { backgroundColor: color }]} />
      <View style={[styles.targetRing, { borderColor: color }]}>
        <View style={[styles.targetDot, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

// Satu baris di daftar "Bus arrival".
function ArrivalRow({ item, route }: { item: Arrival; route?: Route }) {
  const color = STATUS_COLOR[item.status] ?? '#555';
  return (
    <View style={styles.arrivalRow}>
      <RouteBadge id={item.route_id} color={route?.color ?? '#555'} />
      <View style={styles.flex}>
        <ThemedText type="smallBold">{item.bus_id}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Tujuan {item.destination}
        </ThemedText>
        <View style={[styles.chip, { backgroundColor: color + '1A', borderColor: color }]}>
          <ThemedText style={[styles.chipText, { color }]}>
            {item.passengers}/{item.capacity} · {item.status}
          </ThemedText>
        </View>
      </View>
      <ThemedText type="smallBold" style={styles.eta}>
        {item.eta_minutes === 0 ? 'Tiba' : `${item.eta_minutes} Min`}
      </ThemedText>
    </View>
  );
}

export default function MapScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  // Tinggi area bawah yang tertutup tab bar (termasuk area aman iPhone).
  const bottomUi = insets.bottom + BottomTabInset;
  // Bilah atas diletakkan di bawah status bar (jam, sinyal, baterai).
  const barTop = insets.top + Spacing.two;
  const belowBar = barTop + BAR_HEIGHT + Spacing.two;

  const [routes, setRoutes] = useState<Route[]>([]);
  const [mapRoutes, setMapRoutes] = useState<MapRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [selected, setSelected] = useState<string | null>(null); // null = semua rute
  const [pickerOpen, setPickerOpen] = useState(false);

  const [buses, setBuses] = useState<BusPosition[]>([]);
  const [busError, setBusError] = useState('');

  const [myLocation, setMyLocation] = useState<LatLng | null>(null);
  const [centerKey, setCenterKey] = useState(0);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState('');
  const watchRef = useRef<Location.LocationSubscription | null>(null);

  const [stop, setStop] = useState<Stop | null>(null);
  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  const [arrLoading, setArrLoading] = useState(false);
  const [arrError, setArrError] = useState('');

  const selectedRoute = routes.find((r) => r.route_id === selected);

  // 1. Rute + geometri semua rute.
  useEffect(() => {
    let active = true;
    fetchRoutes()
      .then((d) => {
        if (!active) return;
        setRoutes(d.routes);
        setMapRoutes(d.mapRoutes);
      })
      .catch((e) => active && setLoadError(errorMessage(e, 'Gagal memuat rute.')))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  function retry() {
    setLoadError('');
    setLoading(true);
    fetchRoutes()
      .then((d) => {
        setRoutes(d.routes);
        setMapRoutes(d.mapRoutes);
      })
      .catch((e) => setLoadError(errorMessage(e, 'Gagal memuat rute.')))
      .finally(() => setLoading(false));
  }

  // 2. Polling posisi bus tiap 5 detik (rute terpilih, atau semua rute).
  useEffect(() => {
    if (routes.length === 0) return;
    const ids = selected ? [selected] : routes.map((r) => r.route_id);
    let active = true;
    const poll = () =>
      Promise.all(ids.map((id) => getBusPositions(id)))
        .then((lists) => {
          if (!active) return;
          setBuses(lists.flat());
          setBusError('');
        })
        .catch((e) => active && setBusError(errorMessage(e, 'Gagal memperbarui posisi bus.')));
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [routes, selected]);

  function chooseRoute(id: string | null) {
    setPickerOpen(false);
    if (id === selected) return;
    setStop(null);
    setBuses([]);
    setSelected(id);
  }

  // 3. Tombol lokasi: minta izin, ambil lokasi, lalu ikuti perubahan lokasi.
  async function handleLocate() {
    setPickerOpen(false);
    setLocError('');
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setLocError('Izin lokasi ditolak. Aktifkan di pengaturan HP.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setMyLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setCenterKey((k) => k + 1);
      if (!watchRef.current) {
        watchRef.current = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 15 },
          (p) => setMyLocation({ lat: p.coords.latitude, lng: p.coords.longitude }),
        );
      }
    } catch {
      setLocError('Lokasi tidak bisa didapat. Pastikan GPS aktif.');
    } finally {
      setLocating(false);
    }
  }

  // Berhenti mengikuti lokasi saat layar ditutup.
  useEffect(() => {
    return () => {
      watchRef.current?.remove();
      watchRef.current = null;
    };
  }, []);

  // 4. Halte diketuk -> buka bottom sheet.
  const handleStopPress = useCallback(
    (stopId: string) => {
      const found = mapRoutes.flatMap((r) => r.stops).find((s) => s.id === stopId);
      if (!found) return;
      setPickerOpen(false);
      setStop(found);
      setArrivals([]);
      setArrError('');
      setArrLoading(true);
    },
    [mapRoutes],
  );

  // 5. Selama bottom sheet terbuka, kedatangan ikut diperbarui tiap 5 detik.
  useEffect(() => {
    if (!stop) return;
    let active = true;
    const load = () =>
      getArrivals(stop.id)
        .then((list) => {
          if (!active) return;
          setArrivals(list);
          setArrError('');
        })
        .catch((e) => active && setArrError(errorMessage(e, 'Gagal memuat kedatangan bus.')))
        .finally(() => active && setArrLoading(false));
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [stop]);

  // --- Tampilan ---
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
        <Pressable onPress={retry} style={styles.retry}>
          <ThemedText style={styles.retryText}>Coba lagi</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }
  if (mapRoutes.length === 0) {
    return (
      <ThemedView style={[styles.flex, styles.center]}>
        <ThemedText themeColor="textSecondary">Belum ada data rute.</ThemedText>
      </ThemedView>
    );
  }

  const notice = busError || locError || (buses.length === 0 ? 'Belum ada bus di rute ini.' : '');

  return (
    <ThemedView style={styles.flex}>
      <View style={styles.flex}>
        <LeafletMap
          routes={mapRoutes}
          selectedRouteId={selected}
          buses={buses}
          myLocation={myLocation}
          centerKey={centerKey}
          onStopPress={handleStopPress}
          topInset={belowBar}
          bottomInset={bottomUi}
        />

        {/* Bilah atas ala MitraDarat: kotak "Select Route" + tombol lokasi */}
        <View style={[styles.topBar, { top: barTop }]}>
          <Pressable
            onPress={() => setPickerOpen((o) => !o)}
            style={[styles.card, styles.selector]}
            accessibilityRole="button"
            accessibilityLabel="Pilih rute">
            <View style={styles.caret} />
            {selectedRoute ? (
              <>
                <RouteBadge id={selectedRoute.route_id} color={selectedRoute.color} />
                <ThemedText numberOfLines={1} style={[styles.flex, styles.selectorText]}>
                  {selectedRoute.name}
                </ThemedText>
              </>
            ) : (
              <ThemedText numberOfLines={1} style={[styles.flex, styles.placeholder]}>
                Select Route
              </ThemedText>
            )}
            <View style={[styles.chevron, pickerOpen ? styles.chevronUp : styles.chevronDown]} />
          </Pressable>
          <Pressable
            onPress={handleLocate}
            disabled={locating}
            style={[styles.card, styles.locate]}
            accessibilityRole="button"
            accessibilityLabel="Lokasi saya">
            {locating ? <ActivityIndicator color={GREEN} /> : <TargetIcon color={GREEN} />}
          </Pressable>
        </View>

        {pickerOpen && (
          <View style={[styles.card, styles.dropdown, { top: belowBar }]}>
            <Pressable
              onPress={() => chooseRoute(null)}
              style={[styles.dropdownItem, selected === null && styles.dropdownActive]}>
              <View style={styles.allSwatch}>
                {routes.map((r) => (
                  <View key={r.route_id} style={[styles.swatchLine, { backgroundColor: r.color }]} />
                ))}
              </View>
              <ThemedText style={[styles.flex, styles.dropdownText]}>Semua rute</ThemedText>
            </Pressable>
            {routes.map((r) => (
              <Pressable
                key={r.route_id}
                onPress={() => chooseRoute(r.route_id)}
                style={[styles.dropdownItem, r.route_id === selected && styles.dropdownActive]}>
                <RouteBadge id={r.route_id} color={r.color} />
                <View style={styles.flex}>
                  <ThemedText style={styles.dropdownText}>{r.name}</ThemedText>
                  <ThemedText style={styles.dropdownSub}>Tujuan {r.destination}</ThemedText>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {/* Pesan kecil di bawah bilah atas (tidak menutup peta) */}
        {!pickerOpen && !!notice && (
          <View style={[styles.banner, { top: belowBar }]} pointerEvents="none">
            <ThemedText style={styles.bannerText}>{notice}</ThemedText>
          </View>
        )}

        {!stop && !pickerOpen && (
          <View style={[styles.hint, { bottom: bottomUi + Spacing.three }]} pointerEvents="none">
            <ThemedText type="small" style={styles.hintText}>
              {selected ? 'Ketuk halte untuk melihat bus yang akan tiba' : 'Pilih rute untuk melihat halte'}
            </ThemedText>
          </View>
        )}

        {/* Bottom sheet "Bus arrival" */}
        {stop && (
          <ThemedView style={[styles.sheet, { paddingBottom: bottomUi + Spacing.three }]}>
            <View style={[styles.grabber, { backgroundColor: theme.backgroundSelected }]} />
            <View style={styles.sheetHeader}>
              <View style={styles.flex}>
                <ThemedText type="smallBold">Bus arrival</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {stop.name}
                </ThemedText>
              </View>
              <Pressable onPress={() => setStop(null)} hitSlop={12}>
                <ThemedText type="smallBold" style={styles.close}>
                  Tutup
                </ThemedText>
              </Pressable>
            </View>

            {arrLoading ? (
              <ActivityIndicator style={styles.sheetState} />
            ) : arrError ? (
              <ThemedText style={[styles.errorText, styles.sheetState]}>{arrError}</ThemedText>
            ) : (
              <FlatList
                data={arrivals}
                keyExtractor={(a) => `${a.route_id}-${a.bus_id}`}
                renderItem={({ item }) => (
                  <ArrivalRow item={item} route={routes.find((r) => r.route_id === item.route_id)} />
                )}
                ItemSeparatorComponent={() => (
                  <View style={[styles.separator, { backgroundColor: theme.backgroundSelected }]} />
                )}
                ListEmptyComponent={
                  <ThemedText themeColor="textSecondary" style={styles.sheetState}>
                    Belum ada bus menuju halte ini.
                  </ThemedText>
                }
              />
            )}
          </ThemedView>
        )}
      </View>
    </ThemedView>
  );
}

const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.12,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 2 },
  elevation: 4,
} as const;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  errorText: { color: '#B3261E', textAlign: 'center', paddingHorizontal: Spacing.four },
  retry: {
    backgroundColor: BLUE,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: Spacing.five,
  },
  retryText: { color: '#ffffff', fontWeight: 700 },

  // Bilah atas (kartu putih tetap putih walau mode gelap, seperti MitraDarat)
  topBar: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    height: BAR_HEIGHT,
    flexDirection: 'row',
    gap: Spacing.two,
  },
  card: { backgroundColor: '#ffffff', borderRadius: 8, ...shadow },
  selector: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.three,
  },
  caret: { width: 2, height: 22, backgroundColor: BLUE, borderRadius: 1 },
  placeholder: { color: '#8A94A6', fontSize: 17, fontWeight: 500 },
  selectorText: { color: '#202124', fontSize: 15, fontWeight: 600 },
  // Chevron digambar dari dua sisi border yang diputar.
  chevron: {
    width: 9,
    height: 9,
    borderRightWidth: 2.5,
    borderBottomWidth: 2.5,
    borderColor: BLUE,
    marginHorizontal: Spacing.one,
  },
  chevronDown: { transform: [{ rotate: '45deg' }], marginTop: -4 },
  chevronUp: { transform: [{ rotate: '-135deg' }], marginTop: 4 },
  locate: { width: BAR_HEIGHT, alignItems: 'center', justifyContent: 'center' },

  targetWrap: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  targetRing: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetDot: { width: 8, height: 8, borderRadius: 4 },
  tick: { position: 'absolute', borderRadius: 1 },
  tickTop: { top: 0, width: 2.5, height: 6 },
  tickBottom: { bottom: 0, width: 2.5, height: 6 },
  tickLeft: { left: 0, width: 6, height: 2.5 },
  tickRight: { right: 0, width: 6, height: 2.5 },

  dropdown: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    paddingVertical: Spacing.one,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  dropdownActive: { backgroundColor: '#EEF3FD' },
  dropdownText: { color: '#202124', fontSize: 15, fontWeight: 600 },
  dropdownSub: { color: '#5F6368', fontSize: 13, lineHeight: 18 },
  allSwatch: { width: 32, gap: 3 },
  swatchLine: { height: 4, borderRadius: 2 },

  banner: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    backgroundColor: '#FDECEA',
    borderRadius: 8,
    padding: Spacing.two,
  },
  bannerText: { color: '#B3261E', fontSize: 13, lineHeight: 18, textAlign: 'center' },
  hint: {
    position: 'absolute',
    alignSelf: 'center',
    borderRadius: 20,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    backgroundColor: 'rgba(32,33,36,0.85)',
  },
  hintText: { color: '#ffffff' },

  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '60%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: Spacing.two,
    paddingHorizontal: Spacing.three,
    ...shadow,
  },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: Spacing.two },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.two },
  close: { color: BLUE },
  sheetState: { marginVertical: Spacing.four, textAlign: 'center' },
  arrivalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  routeBadge: {
    borderRadius: 6,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    minWidth: 32,
    alignItems: 'center',
  },
  routeBadgeText: { color: '#ffffff', fontWeight: 700, fontSize: 13, lineHeight: 18 },
  chip: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.two,
    marginTop: Spacing.one,
  },
  chipText: { fontSize: 12, lineHeight: 18, fontWeight: 600 },
  eta: { fontSize: 16 },
  separator: { height: StyleSheet.hairlineWidth },
});
