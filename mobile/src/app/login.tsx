import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, login } from '@/services/ApiService';
import { validateLogin } from '@/utils/validators';

export default function LoginScreen() {
  const theme = useTheme();
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState('');

  async function handleLogin() {
    setServerError('');

    // 1. Validasi form dulu. Kalau ada yang salah, berhenti di sini.
    const result = validateLogin({ email, password });
    setErrors(result);
    if (result.email || result.password) return;

    // 2. Panggil ApiService (bukan fetch langsung).
    setLoading(true);
    try {
      const session = await login(email, password);
      // Simpan sesi. Router otomatis memindahkan kita ke tab karena user sudah ada.
      signIn(session);
    } catch (e) {
      // 3. Error handling: tampilkan pesan yang mudah dipahami.
      setServerError(e instanceof ApiError ? e.message : 'Terjadi kesalahan. Coba lagi.');
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = (hasError: boolean) => [
    styles.input,
    {
      color: theme.text,
      backgroundColor: theme.backgroundElement,
      borderColor: hasError ? '#D93025' : theme.backgroundSelected,
    },
  ];

  return (
    <ThemedView style={styles.flex}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <ThemedText type="subtitle">bis.in</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.subtitle}>
              Masuk untuk melihat keterisian bus secara real-time.
            </ThemedText>

            <ThemedText type="smallBold">Email</ThemedText>
            <TextInput
              style={inputStyle(!!errors.email)}
              value={email}
              onChangeText={setEmail}
              placeholder="nama@email.com"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              editable={!loading}
            />
            {!!errors.email && <ThemedText style={styles.error}>{errors.email}</ThemedText>}

            <ThemedText type="smallBold" style={styles.label}>
              Kata sandi
            </ThemedText>
            <TextInput
              style={inputStyle(!!errors.password)}
              value={password}
              onChangeText={setPassword}
              placeholder="Minimal 6 karakter"
              placeholderTextColor={theme.textSecondary}
              secureTextEntry
              autoCapitalize="none"
              editable={!loading}
              onSubmitEditing={handleLogin}
            />
            {!!errors.password && <ThemedText style={styles.error}>{errors.password}</ThemedText>}

            {!!serverError && (
              <View style={styles.errorBox}>
                <ThemedText style={styles.errorBoxText}>{serverError}</ThemedText>
              </View>
            )}

            <Pressable
              onPress={handleLogin}
              disabled={loading}
              style={({ pressed }) => [
                styles.button,
                (pressed || loading) && styles.buttonDim,
              ]}>
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <ThemedText style={styles.buttonText}>Masuk</ThemedText>
              )}
            </Pressable>

            <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
              Akun contoh: penumpang@bisin.id / penumpang123
            </ThemedText>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  card: { width: '100%', maxWidth: 420, gap: Spacing.two },
  subtitle: { marginBottom: Spacing.three },
  label: { marginTop: Spacing.two },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
    fontSize: 16,
  },
  error: { color: '#D93025', fontSize: 13, lineHeight: 18 },
  errorBox: {
    backgroundColor: '#FDECEA',
    borderRadius: 8,
    padding: Spacing.three,
    marginTop: Spacing.two,
  },
  errorBoxText: { color: '#B3261E', fontSize: 14, lineHeight: 20 },
  button: {
    backgroundColor: '#1E6FE8',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: Spacing.three,
  },
  buttonDim: { opacity: 0.7 },
  buttonText: { color: '#ffffff', fontWeight: 700 },
  hint: { textAlign: 'center', marginTop: Spacing.three },
});
