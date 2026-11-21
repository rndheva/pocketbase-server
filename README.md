# PocketBase Server

Deployment PocketBase menggunakan Docker pada STB berbasis Armbian ARM64.

## Technology Stack

- Armbian Linux
- Docker Engine
- Docker Compose
- PocketBase
- SQLite

## Project Structure

- Dockerfile: konfigurasi pembuatan Docker image PocketBase.
- docker-compose.yml: konfigurasi container dan resource.
- pb_data/: penyimpanan database dan data PocketBase.
- .dockerignore: mengecualikan file dari Docker build context.
- .gitignore: mengecualikan file dari Git repository.

## Deployment

Build dan jalankan container:

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f pocketbase
```
## Access

PocketBase berjalan pada port 8090 dan hanya di-bind ke localhost STB.

Alamat lokal:

http://127.0.0.1:8090

Data PocketBase disimpan secara persisten pada direktori `pb_data/`.
