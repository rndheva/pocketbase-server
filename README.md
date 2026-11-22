# Bis.In API

Backend API untuk **Bis.In**, sebuah sistem informasi bus kota Bandung yang dikembangkan sebagai proyek tugas kuliah. Backend ini digunakan untuk mengelola posisi bus, aktivitas penumpang, okupansi, estimasi kedatangan bus (ETA), dan analitik arus penumpang.

Seluruh data yang digunakan dalam proyek ini masih berupa data simulasi dan dibuat khusus untuk kebutuhan pengembangan serta pengujian sistem.

## Tentang Proyek

Bis.In menyediakan beberapa fitur utama melalui API:

- **Live Bus Tracking** – menyediakan informasi posisi bus berdasarkan koordinat GPS.
- **Passenger Events** – mencatat aktivitas penumpang naik dan turun.
- **Real-Time Occupancy** – menghitung jumlah penumpang dan tingkat kepadatan setiap bus.
- **Bus Arrival Estimation** – menampilkan daftar bus yang diperkirakan tiba di halte beserta ETA.
- **Passenger Flow Analytics** – menyediakan ringkasan aktivitas penumpang berdasarkan halte dan waktu.

## Teknologi

- **PocketBase** – backend, REST API, autentikasi, dan realtime.
- **SQLite** – penyimpanan data.
- **Docker Compose** – menjalankan layanan.
- **Nginx** – gateway dan pembatasan request.
- **Cloudflare Tunnel** – menyediakan akses API dari internet.

## Arsitektur

Layanan dijalankan menggunakan Docker Compose pada STB.

```text
Internet
   |
Cloudflare Tunnel
   |
Nginx Gateway
   |
PocketBase
   |
SQLite
```

PocketBase menangani data dan proses utama Bis.In, sedangkan Nginx menjadi pintu masuk API. Cloudflare Tunnel digunakan agar API dapat diakses dari luar jaringan lokal tanpa membuka port secara langsung.

## Akses API

Base URL:

- Publik: `https://bisin.stei.fun`
- Lokal: `http://192.168.1.61`

Gunakan URL publik untuk akses dari luar jaringan, dan URL lokal hanya saat berada di jaringan yang sama dengan STB.

Untuk menggunakan API, ada tiga jenis akses:

| Akses | Keterangan |
|---|---|
| Publik | Digunakan untuk membaca data bus, rute, halte, okupansi, posisi, dan ETA |
| API Key | Dibutuhkan untuk mengirim event penumpang dan memperbarui posisi bus |
| Operator | Digunakan untuk mengakses analitik dan riwayat aktivitas penumpang |

API Key dikirim melalui header `X-API-Key`, sedangkan token login operator dikirim melalui header `Authorization`.

API memiliki batas 20 request per detik untuk setiap alamat IP, dengan burst hingga 40 request. Jika melewati batas tersebut, server akan mengembalikan status `429`.

## Endpoint

Berikut beberapa endpoint yang tersedia:

| Method | Endpoint | Akses | Fungsi |
|---|---|---|---|
| GET | `/api/health` | Publik | Memeriksa status server |
| GET | `/api/bisin/arrivals?stop_id=` | Publik | Melihat bus yang akan tiba di halte |
| POST | `/api/bisin/events` | API Key | Mencatat aktivitas penumpang |
| POST | `/api/bisin/location` | API Key | Memperbarui posisi bus |
| GET | `/api/bisin/analytics` | Operator | Melihat analitik penumpang |
| GET | `/api/collections/passenger_events/records` | Operator | Melihat riwayat aktivitas penumpang |
| POST | `/api/collections/users/auth-with-password` | Publik | Login operator |

Data referensi dan status bus juga dapat diakses melalui endpoint collection PocketBase, seperti:

- `routes`
- `stops`
- `route_stops`
- `buses`
- `trips`
- `bus_locations`
- `occupancy`

Spesifikasi endpoint yang lebih lengkap tersedia di file [`openapi.yaml`](openapi.yaml).

## Contoh Penggunaan

Ganti `BASE` dengan alamat server, `KUNCI` dengan API Key, dan setiap ID dengan ID data yang tersedia di database.

**1. Memeriksa server**

```bash
curl BASE/api/health
```

**2. Melihat bus yang akan tiba di halte**

```bash
curl "BASE/api/bisin/arrivals?stop_id=ID_HALTE"
```

Response berisi daftar bus, estimasi kedatangan, jarak, dan informasi okupansi.

**3. Mencatat penumpang naik**

```bash
curl -X POST BASE/api/bisin/events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: KUNCI" \
  -d '{
    "event_id": "evt-0001",
    "bus_id": "ID_BUS",
    "trip_id": "ID_TRIP",
    "stop_id": "ID_HALTE",
    "jenis": "board"
  }'
```

Server akan memvalidasi event dan memperbarui jumlah penumpang pada bus terkait.

Setiap event menggunakan `event_id` unik untuk mencegah aktivitas yang sama dihitung lebih dari satu kali.

**4. Memperbarui posisi bus**

```bash
curl -X POST BASE/api/bisin/location \
  -H "Content-Type: application/json" \
  -H "X-API-Key: KUNCI" \
  -d '{
    "bus_id": "ID_BUS",
    "latitude": -6.9147,
    "longitude": 107.6098,
    "speed": 30
  }'
```

**5. Melihat data secara realtime**

PocketBase menyediakan Realtime Subscription melalui SSE pada `/api/realtime`. Fitur ini dapat digunakan untuk menerima perubahan data pada collection `bus_locations` dan `occupancy`.

## Aturan Penghitungan Okupansi

Jumlah penumpang diperbarui berdasarkan aktivitas naik dan turun:

```text
Jumlah sekarang = Jumlah sebelumnya + Penumpang naik - Penumpang turun
```

Persentase okupansi dihitung dari jumlah penumpang dibandingkan dengan kapasitas bus.

Kategori yang digunakan:

| Kategori | Persentase |
|---|---|
| `lengang` | Di bawah 40% |
| `sedang` | 40% – kurang dari 70% |
| `ramai` | 70% – kurang dari 100% |
| `penuh` | 100% atau lebih |

Server juga memvalidasi agar jumlah penumpang tidak negatif dan event yang sama tidak diproses dua kali.

## Menjalankan Proyek

Pastikan Docker dan Docker Compose sudah tersedia.

Clone repository:

```bash
git clone https://github.com/rndheva/pocketbase-server.git
cd pocketbase-server
```

Salin file konfigurasi:

```bash
cp .env.example .env
```

Isi konfigurasi yang diperlukan, termasuk `TUNNEL_TOKEN` dan `BISIN_API_KEY`.

Jalankan layanan:

```bash
docker compose up -d
```

Untuk mengisi data awal dan menjalankan simulasi, tersedia dua script di folder `scripts/`:

- `import_seed.ps1` – memasukkan data awal ke database.
- `simulate.ps1` – menjalankan simulasi pergerakan bus dan aktivitas penumpang.

## Catatan

- Seluruh data bus, rute, halte, posisi, dan aktivitas penumpang merupakan data simulasi.
- ETA dihitung berdasarkan jarak garis lurus dan kecepatan bus. Jika kecepatan tidak tersedia, sistem menggunakan asumsi 25 km/jam.
- ETA belum memperhitungkan kondisi lalu lintas maupun jalur jalan sebenarnya.
- API Key dan kredensial operator tidak disimpan di repository.

## Pengembang

Proyek ini dikembangkan oleh:

- **Naufalziyadh Alif Bintang S** – 18224077
- **Raditya Nanda Dhevara** – 18224111

Institut Teknologi Bandung  
Mata Kuliah Teknologi Sistem Terintegrasi dan PWAM.