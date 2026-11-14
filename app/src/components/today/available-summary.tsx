import { StyleSheet, View } from 'react-native';

import { ProgressBar, SegmentedBar } from '@/components/progress-bar';
import { ThemedText } from '@/components/themed-text';
import { Button, Disclosure, MacroColumns, SectionHeader } from '@/components/ui';
import { Spacing, type ThemeColor } from '@/constants/theme';
import type { DayProjection } from '@/domain';
import { formatKcal, formatSignedKcal } from '@/lib/format';
import type { MacroTargets } from '@/lib/types';

type Props = {
  projection: DayProjection;
  targets: MacroTargets;
  /** The planned target before correction for earlier days. */
  baseTargets: MacroTargets | null;
  isToday: boolean;
  /** Log something unplanned; left out when the day can't take it yet. */
  onLogFood: (() => void) | null;
};

const grams = (value: number) => Math.round(Math.abs(value)).toLocaleString('en-US');

/**
 * What is still available today after everything eaten and everything still planned, for kcal
 * and each macro, with the day's progress underneath and the detail behind a disclosure.
 */
export function AvailableSummary({ projection, targets, baseTargets, isToday, onLogFood }: Props) {
  const { consumed, projected, remaining } = projection;
  const planned = projected.kcal - consumed.kcal;
  const over = remaining.kcal < 0;
  const correction = baseTargets ? targets.kcal - baseTargets.kcal : 0;

  return (
    <View style={styles.section} testID="available-today">
      <SectionHeader
        title={isToday ? 'Available today' : 'Available that day'}
        right={onLogFood ? <Button label="+ Log food" variant="text" onPress={onLogFood} testID="log-food" /> : undefined}
      />
      <View>
        <View style={styles.figure} accessible accessibilityLabel={`${formatKcal(Math.abs(remaining.kcal))} kcal ${over ? 'over target' : 'available'}`}>
          <ThemedText type="display" tabular testID="available-kcal">
            {formatKcal(Math.abs(remaining.kcal))}
          </ThemedText>
          <ThemedText type="default" themeColor="textSecondary">
            {over ? 'kcal over target' : 'kcal'}
          </ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {over ? 'Eaten and planned meals exceed the target.' : 'After your planned meals'}
        </ThemedText>
      </View>
      <MacroColumns
        testID="available-macros"
        columns={[
          { label: 'Carbs', value: grams(remaining.carbs_g), unit: remaining.carbs_g < 0 ? 'g over' : 'g left' },
          { label: 'Protein', value: grams(remaining.protein_g), unit: remaining.protein_g < 0 ? 'g over' : 'g left' },
          { label: 'Fat', value: grams(remaining.fat_g), unit: remaining.fat_g < 0 ? 'g over' : 'g left' },
        ]}
      />
      <View style={styles.progress}>
        <SegmentedBar
          eaten={consumed.kcal}
          planned={planned}
          target={targets.kcal}
          accessibilityLabel={`${formatKcal(consumed.kcal)} kcal eaten, ${formatKcal(planned)} still planned, target ${formatKcal(targets.kcal)}`}
        />
        <ThemedText type="caption" themeColor="textSecondary" tabular testID="kcal-consumed">
          <ThemedText type="caption" tabular>
            {formatKcal(consumed.kcal)}
          </ThemedText>{' '}
          eaten ·{' '}
          <ThemedText type="caption" tabular>
            {formatKcal(planned)}
          </ThemedText>{' '}
          planned ·{' '}
          <ThemedText type="caption" tabular>
            {formatKcal(targets.kcal)}
          </ThemedText>{' '}
          target
        </ThemedText>
      </View>
      <Disclosure label="Day details" testID="day-details">
        <MacroBar label="Carbs" color="carb" softColor="carbSoft" consumed={consumed.carbs_g} projected={projected.carbs_g} target={targets.carbs_g} />
        <MacroBar label="Protein" color="protein" softColor="proteinSoft" consumed={consumed.protein_g} projected={projected.protein_g} target={targets.protein_g} />
        <MacroBar label="Fat" color="fat" softColor="fatSoft" consumed={consumed.fat_g} projected={projected.fat_g} target={targets.fat_g} />
        <View style={styles.ledger}>
          {correction !== 0 && baseTargets ? (
            <ThemedText type="caption" themeColor="textSecondary" tabular testID="target-correction">
              Plan {formatKcal(baseTargets.kcal)} kcal, {formatSignedKcal(correction)} kcal from earlier days. The target is fixed for the day.
            </ThemedText>
          ) : null}
          <ThemedText type="caption" themeColor="textSecondary" tabular testID="kcal-projected">
            Projected {formatKcal(projected.kcal)} kcal with everything still planned.
          </ThemedText>
        </View>
      </Disclosure>
    </View>
  );
}

type MacroBarProps = { label: string; color: ThemeColor; softColor: ThemeColor; consumed: number; projected: number; target: number };

function MacroBar({ label, color, softColor, consumed, projected, target }: MacroBarProps) {
  const planned = projected - consumed;
  const over = projected - target;
  return (
    <View style={styles.macro}>
      <View style={styles.macroHead}>
        <ThemedText type="smallBold" style={styles.grow}>
          {label}
        </ThemedText>
        <ThemedText type="caption" themeColor="textSecondary" tabular>
          {grams(target)} g target
        </ThemedText>
      </View>
      <ProgressBar
        consumed={consumed}
        projected={projected}
        target={target}
        color={color}
        softColor={softColor}
        accessibilityLabel={`${label}: ${grams(consumed)} grams eaten, ${grams(planned)} still planned, target ${grams(target)}`}
      />
      <ThemedText type="caption" themeColor="textSecondary" tabular>
        {grams(consumed)} g eaten · {grams(planned)} g planned
        {over >= 1 ? ` · ${grams(over)} g over` : ''}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.three },
  progress: { gap: Spacing.two },
  figure: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.one, flexWrap: 'wrap' },
  macro: { gap: Spacing.one },
  macroHead: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  ledger: { gap: Spacing.one },
  grow: { flex: 1, minWidth: 0 },
});
