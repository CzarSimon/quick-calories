import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { FormScreen } from '@/components/form-screen';
import { LibraryPicker } from '@/components/library-picker';
import { QuantityRow } from '@/components/quantity-row';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, ConfirmButton, Field, NutritionSummary, Segmented } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { roundNutrition, sumNutrition } from '@/domain';
import { useTheme } from '@/hooks/use-theme';
import { formatNumber, normalizeTime, parseNumber, quantityStep } from '@/lib/format';
import { errorMessage, type Library } from '@/lib/library';
import { slotItemNutrition } from '@/lib/schedules-model';
import { findDay, useDeleteSlot, useSaveSlot, useSchedules, type Slot } from '@/lib/schedules';
import type { SlotKind } from '@/lib/types';

type DraftItem = { key: string; foodId?: string; mealId?: string; quantity: string };

let nextKey = 0;
const newKey = () => `slot-item-${nextKey++}`;

export default function PlanSlotScreen() {
  const { id, dayPlan } = useLocalSearchParams<{ id: string; dayPlan: string }>();
  const isNew = id === 'new';
  const data = useSchedules();
  const found = findDay(data.schedules, dayPlan);
  const slot = isNew ? undefined : found?.day.slots.find((s) => s.id === id);

  const state = data.isLoading ? 'loading' : found && (isNew || slot) ? 'ready' : 'missing';
  return (
    <>
      <Stack.Screen options={{ title: isNew ? 'New slot' : 'Edit slot' }} />
      <FormScreen state={state} missingText="This slot no longer exists.">
        <SlotForm key={slot?.id ?? 'new'} dayPlanId={dayPlan} slot={slot} library={data.library} />
      </FormScreen>
    </>
  );
}

function SlotForm({ dayPlanId, slot, library }: { dayPlanId: string; slot?: Slot; library: Library }) {
  const colors = useTheme();
  const save = useSaveSlot();
  const remove = useDeleteSlot();

  const [name, setName] = useState(slot?.name ?? '');
  const [time, setTime] = useState(slot?.time ?? '');
  const [kind, setKind] = useState<SlotKind>(slot?.kind ?? 'planned');
  const [notify, setNotify] = useState(slot?.notify ?? true);
  const [items, setItems] = useState<DraftItem[]>(
    () =>
      slot?.items.map((item) => ({
        key: newKey(),
        foodId: item.food?.id,
        mealId: item.meal?.id,
        quantity: formatNumber(item.quantity),
      })) ?? [],
  );
  const [picking, setPicking] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const resolved = items.flatMap((item) => {
    const food = item.foodId ? library.foodById.get(item.foodId) : undefined;
    const meal = item.mealId ? library.mealById.get(item.mealId) : undefined;
    if (!food && !meal) return [];
    const parsed = parseNumber(item.quantity);
    return [{ ...item, food, meal, parsed, nutrition: roundNutrition(slotItemNutrition({ food, meal, quantity: parsed ?? 0 })) }];
  });
  const total = roundNutrition(sumNutrition(resolved.map((item) => item.nutrition)));

  const normalizedTime = normalizeTime(time);
  const nameError = name.trim() ? null : 'Give the slot a name.';
  const timeError = normalizedTime ? null : 'Enter a time like 09:00.';
  const quantitiesValid = kind === 'open' || resolved.every((item) => item.parsed !== null && item.parsed > 0);
  const valid = !nameError && !timeError && quantitiesValid;

  const submit = () => {
    setShowErrors(true);
    if (!valid) return;
    save.mutate(
      {
        id: slot?.id,
        dayPlan: dayPlanId,
        name: name.trim(),
        time: normalizedTime!,
        kind,
        notify,
        items: resolved.map((item) => ({ food: item.food?.id, meal: item.meal?.id, quantity: item.parsed ?? 0 })),
      },
      { onSuccess: () => router.back() },
    );
  };

  return (
    <>
      <View style={styles.row}>
        <Field label="Name" value={name} onChangeText={setName} placeholder="Breakfast" autoFocus={!slot} error={showErrors ? nameError : null} style={styles.grow} />
        <Field
          label="Time"
          value={time}
          onChangeText={setTime}
          onBlur={() => normalizedTime && setTime(normalizedTime)}
          placeholder="09:00"
          keyboardType="numbers-and-punctuation"
          error={showErrors ? timeError : null}
          style={styles.time}
        />
      </View>

      <View style={styles.group}>
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: 'planned', label: 'Planned meal' },
            { value: 'open', label: 'Open' },
          ]}
        />
        <ThemedText type="small" themeColor="textSecondary">
          {kind === 'planned'
            ? 'You eat the same thing here each time. On the day you only confirm it.'
            : 'Nothing is planned. On the day this slot shows what is left of your target, and you log what you ate.'}
        </ThemedText>
      </View>

      <Card style={styles.switchCard}>
        <View style={styles.grow}>
          <ThemedText type="smallBold">Remind me</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            A notification at {normalizedTime ?? 'the slot time'} to {kind === 'planned' ? 'confirm' : 'log'} this meal.
          </ThemedText>
        </View>
        <Switch
          accessibilityLabel="Remind me"
          value={notify}
          onValueChange={setNotify}
          trackColor={{ true: colors.carb, false: colors.line }}
        />
      </Card>

      {kind === 'planned' ? (
        <>
          <NutritionSummary title="Slot total" nutrition={total} />
          <Card>
            <ThemedText type="eyebrow">What you eat</ThemedText>
            {resolved.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                Nothing added yet. You can save the slot and fill it in later.
              </ThemedText>
            ) : null}
            {resolved.map((item) => (
              <QuantityRow
                key={item.key}
                name={(item.food ?? item.meal)!.name}
                nutrition={item.nutrition}
                quantity={item.quantity}
                unit={item.food ? item.food.unit : '×'}
                step={item.food ? quantityStep(item.food.unit, item.food.ref_amount) : 0.5}
                showError={showErrors}
                onChange={(quantity) => setItems((current) => current.map((i) => (i.key === item.key ? { ...i, quantity } : i)))}
                onRemove={() => setItems((current) => current.filter((i) => i.key !== item.key))}
              />
            ))}
            <Button label="Add a meal or food" onPress={() => setPicking(true)} testID="slot-add-item" />
          </Card>
        </>
      ) : null}

      {save.error ? (
        <ThemedText type="small" themeColor="over">
          {errorMessage(save.error)}
        </ThemedText>
      ) : null}
      <Button label={slot ? 'Save changes' : 'Add slot'} variant="primary" busy={save.isPending} onPress={submit} testID="slot-save" />

      {slot ? (
        <>
          {remove.error ? (
            <ThemedText type="small" themeColor="over">
              {errorMessage(remove.error)}
            </ThemedText>
          ) : null}
          <ConfirmButton
            label="Delete slot"
            confirmLabel="Delete"
            question={`Delete “${slot.name}” from this day?`}
            busy={remove.isPending}
            onConfirm={() => remove.mutateAsync(slot.id).then(() => router.back(), () => undefined)}
          />
        </>
      ) : null}

      <LibraryPicker
        visible={picking}
        title="Add to slot"
        foods={library.foods}
        meals={library.meals}
        onClose={() => setPicking(false)}
        onPickFood={(food) => {
          setItems((current) => [...current, { key: newKey(), foodId: food.id, quantity: formatNumber(food.ref_amount) }]);
          setPicking(false);
        }}
        onPickMeal={(meal) => {
          setItems((current) => [...current, { key: newKey(), mealId: meal.id, quantity: '1' }]);
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
  row: { flexDirection: 'row', gap: Spacing.two },
  grow: { flex: 1, minWidth: 0 },
  time: { width: 104 },
  group: { gap: Spacing.two },
  switchCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
});
