// Tes untuk ApiService: mode data contoh, plus Daftar Bus dengan fetch tiruan (tanpa internet).
// Jalankan dengan: npm test

let api;
let mockServer;

// Muat ulang ApiService + mockServer + mockData sebelum setiap tes, supaya perubahan
// jumlah penumpang di satu tes tidak terbawa ke tes lain.
beforeEach(() => {
  jest.resetModules();
  api = require('../ApiService');
  mockServer = require('../mockServer');
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('login', () => {
  it('berhasil dengan akun contoh dan tidak mengirim password ke layar', async () => {
    const res = await api.login('operator@bisin.id', 'operator123');
    expect(res.token).toBeTruthy();
    expect(res.user).toEqual({
      id: 'u3',
      name: 'Andi Operator',
      email: 'operator@bisin.id',
      role: 'operator',
    });
    expect(res.user.password).toBeUndefined();
  });

  it('email tidak peka huruf besar/kecil', async () => {
    const res = await api.login('  PENUMPANG@bisin.id ', 'penumpang123');
    expect(res.user.role).toBe('penumpang');
  });

  it('gagal dengan ApiError 401 kalau kata sandi salah', async () => {
    await expect(api.login('operator@bisin.id', 'salah')).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      message: 'Email atau kata sandi salah.',
    });
  });
});

describe('analitik', () => {
  it('halte diurutkan dari penumpang naik terbanyak', async () => {
    const stops = await api.getAnalyticsStops();
    const naik = stops.map((s) => s.boardings);
    expect(naik).toEqual([...naik].sort((a, b) => b - a));
    expect(stops[0]).toHaveProperty('stop_id');
  });

  it('pola per jam berisi 24 jam (0-23)', async () => {
    const { by_hour } = await api.getAnalyticsHourly();
    expect(by_hour).toHaveLength(24);
    expect(by_hour.map((h) => h.hour)).toEqual([...Array(24).keys()]);
  });
});

describe('occupancyStatus (hitungan backend pura-pura)', () => {
  it.each([
    [0, 40, 'low'],
    [15, 40, 'low'], // 37,5%
    [16, 40, 'light'], // 40%
    [27, 40, 'light'], // 67,5%
    [28, 40, 'medium'], // 70%
    [39, 40, 'medium'], // 97,5%
    [199, 200, 'medium'], // 99,5% belum penuh
    [40, 40, 'high'], // 100%
  ])('%i/%i penumpang -> %s', (penumpang, kapasitas, status) => {
    expect(mockServer.occupancyStatus(penumpang, kapasitas).status).toBe(status);
  });
});

describe('peta & kedatangan', () => {
  it('daftar rute berisi K1 dan K2 lengkap dengan warna', async () => {
    const routes = await api.getRoutes();
    expect(routes.map((r) => r.route_id)).toEqual(['K1', 'K2']);
    for (const r of routes) expect(r.color).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it('geometri rute K1: 5 halte, garis mengikuti jalan, dan setiap halte ada di garis', async () => {
    const { stops, path } = await api.getRouteGeometry('K1');
    expect(stops).toHaveLength(5);
    expect(path.length).toBeGreaterThan(100); // banyak titik = mengikuti jalan, bukan garis lurus
    for (const s of stops) {
      const dekat = path.some(([lat, lng]) => Math.abs(lat - s.lat) < 1e-4 && Math.abs(lng - s.lng) < 1e-4);
      expect(dekat).toBe(true);
    }
  });

  it('rute yang tidak ada -> ApiError 404', async () => {
    await expect(api.getRouteGeometry('K99')).rejects.toMatchObject({ status: 404 });
  });

  it('posisi bus bergerak seiring waktu', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const before = await api.getBusPositions('K1');
    now.mockReturnValue(1_000_000 + 30_000); // 30 detik kemudian
    const after = await api.getBusPositions('K1');
    expect(after[0].bus_id).toBe(before[0].bus_id);
    expect(after[0]).toEqual(
      expect.objectContaining({ passengers: expect.any(Number), capacity: 40 }),
    );
    expect([after[0].lat, after[0].lng]).not.toEqual([before[0].lat, before[0].lng]);
  });

  it('kedatangan diurutkan dari ETA tercepat dan lengkap datanya', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(0);
    const list = await api.getArrivals('S3');
    expect(list.length).toBeGreaterThan(0);
    const eta = list.map((a) => a.eta_minutes);
    expect(eta).toEqual([...eta].sort((a, b) => a - b));
    for (const a of list) {
      expect(a.eta_minutes).toBeGreaterThanOrEqual(0);
      expect(a).toEqual(
        expect.objectContaining({ capacity: 40, status: expect.any(String) }),
      );
    }
    // Alun-Alun (S3) dilewati K1 dan K2
    expect(new Set(list.map((a) => a.route_id))).toEqual(new Set(['K1', 'K2']));
  });

  it('jumlah penumpang dari perangkat bus ikut tampil di peta', async () => {
    await api.postAlighting('BDG-102', 'S4', 10);
    const buses = await api.getBusPositions('K1');
    expect(buses.find((b) => b.bus_id === 'BDG-102')).toMatchObject({ passengers: 18, status: 'light' });
  });

  it('halte yang tidak ada -> ApiError 404', async () => {
    await expect(api.getArrivals('S99')).rejects.toMatchObject({ status: 404 });
  });
});

describe('Daftar Bus dari backend (siap pakai, sedang nonaktif)', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.useRealTimers();
  });

  const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
  const serve = (buses, occupancy) => {
    global.fetch = jest.fn(async (url) =>
      reply({ items: url.includes('/collections/buses/') ? buses : occupancy }),
    );
  };
  const bus = { id: 'b1', plate: 'D 7001 AB', capacity: 30, expand: { route: { code: 'A', name: 'Cicaheum' } } };

  it('menggabungkan bus, rute, dan okupansi', async () => {
    serve([bus], [{ bus: 'lain', current: 9, category: 'penuh' }, { bus: 'b1', current: 21, category: 'ramai' }]);
    expect(await api.fetchBuses()).toEqual([
      { id: 'b1', plate: 'D 7001 AB', route: 'A: Cicaheum', occupancy: 21, capacity: 30, status: 'medium' },
    ]);
    expect(global.fetch.mock.calls[0][0]).toMatch(/^https:\/\/bisin\.stei\.fun\/api\//);
  });

  it.each([
    ['lengang', 'low'],
    ['sedang', 'light'],
    ['ramai', 'medium'],
    ['penuh', 'high'],
  ])('kategori %s -> %s, tanpa dihitung ulang', async (category, status) => {
    serve([bus], [{ bus: 'b1', current: 1, category }]);
    expect((await api.fetchBuses())[0].status).toBe(status);
  });

  it('bus tanpa okupansi dan tanpa rute tetap tampil', async () => {
    serve([{ id: 'b2', plate: 'D 1', capacity: 24 }], []);
    expect((await api.fetchBuses())[0]).toMatchObject({ occupancy: 0, status: 'low', route: 'Rute tidak diketahui' });
  });

  it.each([
    [429, {}, 'Server sedang sibuk. Coba lagi sebentar.'],
    [502, null, 'Terjadi kesalahan pada server.'],
    [200, null, 'Balasan server tidak bisa dibaca.'],
  ])('balasan %i bermasalah -> ApiError', async (status, body, message) => {
    global.fetch = jest.fn(async () => reply(body, status));
    await expect(api.fetchBuses()).rejects.toMatchObject({ name: 'ApiError', status, message });
  });

  it('tanpa internet -> ApiError', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    await expect(api.fetchBuses()).rejects.toMatchObject({ name: 'ApiError', message: /Tidak bisa terhubung/ });
  });

  it('server diam 10 detik -> ApiError', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn(
      (url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('abort')))),
    );
    const result = expect(api.fetchBuses()).rejects.toMatchObject({ message: /terlalu lama/ });
    await jest.advanceTimersByTimeAsync(10000);
    await result;
  });
});

describe('perangkat bus', () => {
  it('tap naik menambah 1 penumpang dan nomor kartu disamarkan', async () => {
    const res = await api.postBoarding('BDG-101', 'S1');
    expect(res.bus.passengers).toBe(13);
    expect(res.card).toMatch(/^•••• \d{4}$/);
  });

  it('tap naik ditolak (409) kalau bus penuh', async () => {
    await api.postBoarding('BDG-103', 'S1'); // 39
    await api.postBoarding('BDG-103', 'S1'); // 40
    await expect(api.postBoarding('BDG-103', 'S1')).rejects.toMatchObject({ status: 409 });
  });

  it('turun mengurangi penumpang dan ikut terlihat di getFleet', async () => {
    const res = await api.postAlighting('BDG-102', 'S4', 5);
    expect(res.bus.passengers).toBe(23);
    const fleet = await api.getFleet();
    expect(fleet.find((b) => b.bus_id === 'BDG-102').passengers).toBe(23);
  });

  it.each([0, -2, 1.5, 999])('turun %p ditolak (400)', async (jumlah) => {
    await expect(api.postAlighting('BDG-101', 'S1', jumlah)).rejects.toMatchObject({
      status: 400,
    });
  });

  it('bus yang tidak ada -> ApiError 404', async () => {
    await expect(api.postBoarding('XXX', 'S1')).rejects.toMatchObject({ status: 404 });
  });
});

describe('Daftar Bus mode data contoh', () => {
  it('tanpa internet, dan ikut berubah setelah Simulator dipakai', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    await api.postBoarding('BDG-202', 'S6');
    const buses = await api.getBuses();
    expect(buses).toHaveLength(5);
    expect(buses.find((b) => b.id === 'BDG-202').occupancy).toBe(7);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
