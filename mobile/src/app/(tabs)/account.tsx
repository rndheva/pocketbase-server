import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth, type Role } from '@/context/AuthContext';

const ROLE_LABEL: Record<Role, string> = {
  penumpang: 'Penumpang',
  operator: 'Operator',
};

export default function AccountScreen() {
  const { user, signOut } = useAuth();

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <View style={styles.content}>
          <ThemedText type="subtitle">Akun</ThemedText>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">{user?.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {user?.email}
            </ThemedText>
            <ThemedText type="small">Peran: {user ? ROLE_LABEL[user.role] : '-'}</ThemedText>
          </ThemedView>

          {/* signOut menghapus sesi; penjaga di _layout otomatis kembali ke Login */}
          <Pressable
            onPress={signOut}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
            <ThemedText style={styles.buttonText}>Keluar</ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  card: { borderRadius: 12, padding: Spacing.three, gap: Spacing.one },
  button: {
    backgroundColor: '#D93025',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  pressed: { opacity: 0.7 },
  buttonText: { color: '#ffffff', fontWeight: 700 },
});
