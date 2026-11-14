import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { PB_URL } from '@/lib/pocketbase';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const colors = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      const status = (err as { status?: number }).status;
      setError(
        status === 400
          ? 'Email or password is wrong.'
          : `Can't reach the server at ${PB_URL}. Check the address and your connection.`,
      );
    } finally {
      setBusy(false);
    }
  };

  const input = [styles.input, { borderColor: colors.line, backgroundColor: colors.backgroundElement, color: colors.text }];

  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <KeyboardAvoidingView behavior="padding" style={styles.container}>
          <View style={styles.header}>
            <ThemedText type="title">Quick Calories</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Sign in with your PocketBase account.
            </ThemedText>
          </View>
          <TextInput
            style={input}
            placeholder="Email"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="username"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={input}
            placeholder="Password"
            placeholderTextColor={colors.textSecondary}
            secureTextEntry
            textContentType="password"
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={submit}
          />
          {error ? (
            <ThemedText type="small" themeColor="over">
              {error}
            </ThemedText>
          ) : null}
          <Pressable
            accessibilityRole="button"
            disabled={busy || !email || !password}
            onPress={submit}
            style={[styles.button, { backgroundColor: colors.accent, opacity: busy || !email || !password ? 0.5 : 1 }]}>
            {busy ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <ThemedText type="smallBold" themeColor="onAccent">
                Sign in
              </ThemedText>
            )}
          </Pressable>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  container: { flex: 1, justifyContent: 'center', padding: Spacing.four, gap: Spacing.three },
  header: { gap: Spacing.one, marginBottom: Spacing.two },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  button: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
});
