import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { FormScreen } from '@/components/form-screen';
import { NeedsWeight } from '@/components/needs-weight';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, ConfirmButton, Field, MacroLine, Notice, Segmented } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { buildBaseTargets, microcycleDayLabel, spreadAdjustment } from '@/domain';
import { useTheme } from '@/hooks/use-theme';
import { formatKcal, formatSignedKcal, parseNumber } from '@/lib/format';
import { errorMessage } from '@/lib/library';
import {
  useActivateSchedule,
  useCreateLabel,
  useCreateSchedule,
  useDeleteSchedule,
  useDuplicateSchedule,
  useSaveScheduleDetails,
  useSchedules,
  type Schedule,
} from '@/lib/schedules';
import { useBodyWeight, useSettings, type SettingsValues } from '@/lib/settings';
import type { LabelRecord } from '@/lib/types';

export default function ScheduleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const data = useSchedules();
  const { settings, isLoading: settingsLoading } = useSettings();
  const { bwKg, isLoading: weightLoading } = useBodyWeight();
  const schedule = data.schedules.find((s) => s.id === id);

  const loading = data.isLoading || settingsLoading || weightLoading;
  const state = isNew ? 'ready' : loading ? 'loading' : schedule ? 'ready' : 'missing';
  return (
    <>
      <Stack.Screen options={{ title: isNew ? 'New schedule' : (schedule?.name ?? 'Schedule') }} />
      <FormScreen state={state} missingText="This schedule no longer exists.">
        {isNew ? (
          <NewScheduleForm days={settings.microcycle_length_days} />
        ) : schedule ? (
          <ScheduleEditor
            key={schedule.id}
            schedule={schedule}
            allSchedules={data.schedules}
            labels={data.labels}
            settings={settings}
            bwKg={bwKg}
          />
        ) : null}
      </FormScreen>
    </>
  );
}

function NewScheduleForm({ days }: { days: number }) {
  const create = useCreateSchedule();
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('3000');
  const [showErrors, setShowErrors] = useState(false);

  const parsedKcal = parseNumber(kcal);
  const nameError = name.trim() ? null : 'Give the schedule a name.';
  const kcalError = parsedKcal && parsedKcal > 0 ? null : 'Enter a calorie target above 0.';

  const submit = () => {
    setShowErrors(true);
    if (nameError || kcalError) return;
    create.mutate(
      { name: name.trim(), kcal: Math.round(parsedKcal!), days },
      { onSuccess: (schedule) => router.replace({ pathname: '/schedule/[id]', params: { id: schedule.id } }) },
    );
  };

  return (
    <>
      <Field label="Name" value={name} onChangeText={setName} placeholder="Holiday" autoFocus error={showErrors ? nameError : null} />
      <Field
        label="Starting calories for every day"
        value={kcal}
        onChangeText={setKcal}
        keyboardType="number-pad"
        suffix="kcal"
        error={showErrors ? kcalError : null}
      />
      <ThemedText type="small" themeColor="textSecondary">
        Creates {days} days with this target. You then set each day’s own calories, macros and meals. To start from an existing
        schedule, open it and choose Duplicate.
      </ThemedText>
      {create.error ? (
        <ThemedText type="small" themeColor="over">
          {errorMessage(create.error)}
        </ThemedText>
      ) : null}
      <Button label="Create schedule" variant="primary" busy={create.isPending} onPress={submit} testID="schedule-create" />
    </>
  );
}

type Direction = 'none' | 'deficit' | 'surplus';

type EditorProps = {
  schedule: Schedule;
  allSchedules: Schedule[];
  labels: LabelRecord[];
  settings: SettingsValues;
  bwKg: number | null;
};

function ScheduleEditor({ schedule, allSchedules, labels, settings, bwKg }: EditorProps) {
  const colors = useTheme();
  const save = useSaveScheduleDetails();
  const createLabel = useCreateLabel();
  const activate = useActivateSchedule();
  const duplicate = useDuplicateSchedule();
  const remove = useDeleteSchedule();

  const [name, setName] = useState(schedule.name);
  const [labelIds, setLabelIds] = useState<string[]>(schedule.labels);
  const [newLabel, setNewLabel] = useState('');
  const [direction, setDirection] = useState<Direction>(
    schedule.adjustment_kcal < 0 ? 'deficit' : schedule.adjustment_kcal > 0 ? 'surplus' : 'none',
  );
  const [amount, setAmount] = useState(schedule.adjustment_kcal ? String(Math.abs(schedule.adjustment_kcal)) : '');
  const [mode, setMode] = useState(schedule.adjustment_mode);
  const [included, setIncluded] = useState(schedule.days.map((d) => d.adjustment_included));
  const [custom, setCustom] = useState(schedule.days.map((d) => (d.adjustment_custom_kcal ? String(Math.abs(d.adjustment_custom_kcal)) : '')));
  const [showErrors, setShowErrors] = useState(false);
  const [saved, setSaved] = useState(false);

  const touch = <T,>(setter: (value: T) => void) => (value: T) => {
    setSaved(false);
    setter(value);
  };

  const sign = direction === 'deficit' ? -1 : 1;
  const parsedAmount = direction === 'none' ? 0 : parseNumber(amount);
  const total = sign * Math.round(parsedAmount ?? 0);
  const customAmounts = custom.map((text) => sign * Math.round(parseNumber(text) ?? 0));
  const draftDays = schedule.days.map((day, i) => ({
    kcal: day.kcal,
    macro_overrides: day.macro_overrides,
    adjustment_included: included[i],
    adjustment_custom_kcal: customAmounts[i],
  }));
  const spread = spreadAdjustment(total, draftDays, mode);
  const preview = bwKg ? buildBaseTargets(draftDays, { adjustment_kcal: total, adjustment_mode: mode }, bwKg, settings) : null;
  const blockedByFloors = preview ? preview.days.reduce((sum, d) => sum + d.unappliedKcal, 0) : 0;

  const nameError = name.trim() ? null : 'Give the schedule a name.';
  const amountError = direction !== 'none' && !(parsedAmount && parsedAmount > 0) ? 'Enter the kcal for the whole microcycle.' : null;
  const noDaysError = total !== 0 && !included.some(Boolean) ? 'Select at least one day.' : null;
  const customError =
    total !== 0 && mode === 'custom' && !noDaysError && spread.unplacedKcal !== 0
      ? `The days add up to ${formatKcal(Math.abs(total - spread.unplacedKcal))} of ${formatKcal(Math.abs(total))} kcal.`
      : null;
  const valid = !nameError && !amountError && !noDaysError && !customError;

  const dayLabel = (i: number) =>
    microcycleDayLabel({ startDate: settings.microcycle_anchor_date, length: schedule.days.length }, i);

  const submit = () => {
    setShowErrors(true);
    if (!valid) return;
    save.mutate(
      {
        schedule,
        name: name.trim(),
        labels: labelIds,
        adjustment_kcal: total,
        adjustment_mode: mode,
        days: draftDays.map((d) => ({ adjustment_included: d.adjustment_included, adjustment_custom_kcal: d.adjustment_custom_kcal })),
      },
      { onSuccess: () => setSaved(true) },
    );
  };

  const addLabel = () => {
    const labelName = newLabel.trim();
    if (!labelName) return;
    const existing = labels.find((l) => l.name.toLocaleLowerCase() === labelName.toLocaleLowerCase());
    if (existing) {
      if (!labelIds.includes(existing.id)) touch(setLabelIds)([...labelIds, existing.id]);
      setNewLabel('');
      return;
    }
    createLabel.mutate(labelName, {
      onSuccess: (label) => {
        setSaved(false);
        setLabelIds((current) => [...current, label.id]);
        setNewLabel('');
      },
    });
  };

  const noun = direction === 'surplus' ? 'surplus' : 'deficit';

  return (
    <>
      {schedule.is_active ? (
        <Notice tone="info">
          <ThemedText type="small">This is your active schedule.</ThemedText>
        </Notice>
      ) : null}

      <Field label="Name" value={name} onChangeText={touch(setName)} error={showErrors ? nameError : null} />

      <Card>
        <ThemedText type="eyebrow">Labels</ThemedText>
        {labels.length ? (
          <View style={styles.chips}>
            {labels.map((label) => (
              <Chip
                key={label.id}
                label={label.name}
                selected={labelIds.includes(label.id)}
                onPress={() =>
                  touch(setLabelIds)(labelIds.includes(label.id) ? labelIds.filter((x) => x !== label.id) : [...labelIds, label.id])
                }
              />
            ))}
          </View>
        ) : null}
        <View style={styles.inline}>
          <Field label="New label" value={newLabel} onChangeText={setNewLabel} placeholder="Cut" onSubmitEditing={addLabel} style={styles.grow} />
          <Button label="Add" onPress={addLabel} busy={createLabel.isPending} style={styles.inlineButton} />
        </View>
        {createLabel.error ? (
          <ThemedText type="small" themeColor="over">
            {errorMessage(createLabel.error)}
          </ThemedText>
        ) : null}
      </Card>

      <Card>
        <ThemedText type="eyebrow">Microcycle goal</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Your day targets are maintenance. Add a deficit or surplus for the whole microcycle and choose the days that carry it.
        </ThemedText>
        <Segmented
          value={direction}
          onChange={touch(setDirection)}
          options={[
            { value: 'none', label: 'Maintenance' },
            { value: 'deficit', label: 'Deficit' },
            { value: 'surplus', label: 'Surplus' },
          ]}
        />
        {direction !== 'none' ? (
          <>
            <Field
              label={`${direction === 'deficit' ? 'Deficit' : 'Surplus'} per microcycle`}
              value={amount}
              onChangeText={touch(setAmount)}
              keyboardType="number-pad"
              suffix="kcal"
              placeholder="3500"
              error={showErrors ? amountError : null}
            />
            <Segmented
              value={mode}
              onChange={touch(setMode)}
              options={[
                { value: 'even', label: 'Spread evenly' },
                { value: 'custom', label: 'Set per day' },
              ]}
            />
            {schedule.days.map((day, i) => (
              <View key={day.id} style={[styles.adjustRow, { borderTopColor: colors.line }]}>
                <Chip
                  label={dayLabel(i)}
                  selected={included[i]}
                  testID={`adjust-day-${i}`}
                  onPress={() => touch(setIncluded)(included.map((v, j) => (j === i ? !v : v)))}
                />
                {!included[i] ? (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.grow}>
                    Maintenance
                  </ThemedText>
                ) : mode === 'custom' ? (
                  <Field
                    label={`${dayLabel(i)} ${noun}`}
                    value={custom[i]}
                    onChangeText={(text) => touch(setCustom)(custom.map((v, j) => (j === i ? text : v)))}
                    keyboardType="number-pad"
                    suffix="kcal"
                    style={styles.grow}
                  />
                ) : (
                  <ThemedText type="smallBold" style={[styles.grow, styles.tabular]}>
                    {formatSignedKcal(spread.perDay[i])} kcal
                  </ThemedText>
                )}
              </View>
            ))}
            {showErrors && (noDaysError || customError) ? (
              <ThemedText type="small" themeColor="over">
                {noDaysError ?? customError}
              </ThemedText>
            ) : mode === 'custom' && customError ? (
              <ThemedText type="small" themeColor="textSecondary">
                {customError}
              </ThemedText>
            ) : null}
          </>
        ) : null}
        {preview ? (
          <ThemedText type="small" style={styles.tabular}>
            Maintenance {formatKcal(preview.maintenanceKcal)} kcal
            {total !== 0 ? ` → goal ${formatKcal(preview.goalKcal)} kcal` : ''}
          </ThemedText>
        ) : null}
        {blockedByFloors !== 0 ? (
          <Notice>
            <ThemedText type="small">
              {formatKcal(Math.abs(blockedByFloors))} kcal of this deficit can’t be applied: some days would drop below your fat
              and carb floors. Include more days, or lower the floors in Settings.
            </ThemedText>
          </Notice>
        ) : null}
      </Card>

      {save.error ? (
        <ThemedText type="small" themeColor="over">
          {errorMessage(save.error)}
        </ThemedText>
      ) : null}
      <Button label={saved ? 'Saved' : 'Save changes'} variant="primary" busy={save.isPending} onPress={submit} testID="schedule-save" />

      {bwKg ? null : <NeedsWeight />}

      <Card>
        <ThemedText type="eyebrow">Days</ThemedText>
        {schedule.days.map((day, i) => {
          const target = preview?.days[i];
          return (
            <Pressable
              key={day.id}
              accessibilityRole="button"
              testID={`day-${i}`}
              onPress={() => router.push({ pathname: '/day-plan/[id]', params: { id: day.id } })}
              style={({ pressed }) => [styles.dayRow, { borderTopColor: colors.line, opacity: pressed ? 0.6 : 1 }]}>
              <ThemedText type="smallBold" style={styles.dayName}>
                {dayLabel(i)}
              </ThemedText>
              <View style={styles.grow}>
                <ThemedText type="smallBold" style={styles.tabular}>
                  {target && target.base.kcal !== target.maintenance.kcal
                    ? `${formatKcal(target.maintenance.kcal)} → ${formatKcal(target.base.kcal)} kcal`
                    : `${formatKcal(target?.base.kcal ?? day.kcal)} kcal`}
                </ThemedText>
                {target ? <MacroLine nutrition={target.base} /> : null}
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                {day.slots.length} {day.slots.length === 1 ? 'slot' : 'slots'} ›
              </ThemedText>
            </Pressable>
          );
        })}
      </Card>

      {activate.error || duplicate.error || remove.error ? (
        <ThemedText type="small" themeColor="over">
          {errorMessage(activate.error ?? duplicate.error ?? remove.error)}
        </ThemedText>
      ) : null}
      {schedule.is_active ? null : (
        <Button label="Make this the active schedule" busy={activate.isPending} onPress={() => activate.mutate(schedule.id)} testID="schedule-activate" />
      )}
      <Button
        label="Duplicate"
        busy={duplicate.isPending}
        testID="schedule-duplicate"
        onPress={() =>
          duplicate.mutate(
            { schedule, existingNames: allSchedules.map((s) => s.name) },
            { onSuccess: (copy) => router.replace({ pathname: '/schedule/[id]', params: { id: copy.id } }) },
          )
        }
      />
      {duplicate.isPending ? (
        <ThemedText type="small" themeColor="textSecondary">
          Copying every day, slot and item. This can take a little while.
        </ThemedText>
      ) : null}
      {schedule.is_active ? (
        <ThemedText type="small" themeColor="textSecondary">
          To delete this schedule, make another one active first.
        </ThemedText>
      ) : (
        <ConfirmButton
          label="Delete schedule"
          confirmLabel="Delete"
          question={`Delete “${schedule.name}” with all its days and slots? This can’t be undone.`}
          busy={remove.isPending}
          onConfirm={() => remove.mutateAsync(schedule.id).then(() => router.back(), () => undefined)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  tabular: { fontVariant: ['tabular-nums'] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  inline: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  inlineButton: { minWidth: 72 },
  adjustRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.two },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 10 },
  dayName: { width: 44 },
});
