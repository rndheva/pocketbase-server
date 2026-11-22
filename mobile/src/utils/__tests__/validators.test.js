// Tes untuk aturan validasi form (login dan jumlah turun).
// Jalankan dengan: npm test

import {
  validateAlighting,
  validateEmail,
  validateLogin,
  validatePassword,
} from '../validators';

describe('validateEmail', () => {
  it('menolak email kosong', () => {
    expect(validateEmail('')).toBe('Email wajib diisi.');
    expect(validateEmail('   ')).toBe('Email wajib diisi.');
  });

  it('menolak format email yang salah', () => {
    expect(validateEmail('budi')).toBe('Format email tidak valid.');
    expect(validateEmail('budi@bisin')).toBe('Format email tidak valid.');
  });

  it('menerima email yang benar (spasi di pinggir diabaikan)', () => {
    expect(validateEmail('penumpang@bisin.id')).toBe('');
    expect(validateEmail('  operator@bisin.id ')).toBe('');
  });
});

describe('validatePassword', () => {
  it('menolak kata sandi kosong', () => {
    expect(validatePassword('')).toBe('Kata sandi wajib diisi.');
  });

  it('menolak kata sandi kurang dari 6 karakter', () => {
    expect(validatePassword('12345')).toBe('Kata sandi minimal 6 karakter.');
  });

  it('menerima kata sandi 6 karakter atau lebih', () => {
    expect(validatePassword('123456')).toBe('');
  });
});

describe('validateLogin', () => {
  it('mengembalikan error untuk setiap kolom', () => {
    expect(validateLogin({ email: '', password: '' })).toEqual({
      email: 'Email wajib diisi.',
      password: 'Kata sandi wajib diisi.',
    });
  });

  it('tidak ada error kalau semua benar', () => {
    expect(validateLogin({ email: 'a@b.co', password: 'rahasia' })).toEqual({
      email: '',
      password: '',
    });
  });
});

describe('validateAlighting (jumlah turun)', () => {
  const PENUMPANG = 12;

  it('menolak isian kosong', () => {
    expect(validateAlighting('', PENUMPANG)).toBe('Jumlah turun wajib diisi.');
  });

  it.each(['abc', '2.5', '-1', '3 orang'])('menolak bukan bilangan bulat: "%s"', (isian) => {
    expect(validateAlighting(isian, PENUMPANG)).toMatch(/bilangan bulat/);
  });

  it('menolak 0', () => {
    expect(validateAlighting('0', PENUMPANG)).toBe('Jumlah turun minimal 1.');
  });

  it('menolak jumlah yang melebihi penumpang di bus', () => {
    expect(validateAlighting('13', PENUMPANG)).toBe(
      'Tidak boleh melebihi penumpang di bus (12 orang).',
    );
  });

  it('menerima 1 sampai jumlah penumpang', () => {
    expect(validateAlighting('1', PENUMPANG)).toBe('');
    expect(validateAlighting('12', PENUMPANG)).toBe('');
  });
});
