// Fungsi validasi form. Dipisah dari layar supaya mudah dites dengan Jest nanti.
// Setiap fungsi mengembalikan pesan error (string), atau '' kalau isinya sudah benar.

export function validateEmail(email) {
  const value = (email ?? '').trim();
  if (!value) return 'Email wajib diisi.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Format email tidak valid.';
  return '';
}

export function validatePassword(password) {
  if (!password) return 'Kata sandi wajib diisi.';
  if (password.length < 6) return 'Kata sandi minimal 6 karakter.';
  return '';
}

// Memeriksa seluruh form login. Hasilnya { email, password } berisi pesan error masing-masing.
export function validateLogin({ email, password }) {
  return {
    email: validateEmail(email),
    password: validatePassword(password),
  };
}

// Form "jumlah turun" di simulator perangkat bus.
// Harus bilangan bulat >= 1 dan tidak boleh melebihi penumpang yang ada di bus.
export function validateAlighting(text, passengersOnBus) {
  const value = (text ?? '').trim();
  if (!value) return 'Jumlah turun wajib diisi.';
  if (!/^\d+$/.test(value)) return 'Jumlah turun harus bilangan bulat (tanpa koma/minus).';
  const count = Number(value);
  if (count < 1) return 'Jumlah turun minimal 1.';
  if (count > passengersOnBus) {
    return `Tidak boleh melebihi penumpang di bus (${passengersOnBus} orang).`;
  }
  return '';
}
