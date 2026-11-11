/** Pure library model: joins foods, meals and meal items into what the screens show. */

import { mealNutrition, roundNutrition, type Nutrition } from '@/domain';
import type { FoodRecord, MealItemRecord, MealRecord } from '@/lib/types';

export type MealItem = { id: string; food: FoodRecord; quantity: number };
export type Meal = MealRecord & { items: MealItem[]; nutrition: Nutrition };

export type Library = {
  /** Active foods, sorted by name. */
  foods: FoodRecord[];
  /** Active meals with their items and totals, sorted by name. */
  meals: Meal[];
  /** Every food by id, archived ones included (meals may still use them). */
  foodById: Map<string, FoodRecord>;
  mealById: Map<string, Meal>;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
};

/** Join foods, meals and meal items into what the screens show. Pure, so it can be tested. */
export function buildLibrary(foods: FoodRecord[], meals: MealRecord[], mealItems: MealItemRecord[]) {
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  const foodById = new Map(foods.map((f) => [f.id, f]));

  const itemsByMeal = new Map<string, MealItem[]>();
  for (const item of [...mealItems].sort((a, b) => a.sort - b.sort)) {
    const food = foodById.get(item.food);
    if (!food) continue;
    itemsByMeal.set(item.meal, [...(itemsByMeal.get(item.meal) ?? []), { id: item.id, food, quantity: item.quantity }]);
  }

  const allMeals: Meal[] = meals.map((meal) => {
    const items = itemsByMeal.get(meal.id) ?? [];
    return { ...meal, items, nutrition: roundNutrition(mealNutrition(items)) };
  });

  return {
    foods: foods.filter((f) => !f.archived).sort(byName),
    meals: allMeals.filter((m) => !m.archived).sort(byName),
    foodById,
    mealById: new Map(allMeals.map((m) => [m.id, m])),
  };
}

/** Case-insensitive name search; every word typed must appear in the name. */
export function matchesSearch(name: string, query: string): boolean {
  const haystack = name.toLocaleLowerCase();
  return query
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}
