import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FormScreen } from '@/components/form-screen';
import { LibraryPicker } from '@/components/library-picker';
import { OfflineBanner } from '@/components/offline-banner';
import { QuantityRow } from '@/components/quantity-row';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, NutritionSummary, Notice } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { foodNutrition, projectDay, roundNutrition, sumNutrition } from '@/domain';
import { useNow } from '@/hooks/use-now';
import { scaleEntry, statusAfterSave, toDraft, type EntryDraft } from '@/lib/daylog-model';
import { useDay, useSaveLogSlot, useSetSlotStatus, type LoggedSlot } from '@/lib/daylog';
import { formatKcal, formatNumber, parseNumber, quantityStep } from '@/lib/format';
import { errorMessage, useLibrary, type Library } from '@/lib/library';
import type { MacroTargets } from '@/lib/types';

type DraftItem = { key: string; base: EntryDraft; quantity: string };

let nextKey = 0;
const newKey = () => `log-item-${nextKey++}`;

export default function LogSlotScreen() {
  const { id, date } = useLocalSearchParams<{ id: string; date: string }>();
  const now = useNow();
  const day = useDay(date, now.date);
  const library = useLibrary();
  const slot = day.slots.find((s) => s.id === id);

  const state = day.state === 'loading' || library.isLoading ? 'loading' : slot && day.targets ? 'ready' : 'missing';
  return (
    <>
      <Stack.Screen options={{ title: slot ? `${slot.name} · ${slot.time}` : 'Meal' }} />
      <FormScreen state={state} missingText="This slot is no longer part of the day.">
        {slot && day.targets ? (
          <SlotForm key={slot.id} date={date} slot={slot} others={day.slots.filter((s) => s.id !== slot.id)} targets={day.targets} library={library} />
        ) : null}
      </FormScreen>
    </>
  );
}

type FormProps = { date: string; slot: LoggedSlot; others: LoggedSlot[]; targets: MacroTargets; library: Library };

function SlotForm({ date, slot, others, targets, library }: FormProps) {
  const save = useSaveLogSlot(date);
  const setStatus = useSetSlotStatus(date);
  const [items, setItems] = useState<DraftItem[]>(() =>
    slot.entries.map((entry) => ({ key: newKey(), base: toDraft(entry), quantity: formatNumber(entry.quantity) })),
  );
  const [picking, setPicking] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const isOpen = slot.kind === 'open';
  const resolved = items.map((item) => {
    const parsed = parseNumber(item.quantity);
    return { ...item, parsed, entry: scaleEntry(item.base, parsed ?? 0) };
  });
  const entries = resolved.map((item) => item.entry);
  const total = roundNutrition(sumNutrition(entries));
  const quantitiesValid = resolved.every((item) => item.parsed !== null && item.parsed > 0);

  const nextStatus = statusAfterSave(slot.kind, slot.entries, entries);
  const asPlanned = !isOpen && nextStatus === 'confirmed';
  const resolvedAlready = slot.status !== 'pending';

  // What the rest of the day leaves for this meal, and what is left after it.
  const rest = projectDay(others, targets);
  const after = {
    kcal: rest.remaining.kcal - total.kcal,
    carbs_g: rest.remaining.carbs_g - total.carbs_g,
    protein_g: rest.remaining.protein_g - total.protein_g,
    fat_g: rest.remaining.fat_g - total.fat_g,
  };

  const done = () => router.back();
  const submit = () => {
    setShowErrors(true);
    if (!quantitiesValid) return;
    save.mutate({ slot, entries, status: nextStatus }, { onSuccess: done });
  };

  const unitOf = (entry: EntryDraft) => (entry.food ? (library.foodById.get(entry.food)?.unit ?? '') : '×');
  const stepOf = (entry: EntryDraft) => {
    const food = entry.food ? library.foodById.get(entry.food) : undefined;
    return food ? quantityStep(food.unit, food.ref_amount) : 0.5;
  };

  const primaryLabel = isOpen
    ? entries.length
      ? 'Save'
      : 'Save as empty'
    : asPlanned
      ? resolvedAlready && slot.status === 'confirmed'
        ? 'Save'
        : 'Ate as planned'
      : 'Save what I ate';

  return (
    <>
      <OfflineBanner />
      {isOpen ? (
        <NutritionSummary title={entries.length ? 'Left today after this meal' : 'Left for this meal'} nutrition={roundNutrition(after)} />
      ) : (
        <NutritionSummary title={asPlanned ? 'As planned' : 'What you ate'} nutrition={total} />
      )}

      {!isOpen ? (
        <ThemedText type="small" themeColor={after.kcal < 0 ? 'over' : 'textSecondary'} style={styles.tabular}>
          {after.kcal >= 0
            ? `Leaves ${formatKcal(after.kcal)} kcal for the rest of the day.`
            : `Puts the day ${formatKcal(-after.kcal)} kcal over target.`}
        </ThemedText>
      ) : null}

      {slot.status === 'skipped' ? (
        <Notice tone="info">
          <ThemedText type="small">You skipped this slot. Saving it counts it as eaten again.</ThemedText>
        </Notice>
      ) : null}

      <Card>
        <ThemedText type="eyebrow">{isOpen ? 'What you ate' : 'Items'}</ThemedText>
        {resolved.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            {isOpen ? 'Nothing logged yet. Add a meal or food from your library.' : 'Nothing in this slot.'}
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
        <Button label="Add a meal or food" onPress={() => setPicking(true)} testID="log-add-item" />
      </Card>

      {save.error || setStatus.error ? (
        <ThemedText type="small" themeColor="over">
          {errorMessage(save.error ?? setStatus.error)}
        </ThemedText>
      ) : null}

      <Button label={primaryLabel} variant="primary" busy={save.isPending} onPress={submit} testID="log-save" />

      <View style={styles.secondary}>
        {slot.status !== 'skipped' ? (
          <Button
            label="Skip this slot"
            style={styles.grow}
            testID="log-skip"
            onPress={() => setStatus.mutate({ slotIds: [slot.id], status: 'skipped' }, { onSuccess: done })}
          />
        ) : null}
        {resolvedAlready ? (
          <Button
            label="Mark as not eaten yet"
            style={styles.grow}
            testID="log-reopen"
            onPress={() => setStatus.mutate({ slotIds: [slot.id], status: 'pending' }, { onSuccess: done })}
          />
        ) : null}
      </View>

      <LibraryPicker
        visible={picking}
        title={`Add to ${slot.name.toLowerCase()}`}
        foods={library.foods}
        meals={library.meals}
        onClose={() => setPicking(false)}
        onPickFood={(food) => {
          const base: EntryDraft = {
            food: food.id,
            meal: '',
            name: food.name,
            quantity: food.ref_amount,
            ...roundNutrition(foodNutrition(food, food.ref_amount)),
            origin: 'adhoc',
            source: 'manual',
          };
          setItems((current) => [...current, { key: newKey(), base, quantity: formatNumber(food.ref_amount) }]);
          setPicking(false);
        }}
        onPickMeal={(meal) => {
          const base: EntryDraft = { food: '', meal: meal.id, name: meal.name, quantity: 1, ...meal.nutrition, origin: 'adhoc', source: 'manual' };
          setItems((current) => [...current, { key: newKey(), base, quantity: '1' }]);
          setPicking(false);
        }}
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
  tabular: { fontVariant: ['tabular-nums'] },
  secondary: { flexDirection: 'row', gap: Spacing.two },
});
