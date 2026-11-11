import type { ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

type Props = {
  children: ReactNode;
  /** Shown instead of the form while data loads or when the record is missing. */
  state?: 'loading' | 'missing' | 'ready';
  missingText?: string;
};

/** Scrollable, keyboard-aware body for pushed form screens. */
export function FormScreen({ children, state = 'ready', missingText }: Props) {
  return (
    <ThemedView style={styles.fill}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={96}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {state === 'loading' ? <ActivityIndicator style={styles.spinner} /> : null}
          {state === 'missing' ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
              {missingText}
            </ThemedText>
          ) : null}
          {state === 'ready' ? children : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  spinner: { marginTop: Spacing.five },
  centered: { textAlign: 'center', marginTop: Spacing.four },
});
