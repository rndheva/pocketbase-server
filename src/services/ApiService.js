// Satu-satunya pintu untuk semua panggilan jaringan di aplikasi.
// Layar TIDAK boleh memanggil fetch sendiri, harus lewat file ini.
//
// Backend (PocketBase) disambungkan satu fitur per satu fitur:
// - USE_MOCK_BUSES = true  -> Daftar Bus memakai data contoh (false = backend di BASE_URL, sudah siap)
// - USE_MOCK = true        -> fitur lain masih dijawab mockServer.js (backend pura-pura)
//   Jangan ubah USE_MOCK ke false dulu: alamat endpoint fitur lain belum disesuaikan.
// File ini hanya menerjemahkan bentuk data backend ke bentuk yang dipakai layar.
// Hitungan (posisi bus, ETA, okupansi) tetap tugas backend.

import { ApiError } from './apiError';
import * as mock from './mockServer';

export { ApiError };

export const USE_MOCK = true;
export const USE_MOCK_BUSES = true;

const BASE_URL = 'https://bisin.stei.fun/api';
const TIMEOUT_MS = 10000;

// Nama kategori di backend -> nama status di aplikasi. Batas persennya milik backend.
const STATUS_FROM_CATEGORY = { lengang: 'low', sedang: 'light', ramai: 'medium', penuh: 'high' };

// Pembungkus fetch untuk mode backend sungguhan.
async function request(path, options = {}) {
  // Batalkan kalau server terlalu lama menjawab, supaya loading tidak berputar selamanya.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response;
  let body = null;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      ...options,
    });
    body = await response.json().catch(() => null); // balasan bukan JSON -> null
  } catch {
    // ditangani di bawah, bersama kasus waktu habis
  } finally {
    clearTimeout(timer);
  }

  if (controller.signal.aborted) {
    throw new ApiError('Server terlalu lama menjawab. Coba lagi.');
  }
  if (!response) {
    throw new ApiError('Tidak bisa terhubung ke server. Periksa koneksi internet kamu.');
  }
  if (response.status === 429) {
    throw new ApiError('Server sedang sibuk. Coba lagi sebentar.', 429);
  }
  if (!response.ok) {
    throw new ApiError(body?.message || 'Terjadi kesalahan pada server.', response.status);
  }
  if (body === null) {
    throw new ApiError('Balasan server tidak bisa dibaca.', response.status);
  }
  return body;
}

const post = (path, data) => request(path, { method: 'POST', body: JSON.stringify(data) });
const id = (value) => encodeURIComponent(value);

// --- Akun ---
// -> { token, user: { id, name, email, role } }
export const login = (email, password) =>
  USE_MOCK ? mock.login(email, password) : post('/auth/login', { email, password });

// --- Daftar bus ---
// -> [{ id, plate, route, occupancy, capacity, status }]
export const getBuses = () => (USE_MOCK_BUSES ? mock.getBuses() : fetchBuses());

// PocketBase menyimpan bus dan okupansi di dua tabel, jadi digabung berdasarkan id bus.
export async function fetchBuses() {
  const [buses, occupancy] = await Promise.all([
    request('/collections/buses/records?expand=route&sort=plate&perPage=500'),
    request('/collections/occupancy/records?perPage=500'),
  ]);
  const occupancyByBus = new Map(occupancy.items.map((o) => [o.bus, o]));

  return buses.items.map((bus) => {
    // Bus yang belum pernah ada penumpang belum punya baris okupansi = kosong (sama seperti backend).
    const occ = occupancyByBus.get(bus.id) ?? { current: 0, category: 'lengang' };
    const route = bus.expand?.route;
    return {
      id: bus.id,
      plate: bus.plate,
      route: route ? `${route.code}: ${route.name}` : 'Rute tidak diketahui',
      occupancy: occ.current,
      capacity: bus.capacity,
      status: STATUS_FROM_CATEGORY[occ.category] ?? occ.category,
    };
  });
}

// --- Analitik operator ---
// -> [{ stop_id, name, boardings, alightings }] urut dari naik terbanyak
export const getAnalyticsStops = () =>
  USE_MOCK ? mock.getAnalyticsStops() : request('/analytics/stops');
// -> [{ route_id, boardings, alightings, busiest_stop }]
export const getAnalyticsCorridors = () =>
  USE_MOCK ? mock.getAnalyticsCorridors() : request('/analytics/corridors');
// -> { by_hour: [{ hour 0-23, boardings, alightings }] }
export const getAnalyticsHourly = () =>
  USE_MOCK ? mock.getAnalyticsHourly() : request('/analytics/hourly');

// --- Peta & kedatangan ---
// -> [{ route_id, name, color, destination }]
export const getRoutes = () => (USE_MOCK ? mock.getRoutes() : request('/routes'));
// -> { stops: [{ id, name, lat, lng }], path: [[lat, lng], ...] }
export const getRouteGeometry = (routeId) =>
  USE_MOCK ? mock.getRouteGeometry(routeId) : request(`/routes/${id(routeId)}/geometry`);
// -> [{ bus_id, route_id, lat, lng, heading (derajat dari utara), status, passengers, capacity }]
export const getBusPositions = (routeId) =>
  USE_MOCK ? mock.getBusPositions(routeId) : request(`/routes/${id(routeId)}/buses`);
// -> [{ bus_id, route_id, eta_minutes, destination, passengers, capacity, percent, status }]
export const getArrivals = (stopId) =>
  USE_MOCK ? mock.getArrivals(stopId) : request(`/stops/${id(stopId)}/arrivals`);

// --- Perangkat bus (simulator demo) ---
// -> [{ bus_id, plate, route_id, passengers, capacity, percent, status }]
export const getFleet = () => (USE_MOCK ? mock.getFleet() : request('/fleet'));
// -> { bus, card: '•••• 1234', stop_id }
export const postBoarding = (busId, stopId) =>
  USE_MOCK
    ? mock.postBoarding(busId, stopId)
    : post('/device/boarding', { bus_id: busId, stop_id: stopId });
// -> { bus, stop_id }
export const postAlighting = (busId, stopId, count) =>
  USE_MOCK
    ? mock.postAlighting(busId, stopId, count)
    : post('/device/alighting', { bus_id: busId, stop_id: stopId, count });

const ApiService = {
  login,
  getBuses,
  getAnalyticsStops,
  getAnalyticsCorridors,
  getAnalyticsHourly,
  getRoutes,
  getRouteGeometry,
  getBusPositions,
  getArrivals,
  getFleet,
  postBoarding,
  postAlighting,
};
export default ApiService;
