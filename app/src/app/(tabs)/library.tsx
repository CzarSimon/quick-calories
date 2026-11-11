import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Card, MacroLine, Segmented } from '@/components/ui';
import { Spacing, TabScreenTopInset } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatAmount, formatKcal } from '@/lib/format';
import { errorMessage, matchesSearch, useLibrary, type Meal } from '@/lib/library';
import type { FoodRecord } from '@/lib/types';

type Segment = 'foods' | 'meals';

export default function LibraryScreen() {
  const colors = useTheme();
  const library = useLibrary();
  const [segment, setSegment] = useState<Segment>('foods');
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const noun = segment === 'foods' ? 'food' : 'meal';
  const all: (FoodRecord | Meal)[] = segment === 'foods' ? library.foods : library.meals;
  const rows = all.filter((row) => matchesSearch(row.name, query));

  const refresh = async () => {
    setRefreshing(true);
    await library.refetch();
    setRefreshing(false);
  };

  const header = (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <ThemedText type="title">Library</ThemedText>
        <Button
          label={`New ${noun}`}
          variant="primary"
          compact
          testID="library-new"
          onPress={() => router.push(segment === 'foods' ? '/food/new' : '/meal/new')}
        />
      </View>
      <Segmented
        value={segment}
        onChange={setSegment}
        options={[
          { value: 'foods', label: `Foods${library.foods.length ? ` (${library.foods.length})` : ''}` },
          { value: 'meals', label: `Meals${library.meals.length ? ` (${library.meals.length})` : ''}` },
        ]}
      />
      <TextInput
        accessibilityLabel={`Search ${segment}`}
        placeholder={`Search ${segment}`}
        placeholderTextColor={colors.textSecondary}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        clearButtonMode="while-editing"
        style={[styles.search, { backgroundColor: colors.backgroundElement, borderColor: colors.line, color: colors.text }]}
      />
    </View>
  );

  let empty = null;
  if (library.isLoading) {
    empty = <ActivityIndicator style={styles.spinner} />;
  } else if (library.error) {
    empty = (
      <Card>
        <ThemedText type="small">{errorMessage(library.error)}</ThemedText>
        <Button label="Try again" onPress={refresh} />
      </Card>
    );
  } else if (query && all.length > 0) {
    empty = (
      <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
        No {segment} match “{query}”.
      </ThemedText>
    );
  } else {
    empty = (
      <Card>
        <ThemedText type="smallBold">No {segment} yet</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {segment === 'foods'
            ? 'Add a food once with its calories and macros per 100 g, per piece or per serving. You can then use it in meals and plans.'
            : 'A meal is a set of foods with quantities, like your base breakfast. Add the foods first, then build the meal from them.'}
        </ThemedText>
      </Card>
    );
  }

  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.fill} edges={['top']}>
        <FlatList
          data={library.error ? [] : rows}
          keyExtractor={(row) => row.id}
          ListHeaderComponent={header}
          ListEmptyComponent={empty}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          renderItem={({ item }) =>
            segment === 'foods' ? <FoodRow food={item as FoodRecord} /> : <MealRow meal={item as Meal} />
          }
        />
      </SafeAreaView>
    </ThemedView>
  );
}

function FoodRow({ food }: { food: FoodRecord }) {
  const colors = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/food/[id]', params: { id: food.id } })}
      style={({ pressed }) => [styles.row, { backgroundColor: colors.backgroundElement, borderColor: colors.line, opacity: pressed ? 0.7 : 1 }]}>
      <View style={styles.rowMain}>
        <ThemedText type="smallBold">{food.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          per {formatAmount(food.ref_amount, food.unit)}
        </ThemedText>
      </View>
      <View style={styles.rowEnd}>
        <ThemedText type="smallBold" style={styles.tabular}>
          {formatKcal(food.kcal)} kcal
        </ThemedText>
        <MacroLine nutrition={food} />
      </View>
    </Pressable>
  );
}

function MealRow({ meal }: { meal: Meal }) {
  const colors = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/meal/[id]', params: { id: meal.id } })}
      style={({ pressed }) => [styles.row, { backgroundColor: colors.backgroundElement, borderColor: colors.line, opacity: pressed ? 0.7 : 1 }]}>
      <View style={styles.rowMain}>
        <ThemedText type="smallBold">{meal.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
          {meal.items.length
            ? meal.items.map((item) => `${item.food.name} ${formatAmount(item.quantity, item.food.unit)}`).join(' · ')
            : 'No foods yet'}
        </ThemedText>
      </View>
      <View style={styles.rowEnd}>
        <ThemedText type="smallBold" style={styles.tabular}>
          {formatKcal(meal.nutrition.kcal)} kcal
        </ThemedText>
        <MacroLine nutrition={meal.nutrition} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: Spacing.three, paddingTop: Spacing.three + TabScreenTopInset, gap: Spacing.two, paddingBottom: 120 },
  header: { gap: Spacing.three, marginBottom: Spacing.two },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
  search: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingHorizontal: Spacing.three,
  },
  rowMain: { flex: 1, minWidth: 0, gap: 2 },
  rowEnd: { alignItems: 'flex-end', gap: 2 },
  tabular: { fontVariant: ['tabular-nums'] },
  spinner: { marginTop: Spacing.five },
  centered: { textAlign: 'center', marginTop: Spacing.four },
});
