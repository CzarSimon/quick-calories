import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Segmented } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatAmount, formatKcal } from '@/lib/format';
import { matchesSearch, type Meal } from '@/lib/library-model';
import type { FoodRecord } from '@/lib/types';

type Props = {
  visible: boolean;
  title: string;
  foods: FoodRecord[];
  /** Pass meals (and onPickMeal) to offer a Meals tab as well. */
  meals?: Meal[];
  onPickFood: (food: FoodRecord) => void;
  onPickMeal?: (meal: Meal) => void;
  onCreateFood: () => void;
  onClose: () => void;
};

/** A searchable sheet for picking a food (or a meal) from the library. */
export function LibraryPicker({ visible, title, foods, meals, onPickFood, onPickMeal, onCreateFood, onClose }: Props) {
  const colors = useTheme();
  const [query, setQuery] = useState('');
  const [segment, setSegment] = useState<'meals' | 'foods'>(meals && meals.length > 0 ? 'meals' : 'foods');
  const showMeals = !!meals && !!onPickMeal;
  const active = showMeals ? segment : 'foods';

  const rows: (FoodRecord | Meal)[] = (active === 'foods' ? foods : (meals ?? [])).filter((row) => matchesSearch(row.name, query));
  const total = active === 'foods' ? foods.length : (meals?.length ?? 0);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ThemedView style={styles.fill}>
        <SafeAreaView style={styles.fill} edges={['top']}>
          <View style={styles.head}>
            <ThemedText type="subtitle">{title}</ThemedText>
            <Button label="Close" compact onPress={onClose} />
          </View>
          <View style={styles.controls}>
            {showMeals ? (
              <Segmented
                value={segment}
                onChange={setSegment}
                options={[
                  { value: 'meals', label: 'Meals' },
                  { value: 'foods', label: 'Foods' },
                ]}
              />
            ) : null}
            <TextInput
              accessibilityLabel={`Search ${active}`}
              placeholder={`Search ${active}`}
              placeholderTextColor={colors.textSecondary}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              clearButtonMode="while-editing"
              style={[styles.search, { backgroundColor: colors.backgroundElement, borderColor: colors.line, color: colors.text }]}
            />
          </View>
          <FlatList
            data={rows}
            keyExtractor={(row) => row.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
                {total === 0 ? `Your library has no ${active} yet.` : `No ${active} match “${query}”.`}
              </ThemedText>
            }
            ListFooterComponent={
              active === 'foods' ? <Button label="Create a new food" onPress={onCreateFood} style={styles.footer} /> : undefined
            }
            renderItem={({ item }) => {
              const isFood = active === 'foods';
              const food = item as FoodRecord;
              const meal = item as Meal;
              return (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => (isFood ? onPickFood(food) : onPickMeal?.(meal))}
                  style={({ pressed }) => [
                    styles.row,
                    { backgroundColor: colors.backgroundElement, borderColor: colors.line, opacity: pressed ? 0.7 : 1 },
                  ]}>
                  <View style={styles.grow}>
                    <ThemedText type="smallBold">{item.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                      {isFood
                        ? `per ${formatAmount(food.ref_amount, food.unit)}`
                        : meal.items.map((i) => i.food.name).join(' · ') || 'No foods yet'}
                    </ThemedText>
                  </View>
                  <ThemedText type="smallBold" style={styles.tabular}>
                    {formatKcal(isFood ? food.kcal : meal.nutrition.kcal)} kcal
                  </ThemedText>
                </Pressable>
              );
            }}
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
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.three },
  controls: { paddingHorizontal: Spacing.three, gap: Spacing.two },
  search: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  list: { padding: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.six },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingHorizontal: Spacing.three,
  },
  footer: { marginTop: Spacing.two },
  centered: { textAlign: 'center', marginVertical: Spacing.four },
});
