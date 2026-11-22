// Jenis error khusus supaya layar bisa menampilkan pesan yang jelas.
// Dipisah ke file sendiri supaya bisa dipakai ApiService.js dan mockServer.js.
export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status; // 0 = masalah jaringan, selain itu kode HTTP
  }
}
