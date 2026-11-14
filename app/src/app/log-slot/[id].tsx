import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FormScreen } from '@/components/form-screen';
import { LibraryPicker } from '@/components/library-picker';
import { OfflineBanner } from '@/components/offline-banner';
import { QuantityRow } from '@/components/quantity-row';
import { ThemedText } from '@/components/themed-text';
import { useToast } from '@/components/toast';
import { Button, ConfirmButton, Field, Notice, NutritionSummary, SectionHeader } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { foodNutrition, projectDay, roundNutrition, sumNutrition } from '@/domain';
import { useNow } from '@/hooks/use-now';
import { isUnplanned, scaleEntry, statusAfterSave, toDraft, type EntryDraft } from '@/lib/daylog-model';
import { useCreateUnplannedSlot, useDay, useSaveLogSlot, useSaveUnplannedSlot, useSetSlotStatus, type LoggedSlot } from '@/lib/daylog';
import { formatKcal, formatNumber, normalizeTime, parseNumber, quantityStep } from '@/lib/format';
import { errorMessage, useLibrary, type Library } from '@/lib/library';
import { enqueueOp } from '@/lib/outbox';
import type { MacroTargets } from '@/lib/types';

type DraftItem = { key: string; base: EntryDraft; quantity: string };

let nextKey = 0;
const newKey = () => `log-item-${nextKey++}`;

/** The name a new unplanned slot starts with. */
const DEFAULT_NAME = 'Snack';

/**
 * Log one meal: confirm or adjust a planned one, fill an open one, or (id "new") log something
 * eaten outside the plan as a new slot.
 */
export default function LogSlotScreen() {
  const { id, date } = useLocalSearchParams<{ id: string; date: string }>();
  const now = useNow();
  const day = useDay(date, now.date);
  const library = useLibrary();
  const isNew = id === 'new';
  const slot = isNew ? null : day.slots.find((s) => s.id === id);

  const ready = !!day.targets && !!day.dayLog && (isNew || !!slot);
  const state = day.state === 'loading' || library.isLoading ? 'loading' : ready ? 'ready' : 'missing';
  const title = isNew ? 'Log food' : slot ? `${slot.name} · ${slot.time}` : 'Meal';
  return (
    <>
      <Stack.Screen options={{ title }} />
      <FormScreen state={state} missingText={isNew ? 'This day is not set up yet. Open Today first.' : 'This slot is no longer part of the day.'}>
        {ready ? (
          <SlotForm
            key={slot?.id ?? 'new'}
            date={date}
            slot={slot ?? null}
            daySlots={day.slots}
            dayLogId={day.dayLog!.id}
            targets={day.targets!}
            library={library}
            isToday={date === now.date}
            defaultTime={date === now.date ? now.time : '12:00'}
          />
        ) : null}
      </FormScreen>
    </>
  );
}

type FormProps = {
  date: string;
  /** Null for a new unplanned slot. */
  slot: LoggedSlot | null;
  daySlots: LoggedSlot[];
  dayLogId: string;
  targets: MacroTargets;
  library: Library;
  isToday: boolean;
  defaultTime: string;
};

function SlotForm({ date, slot, daySlots, dayLogId, targets, library, isToday, defaultTime }: FormProps) {
  const toast = useToast();
  const save = useSaveLogSlot(date);
  const setStatus = useSetSlotStatus(date);
  const create = useCreateUnplannedSlot(date);
  const saveUnplanned = useSaveUnplannedSlot(date);
  const [items, setItems] = useState<DraftItem[]>(() =>
    (slot?.entries ?? []).map((entry) => ({ key: newKey(), base: toDraft(entry), quantity: formatNumber(entry.quantity) })),
  );
  const [name, setName] = useState(slot?.name ?? DEFAULT_NAME);
  const [timeText, setTimeText] = useState(slot?.time ?? defaultTime);
  const [picking, setPicking] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const unplanned = !slot || isUnplanned(slot);
  const isOpen = !slot || slot.kind === 'open';
  const resolved = items.map((item) => {
    const parsed = parseNumber(item.quantity);
    return { ...item, parsed, entry: scaleEntry(item.base, parsed ?? 0) };
  });
  const entries = resolved.map((item) => item.entry);
  const total = roundNutrition(sumNutrition(entries));
  const quantitiesValid = resolved.every((item) => item.parsed !== null && item.parsed > 0);
  const time = normalizeTime(timeText);
  const nameError = unplanned && !name.trim() ? 'Give it a name.' : null;
  const timeError = unplanned && !time ? 'Enter a time like 10:30.' : null;

  const nextStatus = slot ? statusAfterSave(slot.kind, slot.entries, entries) : 'confirmed';
  const asPlanned = !isOpen && nextStatus === 'confirmed';
  const resolvedAlready = !!slot && slot.status !== 'pending';

  // What the rest of the day leaves, and what is left after this meal.
  const rest = projectDay(slot ? daySlots.filter((s) => s.id !== slot.id) : daySlots, targets);
  const after = rest.remaining.kcal - total.kcal;

  const done = () => router.back();
  const busy = save.isPending || create.isPending || saveUnplanned.isPending;

  const submit = () => {
    setShowErrors(true);
    if (!quantitiesValid || nameError || timeError) return;
    if (!slot) {
      if (entries.length === 0) return;
      create.mutate(
        { dayLogId, slots: daySlots, name: name.trim(), time: time!, entries },
        {
          onSuccess: (slotId) => {
            done();
            toast({
              message: `${name.trim()} logged · ${formatKcal(total.kcal)} kcal`,
              actionLabel: 'Undo',
              onAction: () => void enqueueOp({ date, slotId, remove: true }),
            });
          },
        },
      );
      return;
    }
    if (unplanned) {
      saveUnplanned.mutate({ slotId: slot.id, name: name.trim(), time: time!, entries }, { onSuccess: done });
      return;
    }
    save.mutate({ slot, entries, status: nextStatus }, { onSuccess: done });
  };

  const unitOf = (entry: EntryDraft) => (entry.food ? (library.foodById.get(entry.food)?.unit ?? '') : '×');
  const stepOf = (entry: EntryDraft) => {
    const food = entry.food ? library.foodById.get(entry.food) : undefined;
    return food ? quantityStep(food.unit, food.ref_amount) : 0.5;
  };
  const addItem = (base: EntryDraft, quantity: string) => {
    setItems((current) => [...current, { key: newKey(), base, quantity }]);
    setPicking(false);
  };

  const primaryLabel = !slot
    ? 'Log it'
    : unplanned
      ? entries.length
        ? 'Save'
        : 'Remove'
      : isOpen
        ? entries.length
          ? 'Save'
          : 'Save as empty'
        : asPlanned
          ? resolvedAlready && slot.status === 'confirmed'
            ? 'Save'
            : 'Ate as planned'
          : 'Save what I ate';

  const summaryTitle = isOpen ? 'This meal' : asPlanned ? 'As planned' : 'What you ate';
  const afterLine =
    entries.length === 0 && isOpen
      ? `${formatKcal(Math.max(0, rest.remaining.kcal))} kcal available for this meal.`
      : after >= 0
        ? `Leaves ${formatKcal(after)} kcal available ${isToday ? 'today' : 'that day'}.`
        : `Puts the day ${formatKcal(-after)} kcal over target.`;

  return (
    <>
      <OfflineBanner />

      {unplanned ? (
        <View style={styles.fields}>
          <Field label="Name" value={name} onChangeText={setName} error={showErrors ? nameError : null} style={styles.grow} testID="log-name" />
          <Field
            label="Time"
            value={timeText}
            onChangeText={setTimeText}
            onBlur={() => time && setTimeText(time)}
            keyboardType="numbers-and-punctuation"
            error={showErrors ? timeError : null}
            style={styles.time}
            testID="log-time"
          />
        </View>
      ) : null}

      <NutritionSummary title={summaryTitle} nutrition={total} testID="log-total" />
      <ThemedText type="small" themeColor="textSecondary" tabular testID="log-after">
        {afterLine}
      </ThemedText>

      {slot?.status === 'skipped' ? (
        <Notice tone="info">
          <ThemedText type="small">You skipped this slot. Saving it counts it as eaten again.</ThemedText>
        </Notice>
      ) : null}

      <View>
        <SectionHeader title={isOpen ? 'What you ate' : 'Items'} />
        {resolved.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
            {isOpen ? 'Nothing logged yet. Add a meal or food from your library, or enter its macros.' : 'Nothing in this slot.'}
          </ThemedText>
        ) : null}
        {resolved.map((item) => (
          <QuantityRow
            key={item.key}
            name={item.base.name}
            nutrition={item.entry}
            quantity={item.quantity}
            unit={unitOf(item.base)}
            step={stepOf(item.base)}
            showError={showErrors}
            onChange={(quantity) => setItems((current) => current.map((i) => (i.key === item.key ? { ...i, quantity } : i)))}
            onRemove={() => setItems((current) => current.filter((i) => i.key !== item.key))}
          />
        ))}
        <Button label="Add a meal or food" onPress={() => setPicking(true)} testID="log-add-item" style={styles.add} />
      </View>

      {save.error || setStatus.error || create.error || saveUnplanned.error ? (
        <ThemedText type="small" themeColor="over">
          {errorMessage(save.error ?? setStatus.error ?? create.error ?? saveUnplanned.error)}
        </ThemedText>
      ) : null}

      <Button
        label={primaryLabel}
        variant={unplanned && slot && entries.length === 0 ? 'danger' : 'primary'}
        busy={busy}
        disabled={!slot && entries.length === 0}
        onPress={submit}
        testID="log-save"
      />

      {slot && unplanned ? (
        <ConfirmButton
          label="Remove"
          variant="text"
          question={`Remove ${slot.name} from this day?`}
          confirmLabel="Remove"
          onConfirm={() => saveUnplanned.mutate({ slotId: slot.id, name: slot.name, time: slot.time, entries: [] }, { onSuccess: done })}
          testID="log-remove"
        />
      ) : null}
      {slot && !unplanned ? (
        <View style={styles.secondary}>
          {slot.status !== 'skipped' ? (
            <Button
              label="Skip this slot"
              variant="text"
              testID="log-skip"
              onPress={() => setStatus.mutate({ slotIds: [slot.id], status: 'skipped' }, { onSuccess: done })}
            />
          ) : null}
          {resolvedAlready ? (
            <Button
              label="Mark as not eaten yet"
              variant="text"
              testID="log-reopen"
              onPress={() => setStatus.mutate({ slotIds: [slot.id], status: 'pending' }, { onSuccess: done })}
            />
          ) : null}
        </View>
      ) : null}

      <LibraryPicker
        visible={picking}
        title={slot ? `Add to ${slot.name.toLowerCase()}` : 'Add what you ate'}
        foods={library.foods}
        meals={library.meals}
        onClose={() => setPicking(false)}
        onPickFood={(food) =>
          addItem(
            {
              food: food.id,
              meal: '',
              name: food.name,
              quantity: food.ref_amount,
              ...roundNutrition(foodNutrition(food, food.ref_amount)),
              origin: 'adhoc',
              source: 'manual',
            },
            formatNumber(food.ref_amount),
          )
        }
        onPickMeal={(meal) => addItem({ food: '', meal: meal.id, name: meal.name, quantity: 1, ...meal.nutrition, origin: 'adhoc', source: 'manual' }, '1')}
        onQuickEntry={(draft) => addItem(draft, '1')}
        onCreateFood={() => {
          setPicking(false);
          router.push('/food/new');
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  time: { width: 104 },
  fields: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' },
  empty: { paddingVertical: Spacing.two },
  add: { marginTop: Spacing.three },
  secondary: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
});
