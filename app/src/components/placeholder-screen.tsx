import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

type Props = {
  title: string;
  eyebrow?: string;
  milestone: string;
  description: string;
  headerRight?: ReactNode;
  children?: ReactNode;
};

/** Temporary screen body used until each screen's milestone lands. */
export function PlaceholderScreen({ title, eyebrow, milestone, description, headerRight, children }: Props) {
  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.fill} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              {eyebrow ? <ThemedText type="eyebrow">{eyebrow}</ThemedText> : null}
              <ThemedText type="title">{title}</ThemedText>
            </View>
            {headerRight}
          </View>
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="eyebrow" themeColor="carb">
              {milestone}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {description}
            </ThemedText>
          </ThemedView>
          {children}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: Spacing.two },
  headerText: { flexShrink: 1, gap: Spacing.one },
  card: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
});
