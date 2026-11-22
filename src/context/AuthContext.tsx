// Menyimpan "siapa yang sedang login" supaya semua layar bisa tahu.
// Sementara disimpan di memori saja (hilang kalau aplikasi ditutup).

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

// Hanya 2 peran. Penurunan penumpang dicatat tombol fisik di bus, bukan oleh petugas di aplikasi.
export type Role = 'penumpang' | 'operator';

export type User = { id: string; name: string; email: string; role: Role };
export type Session = { token: string; user: User };

type AuthValue = {
  user: User | null;
  token: string | null;
  signIn: (session: Session) => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);

  const value = useMemo<AuthValue>(
    () => ({
      user: session?.user ?? null,
      token: session?.token ?? null,
      signIn: setSession,
      signOut: () => setSession(null),
    }),
    [session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus dipakai di dalam AuthProvider');
  return ctx;
}
