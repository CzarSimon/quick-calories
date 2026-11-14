import { useState } from 'react';
import { FlatList, Modal, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { QuickEntryForm } from '@/components/quick-entry';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, ListRow, Segmented, WEB_NO_OUTLINE } from '@/components/ui';
import { Radius, ScreenMargin, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { EntryDraft } from '@/lib/daylog-model';
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
  /**
   * Offer "Enter macros directly" for an item with no library food (when logging what was eaten).
   * Left out when planning: a plan item or meal ingredient must point at the library.
   */
  onQuickEntry?: (draft: EntryDraft) => void;
  onClose: () => void;
};

/** A searchable sheet for picking a food (or a meal) from the library, or typing a dish's macros. */
export function LibraryPicker({ visible, title, foods, meals, onPickFood, onPickMeal, onCreateFood, onQuickEntry, onClose }: Props) {
  const colors = useTheme();
  const [query, setQuery] = useState('');
  const [segment, setSegment] = useState<'meals' | 'foods'>(meals && meals.length > 0 ? 'meals' : 'foods');
  const [quick, setQuick] = useState(false);
  const showMeals = !!meals && !!onPickMeal;
  const active = showMeals ? segment : 'foods';

  const rows: (FoodRecord | Meal)[] = (active === 'foods' ? foods : (meals ?? [])).filter((row) => matchesSearch(row.name, query));
  const total = active === 'foods' ? foods.length : (meals?.length ?? 0);

  const close = () => {
    setQuick(false);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <ThemedView style={styles.fill}>
        <SafeAreaView style={styles.fill} edges={['top']}>
          <View style={styles.head}>
            <ThemedText type="subtitle" style={styles.grow} numberOfLines={1}>
              {quick ? 'Enter macros' : title}
            </ThemedText>
            <Button label="Close" variant="text" onPress={close} testID="picker-close" />
          </View>
          {quick && onQuickEntry ? (
            <ScrollView contentContainerStyle={styles.quick} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
              <QuickEntryForm
                onCancel={() => setQuick(false)}
                onAdd={(draft) => {
                  setQuick(false);
                  onQuickEntry(draft);
                }}
              />
            </ScrollView>
          ) : (
            <>
              <View style={styles.controls}>
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
                {showMeals ? (
                  <Segmented
                    variant="underline"
                    value={segment}
                    onChange={setSegment}
                    options={[
                      { value: 'meals', label: 'Meals' },
                      { value: 'foods', label: 'Foods' },
                    ]}
                  />
                ) : null}
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
                  <View style={styles.footer}>
                    {onQuickEntry ? <Button label="Enter macros directly" onPress={() => setQuick(true)} testID="picker-quick-entry" /> : null}
                    <Button label="Create a new food" onPress={onCreateFood} testID="picker-create-food" />
                  </View>
                }
                renderItem={({ item }) => {
                  const isFood = active === 'foods';
                  const food = item as FoodRecord;
                  const meal = item as Meal;
                  return (
                    <ListRow
                      title={item.name}
                      subtitle={isFood ? `per ${formatAmount(food.ref_amount, food.unit)}` : meal.items.map((i) => i.food.name).join(' · ') || 'No foods yet'}
                      trailing={`${formatKcal(isFood ? food.kcal : meal.nutrition.kcal)} kcal`}
                      onPress={() => (isFood ? onPickFood(food) : onPickMeal?.(meal))}
                      accessibilityLabel={`Add ${item.name}`}
                    />
                  );
                }}
              />
            </>
          )}
        </SafeAreaView>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1, minWidth: 0 },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: ScreenMargin, paddingVertical: Spacing.two },
  controls: { paddingHorizontal: ScreenMargin, gap: Spacing.two },
  search: { borderWidth: 1, borderRadius: Radius.medium, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, ...WEB_NO_OUTLINE },
  list: { paddingHorizontal: ScreenMargin, paddingBottom: Spacing.six },
  quick: { paddingHorizontal: ScreenMargin, paddingBottom: Spacing.six },
  footer: { gap: Spacing.two, marginTop: Spacing.three },
  centered: { textAlign: 'center', marginVertical: Spacing.four },
});
