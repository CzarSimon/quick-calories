import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { PB_URL } from '@/lib/pocketbase';
import { useTheme } from '@/hooks/use-theme';

export default function SettingsScreen() {
  const { email, signOut } = useAuth();
  const colors = useTheme();

  return (
    <ThemedView style={styles.fill}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="eyebrow">Account</ThemedText>
          <ThemedText>{email ?? 'Signed in'}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Server: {PB_URL}
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            onPress={signOut}
            style={[styles.button, { borderColor: colors.line }]}>
            <ThemedText type="smallBold" themeColor="over">
              Sign out
            </ThemedText>
          </Pressable>
        </ThemedView>
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="eyebrow" themeColor="carb">
            Arrives in M3
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Protein and fat targets and floors, carb floor, max daily change, fallback weight and nudge times.
          </ThemedText>
        </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three },
  card: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  button: { borderWidth: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center', marginTop: Spacing.two },
});
