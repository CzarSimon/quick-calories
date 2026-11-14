import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Card, ListRow, Segmented, WEB_NO_OUTLINE } from '@/components/ui';
import { Radius, ScreenMargin, Spacing, TabScreenTopInset } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatAmount, formatKcal, formatNumber } from '@/lib/format';
import { errorMessage, matchesSearch, useLibrary, type Meal } from '@/lib/library';
import type { FoodRecord } from '@/lib/types';

type Segment = 'meals' | 'foods';

export default function LibraryScreen() {
  const colors = useTheme();
  const library = useLibrary();
  // Meals first: logging and planning mostly reuse whole meals.
  const [segment, setSegment] = useState<Segment>('meals');
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const all: (FoodRecord | Meal)[] = segment === 'foods' ? library.foods : library.meals;
  const rows = all.filter((row) => matchesSearch(row.name, query));
  const createNew = () => router.push(segment === 'foods' ? '/food/new' : '/meal/new');

  const refresh = async () => {
    setRefreshing(true);
    await library.refetch();
    setRefreshing(false);
  };

  const header = (
    <View style={styles.header}>
      <ThemedText type="title" accessibilityRole="header">
        Library
      </ThemedText>
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
      <Segmented
        variant="underline"
        value={segment}
        onChange={(next) => setSegment(next)}
        options={[
          { value: 'meals', label: 'Meals' },
          { value: 'foods', label: 'Foods' },
        ]}
      />
      <View style={styles.countRow}>
        <ThemedText type="caption" themeColor="textSecondary" style={styles.grow}>
          {query ? `${rows.length} of ${all.length}` : all.length} {segment}
        </ThemedText>
        <Button label={segment === 'foods' ? '+ Food' : '+ Meal'} variant="text" onPress={createNew} testID="library-new" />
      </View>
    </View>
  );

  let empty = null;
  if (library.isLoading) {
    empty = <ActivityIndicator style={styles.spinner} />;
  } else if (library.error) {
    empty = (
      <Card tone="selected">
        <ThemedText type="small">{errorMessage(library.error)}</ThemedText>
        <Button label="Try again" onPress={refresh} style={{ backgroundColor: colors.backgroundElement }} />
      </Card>
    );
  } else if (query && all.length > 0) {
    empty = (
      <View style={styles.noMatch}>
        <ThemedText type="small" themeColor="textSecondary">
          No {segment} match “{query}”.
        </ThemedText>
        <Button
          label={`Create “${query.trim()}” as a food`}
          variant="text"
          onPress={() => router.push({ pathname: '/food/[id]', params: { id: 'new', name: query.trim() } })}
          testID="library-create-from-search"
          style={styles.start}
        />
      </View>
    );
  } else {
    empty = (
      <Card tone="selected">
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
          renderItem={({ item, index }) =>
            segment === 'foods' ? <FoodRow food={item as FoodRecord} first={index === 0} /> : <MealRow meal={item as Meal} first={index === 0} />
          }
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const macros = (n: { carbs_g: number; protein_g: number; fat_g: number }) =>
  `C ${formatNumber(n.carbs_g)} · P ${formatNumber(n.protein_g)} · F ${formatNumber(n.fat_g)}`;

function FoodRow({ food, first }: { food: FoodRecord; first: boolean }) {
  return (
    <ListRow
      first={first}
      title={food.name}
      subtitle={`per ${formatAmount(food.ref_amount, food.unit)} · ${macros(food)}`}
      trailing={`${formatKcal(food.kcal)} kcal`}
      onPress={() => router.push({ pathname: '/food/[id]', params: { id: food.id } })}
      accessibilityLabel={`${food.name}, ${formatKcal(food.kcal)} kcal per ${formatAmount(food.ref_amount, food.unit)}`}
    />
  );
}

function MealRow({ meal, first }: { meal: Meal; first: boolean }) {
  return (
    <ListRow
      first={first}
      title={meal.name}
      subtitle={meal.items.length ? meal.items.map((item) => item.food.name).join(' · ') : 'No foods yet'}
      trailing={`${formatKcal(meal.nutrition.kcal)} kcal`}
      onPress={() => router.push({ pathname: '/meal/[id]', params: { id: meal.id } })}
      accessibilityLabel={`${meal.name}, ${formatKcal(meal.nutrition.kcal)} kcal`}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1, minWidth: 0 },
  content: { paddingHorizontal: ScreenMargin, paddingTop: Spacing.three + TabScreenTopInset, paddingBottom: 120 },
  header: { gap: Spacing.three },
  search: { borderWidth: 1, borderRadius: Radius.medium, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, ...WEB_NO_OUTLINE },
  countRow: { flexDirection: 'row', alignItems: 'center', marginTop: -Spacing.two },
  noMatch: { gap: Spacing.one, marginTop: Spacing.three },
  start: { alignSelf: 'flex-start', marginLeft: -Spacing.two },
  spinner: { marginTop: Spacing.five },
});
