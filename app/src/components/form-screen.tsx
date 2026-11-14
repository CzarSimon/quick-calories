import type { ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ScreenMargin, Spacing } from '@/constants/theme';

/** About 5 % of an iPhone screen's height. */
const FORM_TOP_EXTRA = 40;

type Props = {
  children: ReactNode;
  /** Shown instead of the form while data loads or when the record is missing. */
  state?: 'loading' | 'missing' | 'ready';
  missingText?: string;
};

/**
 * Scrollable, keyboard-aware body for pushed form screens.
 *
 * iOS does the insetting itself: `contentInsetAdjustmentBehavior` keeps the first field below the
 * navigation header (which is translucent and overlaps the screen), and
 * `automaticallyAdjustKeyboardInsets` makes room for the keyboard exactly, without the extra
 * padding a KeyboardAvoidingView with a guessed header offset leaves above it.
 */
export function FormScreen({ children, state = 'ready', missingText }: Props) {
  return (
    <ThemedView style={styles.fill}>
      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled">
        {state === 'loading' ? <ActivityIndicator style={styles.spinner} /> : null}
        {state === 'missing' ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
            {missingText}
          </ThemedText>
        ) : null}
        {state === 'ready' ? children : null}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // Extra room at the top: on iOS the translucent header still overlapped the first field slightly.
  content: { paddingHorizontal: ScreenMargin, paddingTop: Spacing.three + FORM_TOP_EXTRA, gap: Spacing.three, paddingBottom: Spacing.six },
  spinner: { marginTop: Spacing.five },
  centered: { textAlign: 'center', marginTop: Spacing.four },
});
