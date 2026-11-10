import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FormScreen } from '@/components/form-screen';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, ConfirmButton, Field, Segmented } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { macroKcal } from '@/domain';
import { defaultRefAmount, formatKcal, formatNumber, parseNumber } from '@/lib/format';
import { errorMessage, useArchiveFood, useLibrary, useSaveFood } from '@/lib/library';
import type { FoodRecord, FoodUnit } from '@/lib/types';

const UNITS: { value: FoodUnit; label: string }[] = [
  { value: 'g', label: 'g' },
  { value: 'ml', label: 'ml' },
  { value: 'piece', label: 'piece' },
  { value: 'slice', label: 'slice' },
  { value: 'serving', label: 'serving' },
];

export default function FoodScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const library = useLibrary();
  const food = isNew ? undefined : library.foodById.get(id);

  const state = isNew || food ? 'ready' : library.isLoading ? 'loading' : 'missing';
  return (
    <>
      <Stack.Screen options={{ title: isNew ? 'New food' : 'Edit food' }} />
      <FormScreen state={state} missingText="This food no longer exists.">
        <FoodForm key={food?.id ?? 'new'} food={food} />
      </FormScreen>
    </>
  );
}

function FoodForm({ food }: { food?: FoodRecord }) {
  const save = useSaveFood();
  const archive = useArchiveFood();

  const [name, setName] = useState(food?.name ?? '');
  const [unit, setUnit] = useState<FoodUnit>(food?.unit ?? 'g');
  const [refAmount, setRefAmount] = useState(formatNumber(food?.ref_amount ?? 100));
  const [kcal, setKcal] = useState(food ? formatNumber(food.kcal) : '');
  const [carbs, setCarbs] = useState(food ? formatNumber(food.carbs_g) : '');
  const [protein, setProtein] = useState(food ? formatNumber(food.protein_g) : '');
  const [fat, setFat] = useState(food ? formatNumber(food.fat_g) : '');
  const [showErrors, setShowErrors] = useState(false);

  const values = {
    ref_amount: parseNumber(refAmount),
    kcal: parseNumber(kcal),
    carbs_g: parseNumber(carbs),
    protein_g: parseNumber(protein),
    fat_g: parseNumber(fat),
  };
  const errors = {
    name: name.trim() ? null : 'Give the food a name.',
    ref_amount: values.ref_amount && values.ref_amount > 0 ? null : 'Enter an amount above 0.',
    kcal: values.kcal === null ? 'Enter the calories.' : null,
    carbs_g: values.carbs_g === null ? 'Enter a number (0 if none).' : null,
    protein_g: values.protein_g === null ? 'Enter a number (0 if none).' : null,
    fat_g: values.fat_g === null ? 'Enter a number (0 if none).' : null,
  };
  const valid = Object.values(errors).every((e) => e === null);
  const shown = (key: keyof typeof errors) => (showErrors ? errors[key] : null);

  // Help catch typos: compare the typed kcal with what the macros add up to (4/4/9 kcal per gram).
  const macrosComplete = values.carbs_g !== null && values.protein_g !== null && values.fat_g !== null;
  const fromMacros = macrosComplete
    ? Math.round(macroKcal({ carbs_g: values.carbs_g!, protein_g: values.protein_g!, fat_g: values.fat_g! }))
    : null;
  const kcalOff =
    fromMacros !== null &&
    fromMacros > 0 &&
    (values.kcal === null || Math.abs(values.kcal - fromMacros) > Math.max(10, fromMacros * 0.1));

  const changeUnit = (next: FoodUnit) => {
    // Keep a custom amount, but swap the default when the unit family changes.
    if (parseNumber(refAmount) === defaultRefAmount(unit)) setRefAmount(String(defaultRefAmount(next)));
    setUnit(next);
  };

  const submit = () => {
    setShowErrors(true);
    if (!valid) return;
    save.mutate(
      {
        id: food?.id,
        input: {
          name: name.trim(),
          unit,
          ref_amount: values.ref_amount!,
          kcal: values.kcal!,
          carbs_g: values.carbs_g!,
          protein_g: values.protein_g!,
          fat_g: values.fat_g!,
        },
      },
      { onSuccess: () => router.back() },
    );
  };

  const perLabel = `Per ${refAmount.trim() || '…'} ${unit}`;

  return (
    <>
      <Field label="Name" value={name} onChangeText={setName} placeholder="Oats" autoFocus={!food} error={shown('name')} returnKeyType="next" />

      <View style={styles.group}>
        <ThemedText type="eyebrow">Measured in</ThemedText>
        <Segmented options={UNITS} value={unit} onChange={changeUnit} />
      </View>

      <Field
        label="Values below are per"
        value={refAmount}
        onChangeText={setRefAmount}
        keyboardType="decimal-pad"
        suffix={unit}
        error={shown('ref_amount')}
      />

      <Card>
        <ThemedText type="eyebrow">{perLabel}</ThemedText>
        <Field label="Calories" value={kcal} onChangeText={setKcal} keyboardType="decimal-pad" suffix="kcal" error={shown('kcal')} />
        <View style={styles.macroRow}>
          <Field label="Carbs" value={carbs} onChangeText={setCarbs} keyboardType="decimal-pad" suffix="g" error={shown('carbs_g')} style={styles.grow} />
          <Field label="Protein" value={protein} onChangeText={setProtein} keyboardType="decimal-pad" suffix="g" error={shown('protein_g')} style={styles.grow} />
          <Field label="Fat" value={fat} onChangeText={setFat} keyboardType="decimal-pad" suffix="g" error={shown('fat_g')} style={styles.grow} />
        </View>
        {kcalOff ? (
          <View style={styles.hint}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.grow}>
              These macros add up to about {formatKcal(fromMacros!)} kcal.
            </ThemedText>
            <Button label={`Use ${formatKcal(fromMacros!)}`} compact onPress={() => setKcal(String(fromMacros))} />
          </View>
        ) : null}
      </Card>

      {save.error ? (
        <ThemedText type="small" themeColor="over">
          {errorMessage(save.error)}
        </ThemedText>
      ) : null}
      <Button label={food ? 'Save changes' : 'Add food'} variant="primary" busy={save.isPending} onPress={submit} testID="food-save" />

      {food ? (
        <>
          {archive.error ? (
            <ThemedText type="small" themeColor="over">
              {errorMessage(archive.error)}
            </ThemedText>
          ) : null}
          <ConfirmButton
            label="Delete food"
            confirmLabel="Delete"
            question={`Delete “${food.name}” from your library? Meals that already use it keep it.`}
            busy={archive.isPending}
            onConfirm={() => archive.mutate(food.id, { onSuccess: () => router.back() })}
          />
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  group: { gap: Spacing.one },
  macroRow: { flexDirection: 'row', gap: Spacing.two },
  grow: { flex: 1, minWidth: 0 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
