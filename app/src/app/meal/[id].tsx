import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormScreen } from '@/components/form-screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Card, ConfirmButton, Field, MacroLine, NutritionSummary } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { foodNutrition, mealNutrition, roundNutrition } from '@/domain';
import { useTheme } from '@/hooks/use-theme';
import { formatAmount, formatKcal, formatNumber, parseNumber, quantityStep } from '@/lib/format';
import { errorMessage, matchesSearch, useArchiveMeal, useLibrary, useSaveMeal, type Meal } from '@/lib/library';
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
  const colors = useTheme();
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

  const setQuantity = (key: string, quantity: string) =>
    setItems((current) => current.map((item) => (item.key === key ? { ...item, quantity } : item)));
  const step = (key: string, food: FoodRecord, direction: 1 | -1) => {
    const size = quantityStep(food.unit, food.ref_amount);
    setItems((current) =>
      current.map((item) => {
        if (item.key !== key) return item;
        const next = Math.max(size, (parseNumber(item.quantity) ?? 0) + direction * size);
        return { ...item, quantity: formatNumber(next) };
      }),
    );
  };

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

      <Card>
        <ThemedText type="eyebrow">Foods</ThemedText>
        {resolved.length === 0 ? (
          <ThemedText type="small" themeColor={showErrors ? 'over' : 'textSecondary'}>
            {showErrors ? itemsError : 'Nothing added yet.'}
          </ThemedText>
        ) : null}
        {resolved.map((item) => {
          const bad = showErrors && (item.parsed === null || item.parsed <= 0);
          const nutrition = roundNutrition(foodNutrition(item.food, item.parsed ?? 0));
          return (
            <View key={item.key} style={[styles.item, { borderTopColor: colors.line }]}>
              <View style={styles.itemHead}>
                <View style={styles.grow}>
                  <ThemedText type="smallBold">
                    {item.food.name}
                    {item.food.archived ? ' (deleted)' : ''}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.tabular}>
                    {formatKcal(nutrition.kcal)} kcal · <MacroLine nutrition={nutrition} />
                  </ThemedText>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${item.food.name}`}
                  hitSlop={8}
                  onPress={() => setItems((current) => current.filter((i) => i.key !== item.key))}>
                  <ThemedText type="smallBold" themeColor="over">
                    Remove
                  </ThemedText>
                </Pressable>
              </View>
              <View style={styles.quantityRow}>
                <Button label="−" compact onPress={() => step(item.key, item.food, -1)} style={styles.stepButton} />
                <View style={[styles.quantityBox, { borderColor: bad ? colors.over : colors.line, backgroundColor: colors.backgroundSelected }]}>
                  <TextInput
                    accessibilityLabel={`Quantity of ${item.food.name}`}
                    value={item.quantity}
                    onChangeText={(text) => setQuantity(item.key, text)}
                    keyboardType="decimal-pad"
                    selectTextOnFocus
                    style={[styles.quantityInput, { color: colors.text }]}
                  />
                  <ThemedText type="small" themeColor="textSecondary">
                    {item.food.unit}
                  </ThemedText>
                </View>
                <Button label="+" compact onPress={() => step(item.key, item.food, 1)} style={styles.stepButton} />
              </View>
              {bad ? (
                <ThemedText type="small" themeColor="over">
                  Enter a quantity above 0.
                </ThemedText>
              ) : null}
            </View>
          );
        })}
        <Button label="Add food" onPress={() => setPicking(true)} testID="meal-add-food" />
      </Card>

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

      <FoodPicker
        visible={picking}
        foods={foods}
        onClose={() => setPicking(false)}
        onPick={(food) => {
          setItems((current) => [...current, { key: newKey(), foodId: food.id, quantity: formatNumber(food.ref_amount) }]);
          setPicking(false);
        }}
        onCreate={() => {
          setPicking(false);
          router.push('/food/new');
        }}
      />
    </>
  );
}

function FoodPicker({
  visible,
  foods,
  onClose,
  onPick,
  onCreate,
}: {
  visible: boolean;
  foods: FoodRecord[];
  onClose: () => void;
  onPick: (food: FoodRecord) => void;
  onCreate: () => void;
}) {
  const colors = useTheme();
  const [query, setQuery] = useState('');
  const rows = foods.filter((food) => matchesSearch(food.name, query));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ThemedView style={styles.fill}>
        <SafeAreaView style={styles.fill} edges={['top']}>
          <View style={styles.pickerHead}>
            <ThemedText type="subtitle">Add food</ThemedText>
            <Button label="Close" compact onPress={onClose} />
          </View>
          <TextInput
            accessibilityLabel="Search foods"
            placeholder="Search foods"
            placeholderTextColor={colors.textSecondary}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            clearButtonMode="while-editing"
            style={[styles.search, { backgroundColor: colors.backgroundElement, borderColor: colors.line, color: colors.text }]}
          />
          <FlatList
            data={rows}
            keyExtractor={(food) => food.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.pickerList}
            ListEmptyComponent={
              <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
                {foods.length === 0 ? 'Your library has no foods yet.' : `No foods match “${query}”.`}
              </ThemedText>
            }
            ListFooterComponent={<Button label="Create a new food" onPress={onCreate} style={styles.pickerFooter} />}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                onPress={() => onPick(item)}
                style={({ pressed }) => [
                  styles.pickerRow,
                  { backgroundColor: colors.backgroundElement, borderColor: colors.line, opacity: pressed ? 0.7 : 1 },
                ]}>
                <View style={styles.grow}>
                  <ThemedText type="smallBold">{item.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    per {formatAmount(item.ref_amount, item.unit)}
                  </ThemedText>
                </View>
                <ThemedText type="smallBold" style={styles.tabular}>
                  {formatKcal(item.kcal)} kcal
                </ThemedText>
              </Pressable>
            )}
          />
        </SafeAreaView>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1, minWidth: 0 },
  tabular: { fontVariant: ['tabular-nums'] },
  item: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.two, gap: Spacing.two },
  itemHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  quantityRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  stepButton: { width: 44 },
  quantityBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    gap: Spacing.one,
  },
  quantityInput: { flex: 1, minWidth: 0, paddingVertical: 8, fontSize: 16, textAlign: 'right', fontVariant: ['tabular-nums'] },
  pickerHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.three },
  search: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, marginHorizontal: Spacing.three },
  pickerList: { padding: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.six },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingHorizontal: Spacing.three,
  },
  pickerFooter: { marginTop: Spacing.two },
  centered: { textAlign: 'center', marginVertical: Spacing.four },
});
