import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FormScreen } from '@/components/form-screen';
import { LibraryPicker } from '@/components/library-picker';
import { QuantityRow } from '@/components/quantity-row';
import { ThemedText } from '@/components/themed-text';
import { Button, ConfirmButton, Field, NutritionSummary, SectionHeader } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { foodNutrition, mealNutrition, roundNutrition } from '@/domain';
import { formatNumber, parseNumber, quantityStep } from '@/lib/format';
import { errorMessage, useArchiveMeal, useLibrary, useSaveMeal, type Meal } from '@/lib/library';
import type { FoodRecord } from '@/lib/types';

type DraftItem = { key: string; foodId: string; quantity: string };

let nextKey = 0;
const newKey = () => `item-${nextKey++}`;

export default function MealScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const library = useLibrary();
  const meal = isNew ? undefined : library.mealById.get(id);

  const state = library.isLoading ? 'loading' : isNew || meal ? 'ready' : 'missing';
  return (
    <>
      <Stack.Screen options={{ title: isNew ? 'New meal' : 'Edit meal' }} />
      <FormScreen state={state} missingText="This meal no longer exists.">
        <MealForm key={meal?.id ?? 'new'} meal={meal} foods={library.foods} foodById={library.foodById} />
      </FormScreen>
    </>
  );
}

function MealForm({ meal, foods, foodById }: { meal?: Meal; foods: FoodRecord[]; foodById: Map<string, FoodRecord> }) {
  const save = useSaveMeal();
  const archive = useArchiveMeal();

  const [name, setName] = useState(meal?.name ?? '');
  const [notes, setNotes] = useState(meal?.notes ?? '');
  const [items, setItems] = useState<DraftItem[]>(
    () => meal?.items.map((item) => ({ key: newKey(), foodId: item.food.id, quantity: formatNumber(item.quantity) })) ?? [],
  );
  const [picking, setPicking] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const resolved = items.flatMap((item) => {
    const food = foodById.get(item.foodId);
    return food ? [{ ...item, food, parsed: parseNumber(item.quantity) }] : [];
  });
  const total = roundNutrition(mealNutrition(resolved.map((item) => ({ food: item.food, quantity: item.parsed ?? 0 }))));

  const nameError = name.trim() ? null : 'Give the meal a name.';
  const itemsError = resolved.length === 0 ? 'Add at least one food.' : null;
  const quantitiesValid = resolved.every((item) => item.parsed !== null && item.parsed > 0);
  const valid = !nameError && !itemsError && quantitiesValid;

  const submit = () => {
    setShowErrors(true);
    if (!valid) return;
    save.mutate(
      {
        id: meal?.id,
        input: {
          name: name.trim(),
          notes: notes.trim(),
          items: resolved.map((item) => ({ food: item.food.id, quantity: item.parsed! })),
        },
      },
      { onSuccess: () => router.back() },
    );
  };

  return (
    <>
      <Field label="Name" value={name} onChangeText={setName} placeholder="Base breakfast" autoFocus={!meal} error={showErrors ? nameError : null} />

      <NutritionSummary title="Meal total" nutrition={total} />

      <View>
        <SectionHeader title="Foods" right={resolved.length ? `${resolved.length} ${resolved.length === 1 ? 'food' : 'foods'}` : undefined} />
        {resolved.length === 0 ? (
          <ThemedText type="small" themeColor={showErrors ? 'over' : 'textSecondary'}>
            {showErrors ? itemsError : 'Nothing added yet.'}
          </ThemedText>
        ) : null}
        {resolved.map((item) => (
          <QuantityRow
            key={item.key}
            name={`${item.food.name}${item.food.archived ? ' (deleted)' : ''}`}
            nutrition={roundNutrition(foodNutrition(item.food, item.parsed ?? 0))}
            quantity={item.quantity}
            unit={item.food.unit}
            step={quantityStep(item.food.unit, item.food.ref_amount)}
            showError={showErrors}
            onChange={(quantity) => setItems((current) => current.map((i) => (i.key === item.key ? { ...i, quantity } : i)))}
            onRemove={() => setItems((current) => current.filter((i) => i.key !== item.key))}
          />
        ))}
        <Button label="Add food" onPress={() => setPicking(true)} testID="meal-add-food" style={styles.add} />
      </View>

      <Field label="Notes (optional)" value={notes} onChangeText={setNotes} placeholder="How you make it, when you eat it" multiline />

      {save.error ? (
        <ThemedText type="small" themeColor="over">
          {errorMessage(save.error)}
        </ThemedText>
      ) : null}
      <Button label={meal ? 'Save changes' : 'Add meal'} variant="primary" busy={save.isPending} onPress={submit} testID="meal-save" />

      {meal ? (
        <>
          {archive.error ? (
            <ThemedText type="small" themeColor="over">
              {errorMessage(archive.error)}
            </ThemedText>
          ) : null}
          <ConfirmButton
            label="Delete meal"
            confirmLabel="Delete"
            question={`Delete “${meal.name}” from your library? Its foods stay.`}
            busy={archive.isPending}
            onConfirm={() => archive.mutate(meal.id, { onSuccess: () => router.back() })}
          />
        </>
      ) : null}

      <LibraryPicker
        visible={picking}
        title="Add food"
        foods={foods}
        onClose={() => setPicking(false)}
        onPickFood={(food) => {
          setItems((current) => [...current, { key: newKey(), foodId: food.id, quantity: formatNumber(food.ref_amount) }]);
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
  add: { marginTop: Spacing.three },
});
