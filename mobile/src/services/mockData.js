// Data contoh (mock) untuk bis.in. Hanya dipakai oleh mockServer.js (backend pura-pura)
// selama USE_MOCK = true di ApiService.js. Kalau backend sudah siap, file ini tidak dipakai lagi.

import ROUTE_PATHS from './mockRoutePaths.json';

// Akun contoh untuk 2 peran. Password polos HANYA boleh ada di data contoh seperti ini.
export const MOCK_USERS = [
  {
    id: 'u1',
    name: 'Budi Penumpang',
    email: 'penumpang@bisin.id',
    password: 'penumpang123',
    role: 'penumpang',
  },
  {
    id: 'u3',
    name: 'Andi Operator',
    email: 'operator@bisin.id',
    password: 'operator123',
    role: 'operator',
  },
];

// ---------------------------------------------------------------------------
// Data analitik untuk operator (contoh).
// boardings = jumlah penumpang naik, alightings = jumlah penumpang turun.
// ---------------------------------------------------------------------------
export const MOCK_ANALYTICS_STOPS = [
  { stop_id: 'S1', name: 'Terminal Leuwipanjang', boardings: 1240, alightings: 1105 },
  { stop_id: 'S3', name: 'Alun-Alun Bandung', boardings: 980, alightings: 1020 },
  { stop_id: 'S4', name: 'Stasiun Bandung', boardings: 1320, alightings: 1180 },
  { stop_id: 'S5', name: 'Dipatiukur', boardings: 610, alightings: 702 },
  { stop_id: 'S2', name: 'Terminal Tegalega', boardings: 455, alightings: 390 },
];

export const MOCK_ANALYTICS_CORRIDORS = [
  { route_id: 'K1', boardings: 2310, alightings: 2204, busiest_stop: 'Stasiun Bandung' },
  { route_id: 'K2', boardings: 1480, alightings: 1395, busiest_stop: 'Alun-Alun Bandung' },
  { route_id: 'K3', boardings: 815, alightings: 798, busiest_stop: 'Terminal Cicaheum' },
];

// Pola per jam: puncak pagi (jam 7) dan puncak sore (jam 17), sepi tengah malam.
const HOURLY_BOARDINGS = [
  2, 0, 0, 0, 5, 40, 150, 320, 260, 140, 110, 130,
  170, 150, 120, 140, 230, 340, 290, 160, 90, 50, 20, 8,
];
export const MOCK_ANALYTICS_HOURLY = {
  by_hour: HOURLY_BOARDINGS.map((boardings, hour) => ({
    hour,
    boardings,
    alightings: Math.round(boardings * 0.93),
  })),
};

// ---------------------------------------------------------------------------
// Peta & kedatangan bus.
// Halte dan garis rute ada di mockRoutePaths.json. File itu DIBUAT SEKALI dari
// OSRM (layanan routing berbasis OpenStreetMap) supaya garis mengikuti jalan.
// Lokasinya perkiraan, nanti diganti data dari backend.
// ---------------------------------------------------------------------------
export const MOCK_STOPS = Object.values(ROUTE_PATHS.stops); // [{ id, name, lat, lng }]

// Rute melingkar. path & stop_index (posisi tiap halte di path) dari mockRoutePaths.json.
export const MOCK_ROUTES = {
  K1: {
    route_id: 'K1',
    name: 'Leuwipanjang – Dipatiukur',
    color: '#1E6FE8',
    destination: 'Dipatiukur',
    stop_ids: ['S1', 'S2', 'S3', 'S4', 'S5'],
    ...ROUTE_PATHS.routes.K1,
  },
  K2: {
    route_id: 'K2',
    name: 'Alun-Alun – Cicaheum',
    color: '#8E44D9',
    destination: 'Terminal Cicaheum',
    stop_ids: ['S3', 'S4', 'S6', 'S7'],
    ...ROUTE_PATHS.routes.K2,
  },
};

// Armada bus. Jumlah penumpang bisa berubah (lewat simulator perangkat bus).
// offset = posisi awal bus di sepanjang rute (0..1).
export const MOCK_FLEET = [
  { bus_id: 'BDG-101', plate: 'D 7101 AB', route_id: 'K1', passengers: 12, capacity: 40, offset: 0.05 },
  { bus_id: 'BDG-102', plate: 'D 7102 AB', route_id: 'K1', passengers: 28, capacity: 40, offset: 0.4 },
  { bus_id: 'BDG-103', plate: 'D 7103 AB', route_id: 'K1', passengers: 38, capacity: 40, offset: 0.72 },
  { bus_id: 'BDG-201', plate: 'D 7201 CD', route_id: 'K2', passengers: 21, capacity: 40, offset: 0.15 },
  { bus_id: 'BDG-202', plate: 'D 7202 CD', route_id: 'K2', passengers: 6, capacity: 40, offset: 0.6 },
];
