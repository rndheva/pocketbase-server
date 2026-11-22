// ===========================================================================
// BACKEND PURA-PURA
// ---------------------------------------------------------------------------
// Semua yang di file ini seharusnya dikerjakan BACKEND sungguhan:
// menyimpan data, menghitung posisi bus, ETA, status kepadatan, dsb.
// Aplikasi hanya memakainya selama USE_MOCK = true di ApiService.js.
// Kalau semua fitur sudah tersambung ke backend, file ini (dan mockData.js +
// mockRoutePaths.json) boleh dihapus.
// ===========================================================================

import { ApiError } from './apiError';
import {
  MOCK_ANALYTICS_CORRIDORS,
  MOCK_ANALYTICS_HOURLY,
  MOCK_ANALYTICS_STOPS,
  MOCK_FLEET,
  MOCK_ROUTES,
  MOCK_STOPS,
  MOCK_USERS,
} from './mockData';

// Pura-pura "menunggu server" supaya loading terlihat.
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Kecepatan bus dalam simulasi (km/jam). Waktu simulasi = waktu nyata.
const SPEED_KMH = 30;

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------
export async function login(email, password) {
  await wait(800);
  const found = MOCK_USERS.find(
    (u) => u.email.toLowerCase() === (email ?? '').trim().toLowerCase() && u.password === password,
  );
  if (!found) throw new ApiError('Email atau kata sandi salah.', 401);
  const { password: _hidden, ...user } = found; // jangan kirim password ke aplikasi
  return { token: `mock-token-${user.id}`, user };
}

// ---------------------------------------------------------------------------
// Status kepadatan
// ---------------------------------------------------------------------------
export function occupancyStatus(passengers, capacity) {
  // Sama persis dengan backend: persen 1 desimal, lalu
  // low <40%, light 40–<70%, medium 70–<100%, high >=100%
  const exact = capacity > 0 ? Math.round((passengers / capacity) * 1000) / 10 : 0;
  const percent = Math.round(exact);
  if (exact < 40) return { percent, status: 'low' };
  if (exact < 70) return { percent, status: 'light' };
  if (exact < 100) return { percent, status: 'medium' };
  return { percent, status: 'high' };
}

function busSummary(b) {
  return {
    bus_id: b.bus_id,
    plate: b.plate,
    route_id: b.route_id,
    passengers: b.passengers,
    capacity: b.capacity,
    ...occupancyStatus(b.passengers, b.capacity),
  };
}

function findBus(busId) {
  const bus = MOCK_FLEET.find((b) => b.bus_id === busId);
  if (!bus) throw new ApiError('Bus tidak ditemukan.', 404);
  return bus;
}

// Daftar bus untuk layar "Keterisian Bus".
export async function getBuses() {
  await wait(500);
  return MOCK_FLEET.map((b) => ({
    id: b.bus_id,
    plate: `${b.plate} · ${b.bus_id}`,
    route: `${b.route_id}: ${MOCK_ROUTES[b.route_id]?.name ?? ''}`,
    occupancy: b.passengers,
    capacity: b.capacity,
    status: occupancyStatus(b.passengers, b.capacity).status,
  }));
}

// ---------------------------------------------------------------------------
// Analitik
// ---------------------------------------------------------------------------
export async function getAnalyticsStops() {
  await wait(600);
  return [...MOCK_ANALYTICS_STOPS].sort((a, b) => b.boardings - a.boardings);
}

export async function getAnalyticsCorridors() {
  await wait(600);
  return MOCK_ANALYTICS_CORRIDORS;
}

export async function getAnalyticsHourly() {
  await wait(600);
  return MOCK_ANALYTICS_HOURLY;
}

// ---------------------------------------------------------------------------
// Simulasi posisi bus (di sistem nyata: dari GPS perangkat bus)
// ---------------------------------------------------------------------------

// Jarak dua titik (km) dengan rumus haversine.
function distanceKm([lat1, lng1], [lat2, lng2]) {
  const rad = (d) => (d * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Hasil hitungan per rute disimpan supaya tidak dihitung ulang tiap 5 detik.
const routeCache = {};

function buildRoute(routeId) {
  if (routeCache[routeId]) return routeCache[routeId];
  const route = MOCK_ROUTES[routeId];
  if (!route) throw new ApiError(`Rute ${routeId} tidak ditemukan.`, 404);
  const stops = route.stop_ids.map((id) => MOCK_STOPS.find((s) => s.id === id));
  const { path, stop_index } = route;
  const cum = [0]; // cum[i] = jarak dari awal path ke titik ke-i (km)
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + distanceKm(path[i - 1], path[i]));
  const total = cum[cum.length - 1];
  const loopMs = (total / SPEED_KMH) * 3600 * 1000; // lama satu putaran
  const stopKm = stop_index.map((i) => cum[i]); // posisi tiap halte di sepanjang path
  routeCache[routeId] = { route, stops, path, cum, total, loopMs, stopKm };
  return routeCache[routeId];
}

// Jarak bus dari awal path (km) pada waktu "now".
function busKm(bus, r, now) {
  return ((bus.offset + now / r.loopMs) % 1) * r.total;
}

// Arah hadap (derajat dari utara, searah jarum jam) dari titik a ke titik b.
function bearing([lat1, lng1], [lat2, lng2]) {
  const dx = (lng2 - lng1) * Math.cos((lat1 * Math.PI) / 180);
  const dy = lat2 - lat1;
  return Math.round(((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360);
}

// Mengubah jarak di sepanjang path menjadi { lat, lng, heading } (pencarian biner).
function pointAt(r, km) {
  const { path, cum } = r;
  let lo = 1;
  let hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < km) lo = mid + 1;
    else hi = mid;
  }
  const seg = cum[lo] - cum[lo - 1] || 1;
  const t = Math.min(1, Math.max(0, (km - cum[lo - 1]) / seg));
  return {
    lat: path[lo - 1][0] + (path[lo][0] - path[lo - 1][0]) * t,
    lng: path[lo - 1][1] + (path[lo][1] - path[lo - 1][1]) * t,
    heading: bearing(path[lo - 1], path[lo]),
  };
}

export async function getRoutes() {
  await wait(300);
  return Object.values(MOCK_ROUTES).map((r) => ({
    route_id: r.route_id,
    name: r.name,
    color: r.color,
    destination: r.destination,
  }));
}

export async function getRouteGeometry(routeId) {
  await wait(500);
  const { stops, path } = buildRoute(routeId);
  return { stops, path };
}

export async function getBusPositions(routeId) {
  await wait(300);
  const r = buildRoute(routeId);
  const now = Date.now();
  return MOCK_FLEET.filter((b) => b.route_id === routeId).map((b) => {
    const { lat, lng, heading } = pointAt(r, busKm(b, r, now));
    const { status } = occupancyStatus(b.passengers, b.capacity);
    return {
      bus_id: b.bus_id,
      route_id: b.route_id,
      lat,
      lng,
      heading,
      status,
      passengers: b.passengers,
      capacity: b.capacity,
    };
  });
}

export async function getArrivals(stopId) {
  await wait(400);
  if (!MOCK_STOPS.some((s) => s.id === stopId)) throw new ApiError('Halte tidak ditemukan.', 404);
  const now = Date.now();
  const result = [];
  for (const routeId of Object.keys(MOCK_ROUTES)) {
    const r = buildRoute(routeId);
    const idx = r.route.stop_ids.indexOf(stopId);
    if (idx === -1) continue;
    for (const b of MOCK_FLEET.filter((f) => f.route_id === routeId)) {
      const aheadKm = (r.stopKm[idx] - busKm(b, r, now) + r.total) % r.total;
      result.push({
        bus_id: b.bus_id,
        route_id: routeId,
        eta_minutes: Math.round((aheadKm / SPEED_KMH) * 60),
        destination: r.route.destination,
        passengers: b.passengers,
        capacity: b.capacity,
        ...occupancyStatus(b.passengers, b.capacity),
      });
    }
  }
  return result.sort((a, b) => a.eta_minutes - b.eta_minutes);
}

// ---------------------------------------------------------------------------
// Perangkat bus (di sistem nyata: tombol turun + pembaca kartu di bus)
// ---------------------------------------------------------------------------
export async function getFleet() {
  await wait(400);
  return MOCK_FLEET.map(busSummary);
}

export async function postBoarding(busId, stopId) {
  await wait(400);
  const bus = findBus(busId);
  if (bus.passengers >= bus.capacity) {
    throw new ApiError('Bus sudah penuh, penumpang tidak bisa naik.', 409);
  }
  bus.passengers += 1;
  const last4 = String(Math.floor(1000 + Math.random() * 9000));
  return { bus: busSummary(bus), card: `•••• ${last4}`, stop_id: stopId };
}

export async function postAlighting(busId, stopId, count) {
  await wait(400);
  const bus = findBus(busId);
  if (!Number.isInteger(count) || count < 1) {
    throw new ApiError('Jumlah turun harus bilangan bulat minimal 1.', 400);
  }
  if (count > bus.passengers) {
    throw new ApiError(`Jumlah turun melebihi penumpang di bus (${bus.passengers}).`, 400);
  }
  bus.passengers -= count;
  return { bus: busSummary(bus), stop_id: stopId };
}
