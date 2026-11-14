import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { sumNutrition } from '@/domain';
import { useTheme } from '@/hooks/use-theme';
import type { LoggedSlot, NextUp } from '@/lib/daylog-model';
import { formatKcal } from '@/lib/format';

/** After the card changes to another meal, ignore presses this long so a double tap can't confirm it too. */
const SETTLE_MS = 600;

type Props = {
  next: NextUp;
  /** False on an earlier day. */
  isToday: boolean;
  busy: boolean;
  onConfirm: (slots: LoggedSlot[]) => void;
  onOpen: (slot: LoggedSlot) => void;
};

const contents = (slots: LoggedSlot[]) => slots.flatMap((s) => s.entries.map((e) => e.name)).join(' + ');
const kcalOf = (slots: LoggedSlot[]) => sumNutrition(slots.flatMap((s) => s.entries)).kcal;

/**
 * The top of Today: the meal to confirm now, several overdue ones at once, the next one, or a
 * note that the plan is done. The most frequent action in the app lives here.
 */
export function NextMealCard({ next, isToday, busy, onConfirm, onOpen }: Props) {
  const colors = useTheme();
  const key = next.kind === 'due' ? `due:${next.slots.map((s) => s.id).join(',')}` : next.kind === 'upNext' ? `up:${next.slot.id}` : 'done';
  const settledAt = useRef(0);
  useEffect(() => {
    settledAt.current = performance.now() + SETTLE_MS;
  }, [key]);
  const guarded = (action: () => void) => () => {
    // A monotonic clock: the wall clock can jump (time zone, manual change) and must not lock the card.
    if (performance.now() < settledAt.current) return;
    action();
  };

  if (next.kind === 'done') {
    const open = next.openSlot;
    return (
      <Card tone="selected" style={styles.card}>
        <ThemedText type="eyebrow">All planned meals logged</ThemedText>
        {open ? (
          <>
            <ThemedText type="small" themeColor="textSecondary">
              {open.name} at {open.time} is still open.
            </ThemedText>
            <Button
              label={`Log ${open.name.toLowerCase()}`}
              onPress={guarded(() => onOpen(open))}
              style={{ backgroundColor: colors.backgroundElement }}
              testID="log-open-slot"
            />
          </>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            Open any meal below to change it.
          </ThemedText>
        )}
      </Card>
    );
  }

  if (next.kind === 'due' && next.slots.length > 1) {
    const count = next.slots.length;
    return (
      <Card tone="selected" style={styles.card} testID="next-meal">
        <ThemedText type="eyebrow">{count} meals to confirm</ThemedText>
        <ThemedText type="subtitle">{next.slots.map((s) => s.name).join(' · ')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" tabular>
          {formatKcal(kcalOf(next.slots))} kcal together
        </ThemedText>
        <Button
          label={count === 2 ? 'Confirm both as planned' : `Confirm all ${count} as planned`}
          variant="primary"
          busy={busy}
          onPress={guarded(() => onConfirm(next.slots))}
          testID="confirm-all"
          style={styles.action}
        />
        <ThemedText type="caption" themeColor="textSecondary">
          To change one, open it in the list below.
        </ThemedText>
      </Card>
    );
  }

  const slot = next.kind === 'due' ? next.slots[0] : next.slot;
  const due = next.kind === 'due';
  return (
    <Card tone="selected" style={styles.card} testID="next-meal">
      <View style={styles.head}>
        <ThemedText type="eyebrow" style={styles.grow}>
          {due ? (isToday ? 'Ready to log' : 'Not confirmed') : 'Up next'}
        </ThemedText>
        <ThemedText type="caption" themeColor="textSecondary" tabular>
          {slot.time}
        </ThemedText>
      </View>
      <ThemedText type="subtitle">{slot.name}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" tabular numberOfLines={2}>
        {contents([slot])} · {formatKcal(kcalOf([slot]))} kcal
      </ThemedText>
      <View style={[styles.actions, styles.action]}>
        <Button
          label="✓ Ate as planned"
          variant={due ? 'primary' : 'secondary'}
          busy={busy}
          onPress={guarded(() => onConfirm([slot]))}
          testID="confirm-next"
          accessibilityLabel={`Ate ${slot.name} as planned`}
          style={[styles.grow, !due && { backgroundColor: colors.backgroundElement }]}
        />
        <Button label="Adjust" variant="text" onPress={guarded(() => onOpen(slot))} testID="adjust-next" accessibilityLabel={`Adjust ${slot.name}`} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.one, paddingVertical: Spacing.three },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  action: { marginTop: Spacing.two },
  grow: { flex: 1, minWidth: 0 },
});
