import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { FormScreen } from '@/components/form-screen';
import { NeedsWeight } from '@/components/needs-weight';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Field, Notice } from '@/components/ui';
import { Spacing, type ThemeColor } from '@/constants/theme';
import { buildBaseTargets, canSaveDayPlan, deriveMacros, macroFloors, microcycleDayLabel } from '@/domain';
import { useTheme } from '@/hooks/use-theme';
import { formatKcal, formatNumber, formatSignedKcal, parseNumber } from '@/lib/format';
import { errorMessage } from '@/lib/library';
import { findDay, plannedNutrition, useCopySlots, useSaveDayPlan, useSchedules, type Day, type Schedule } from '@/lib/schedules';
import { useBodyWeight, useSettings, type SettingsValues } from '@/lib/settings';
import type { MacroOverrides } from '@/lib/types';

export default function DayPlanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const data = useSchedules();
  const { settings, isLoading: settingsLoading } = useSettings();
  const { bwKg, isLoading: weightLoading } = useBodyWeight();
  const found = findDay(data.schedules, id);

  const label = found
    ? microcycleDayLabel({ startDate: settings.microcycle_anchor_date, length: found.schedule.days.length }, found.day.day_index)
    : 'Day';
  const loading = data.isLoading || settingsLoading || weightLoading;

  return (
    <>
      <Stack.Screen options={{ title: found ? `${label} · ${found.schedule.name}` : 'Day' }} />
      <FormScreen state={loading ? 'loading' : found ? 'ready' : 'missing'} missingText="This day no longer exists.">
        {found ? (
          <>
            {bwKg ? (
              <TargetEditor key={found.day.id} schedule={found.schedule} day={found.day} settings={settings} bwKg={bwKg} />
            ) : (
              <NeedsWeight />
            )}
            <SlotsCard schedule={found.schedule} day={found.day} settings={settings} bwKg={bwKg} />
          </>
        ) : null}
      </FormScreen>
    </>
  );
}

type EditorProps = { schedule: Schedule; day: Day; settings: SettingsValues; bwKg: number };

function TargetEditor({ schedule, day, settings, bwKg }: EditorProps) {
  const save = useSaveDayPlan();
  const [kcalText, setKcalText] = useState(String(day.kcal));
  const [overrides, setOverrides] = useState<MacroOverrides>(day.macro_overrides ?? {});
  const [accepted, setAccepted] = useState(day.accepted_imbalance_kcal);
  const [showErrors, setShowErrors] = useState(false);
  const [saved, setSaved] = useState(false);

  const kcal = parseNumber(kcalText);
  const kcalError = kcal && kcal > 0 ? null : 'Enter a calorie target above 0.';
  const derived = deriveMacros(Math.round(kcal ?? 0), bwKg, settings, overrides);
  const floors = macroFloors(bwKg, settings);
  const { imbalanceKcal: imbalance, targets } = derived;
  const filledCarbs = deriveMacros(Math.round(kcal ?? 0), bwKg, settings, { ...overrides, carbs_g: undefined }).targets.carbs_g;
  const canSave = !kcalError && canSaveDayPlan(imbalance, accepted);

  const change = (next: MacroOverrides) => {
    setSaved(false);
    setOverrides(next);
  };
  const without = (key: keyof MacroOverrides) => {
    const next = { ...overrides };
    delete next[key];
    return next;
  };

  const submit = () => {
    setShowErrors(true);
    if (!canSave) return;
    save.mutate(
      { id: day.id, kcal: Math.round(kcal!), macro_overrides: overrides, accepted_imbalance_kcal: imbalance },
      { onSuccess: () => setSaved(true) },
    );
  };

  // What the schedule's deficit or surplus does to this day, with the edits above applied.
  const adjusted = buildBaseTargets(
    schedule.days.map((d) => (d.id === day.id ? { ...d, kcal: Math.round(kcal ?? 0), macro_overrides: overrides } : d)),
    schedule,
    bwKg,
    settings,
  ).days[schedule.days.findIndex((d) => d.id === day.id)];

  const word = imbalance > 0 ? 'surplus' : 'deficit';

  return (
    <>
      <Card>
        <Field
          label="Day target"
          value={kcalText}
          onChangeText={(text) => {
            setSaved(false);
            setKcalText(text);
          }}
          keyboardType="number-pad"
          suffix="kcal"
          error={showErrors ? kcalError : null}
        />
        <ThemedText type="small" themeColor="textSecondary" style={styles.tabular}>
          Worked out for {formatNumber(bwKg)} kg body weight.
        </ThemedText>

        <MacroRow
          label="Carbs"
          color="carb"
          grams={targets.carbs_g}
          perKg={targets.carbs_g / bwKg}
          source={overrides.carbs_g == null ? 'Fills the remaining calories' : 'Set by hand'}
          custom={overrides.carbs_g != null}
          belowFloor={derived.belowFloor.carbs ? floors.carbs_g : null}
          step={10}
          onStep={(delta) => {
            // Stepping back onto the value carbs would have anyway returns them to "fills the rest".
            const next = Math.max(0, targets.carbs_g + delta);
            change(next === filledCarbs ? without('carbs_g') : { ...overrides, carbs_g: next });
          }}
          onReset={() => change(without('carbs_g'))}
        />
        <MacroRow
          label="Protein"
          color="protein"
          grams={targets.protein_g}
          perKg={targets.protein_g / bwKg}
          source={overrides.protein_gkg == null ? `Default ${formatNumber(settings.protein_target_gkg)} g/kg` : 'Set by hand'}
          custom={overrides.protein_gkg != null}
          belowFloor={derived.belowFloor.protein ? floors.protein_g : null}
          step={5}
          onStep={(delta) => change({ ...overrides, protein_gkg: Math.max(0, targets.protein_g + delta) / bwKg })}
          onReset={() => change(without('protein_gkg'))}
        />
        <MacroRow
          label="Fat"
          color="fat"
          grams={targets.fat_g}
          perKg={targets.fat_g / bwKg}
          source={overrides.fat_gkg == null ? `Default ${formatNumber(settings.fat_target_gkg)} g/kg` : 'Set by hand'}
          custom={overrides.fat_gkg != null}
          belowFloor={derived.belowFloor.fat ? floors.fat_g : null}
          step={5}
          onStep={(delta) => change({ ...overrides, fat_gkg: Math.max(0, targets.fat_g + delta) / bwKg })}
          onReset={() => change(without('fat_gkg'))}
        />

        {imbalance !== 0 ? (
          <Notice>
            <ThemedText type="smallBold" style={styles.tabular}>
              These macros add up to {formatKcal(targets.kcal)} kcal, {formatSignedKcal(imbalance)} against the target.
            </ThemedText>
            <ThemedText type="small">
              {accepted === imbalance
                ? `You accepted this ${word} for the day.`
                : overrides.carbs_g != null
                  ? `Let carbs fill the target again, or accept the ${word}.`
                  : `Protein and fat alone exceed the target. Raise the target, lower them, or accept the ${word}.`}
            </ThemedText>
            <View style={styles.noticeActions}>
              {overrides.carbs_g != null ? <Button label="Rebalance carbs" compact onPress={() => change(without('carbs_g'))} /> : null}
              {accepted === imbalance ? null : (
                <Button
                  label={`Accept ${word}`}
                  compact
                  variant="danger"
                  testID="accept-imbalance"
                  onPress={() => {
                    setSaved(false);
                    setAccepted(imbalance);
                  }}
                />
              )}
            </View>
          </Notice>
        ) : null}

        {adjusted && adjusted.adjustmentKcal !== 0 ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.tabular}>
            With this schedule’s {adjusted.adjustmentKcal < 0 ? 'deficit' : 'surplus'} ({formatSignedKcal(adjusted.adjustmentKcal)} on this
            day): {formatKcal(adjusted.base.kcal)} kcal, {adjusted.base.carbs_g} g carbs, {adjusted.base.fat_g} g fat.
          </ThemedText>
        ) : null}

        {save.error ? (
          <ThemedText type="small" themeColor="over">
            {errorMessage(save.error)}
          </ThemedText>
        ) : null}
        <Button
          label={saved ? 'Saved' : 'Save target'}
          variant="primary"
          busy={save.isPending}
          disabled={!kcalError && !canSave}
          onPress={submit}
          testID="day-save"
        />
      </Card>
    </>
  );
}

type MacroRowProps = {
  label: string;
  color: ThemeColor;
  grams: number;
  perKg: number;
  source: string;
  custom: boolean;
  /** The floor in grams when the value is below it. */
  belowFloor: number | null;
  step: number;
  onStep: (delta: number) => void;
  onReset: () => void;
};

function MacroRow({ label, color, grams, perKg, source, custom, belowFloor, step, onStep, onReset }: MacroRowProps) {
  const colors = useTheme();
  return (
    <View style={[styles.macroRow, { borderTopColor: colors.line }]}>
      <View style={styles.grow}>
        <ThemedText type="smallBold" themeColor={color}>
          {label}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {source}
          {custom ? ' · ' : ''}
          {custom ? (
            <ThemedText type="smallBold" themeColor="carb" onPress={onReset} accessibilityRole="button" accessibilityLabel={`Reset ${label}`}>
              Reset
            </ThemedText>
          ) : null}
        </ThemedText>
        {belowFloor !== null ? (
          <ThemedText type="small" themeColor="over">
            Below your floor of {belowFloor} g
          </ThemedText>
        ) : null}
      </View>
      <Button label="−" compact onPress={() => onStep(-step)} style={styles.stepButton} />
      <View style={styles.value}>
        <ThemedText type="smallBold" style={styles.tabular}>
          {grams} g
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.tabular}>
          {formatNumber(perKg)} g/kg
        </ThemedText>
      </View>
      <Button label="+" compact onPress={() => onStep(step)} style={styles.stepButton} />
    </View>
  );
}

function SlotsCard({ schedule, day, settings, bwKg }: { schedule: Schedule; day: Day; settings: SettingsValues; bwKg: number | null }) {
  const colors = useTheme();
  const copy = useCopySlots();
  const [copying, setCopying] = useState(false);
  const [source, setSource] = useState<Day | null>(null);

  const planned = plannedNutrition(day);
  const base = bwKg
    ? buildBaseTargets(schedule.days, schedule, bwKg, settings).days[schedule.days.findIndex((d) => d.id === day.id)]?.base
    : null;
  const hasOpen = day.slots.some((s) => s.kind === 'open');
  const dayLabel = (d: Day) =>
    microcycleDayLabel({ startDate: settings.microcycle_anchor_date, length: schedule.days.length }, d.day_index);
  const others = schedule.days.filter((d) => d.id !== day.id && d.slots.length > 0);

  return (
    <Card>
      <ThemedText type="eyebrow">Slots</ThemedText>
      {day.slots.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          No slots yet. Add the meals you plan for this day, and an open slot for a meal you decide on the day.
        </ThemedText>
      ) : null}
      {day.slots.map((slot) => (
        <Pressable
          key={slot.id}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/plan-slot/[id]', params: { id: slot.id, dayPlan: day.id } })}
          style={({ pressed }) => [styles.slotRow, { borderTopColor: colors.line, opacity: pressed ? 0.6 : 1 }]}>
          <ThemedText type="smallBold" themeColor="textSecondary" style={[styles.time, styles.tabular]}>
            {slot.time}
          </ThemedText>
          <View style={styles.grow}>
            <ThemedText type="smallBold">{slot.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
              {slot.kind === 'open'
                ? 'Open: uses what is left of the day'
                : slot.items.length
                  ? slot.items.map((i) => i.name).join(' · ')
                  : 'Nothing planned yet'}
            </ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary" style={styles.tabular}>
            {slot.kind === 'planned' && slot.items.length ? `${formatKcal(slot.nutrition.kcal)} kcal ` : ''}›
          </ThemedText>
        </Pressable>
      ))}

      {base && planned.kcal > 0 ? (
        <ThemedText type="small" style={styles.tabular}>
          Planned: {formatKcal(planned.kcal)} of {formatKcal(base.kcal)} kcal.{' '}
          {base.kcal - planned.kcal >= 0
            ? `${formatKcal(base.kcal - planned.kcal)} kcal, ${Math.round(base.carbs_g - planned.carbs_g)} g carbs and ${Math.round(base.protein_g - planned.protein_g)} g protein left${hasOpen ? ' for open slots' : ''}.`
            : `That is ${formatKcal(planned.kcal - base.kcal)} kcal over the day target.`}
        </ThemedText>
      ) : null}

      <Button
        label="Add slot"
        testID="slot-add"
        onPress={() => router.push({ pathname: '/plan-slot/[id]', params: { id: 'new', dayPlan: day.id } })}
      />

      {others.length > 0 && !copying ? <Button label="Copy slots from another day" onPress={() => setCopying(true)} testID="slots-copy" /> : null}
      {copying ? (
        <Notice tone="info">
          <ThemedText type="small">
            {source
              ? `Replace this day’s ${day.slots.length} ${day.slots.length === 1 ? 'slot' : 'slots'} with a copy of ${dayLabel(source)}’s ${source.slots.length}?`
              : 'Copy from which day? This replaces the slots above.'}
          </ThemedText>
          {source ? null : (
            <View style={styles.noticeActions}>
              {others.map((d) => (
                <Button key={d.id} label={dayLabel(d)} compact onPress={() => setSource(d)} />
              ))}
            </View>
          )}
          <View style={styles.noticeActions}>
            <Button
              label="Cancel"
              compact
              onPress={() => {
                setCopying(false);
                setSource(null);
              }}
            />
            {source ? (
              <Button
                label="Replace"
                compact
                variant="danger"
                busy={copy.isPending}
                testID="slots-copy-confirm"
                onPress={() =>
                  copy.mutate(
                    { from: source, to: day },
                    {
                      onSuccess: () => {
                        setCopying(false);
                        setSource(null);
                      },
                    },
                  )
                }
              />
            ) : null}
          </View>
        </Notice>
      ) : null}
      {copy.error ? (
        <ThemedText type="small" themeColor="over">
          {errorMessage(copy.error)}
        </ThemedText>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  tabular: { fontVariant: ['tabular-nums'] },
  macroRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.two },
  stepButton: { width: 44 },
  value: { width: 72, alignItems: 'center' },
  noticeActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 10 },
  time: { width: 48 },
});
