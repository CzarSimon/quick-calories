/** Nutrition totals for foods, meals and logged entries. */

import type { FoodRecord } from '@/lib/types';

export type Nutrition = { kcal: number; carbs_g: number; protein_g: number; fat_g: number };

export type FoodNutrition = Pick<FoodRecord, 'ref_amount' | 'kcal' | 'carbs_g' | 'protein_g' | 'fat_g'>;

export const ZERO_NUTRITION: Nutrition = { kcal: 0, carbs_g: 0, protein_g: 0, fat_g: 0 };

export function addNutrition(a: Nutrition, b: Nutrition): Nutrition {
  return {
    kcal: a.kcal + b.kcal,
    carbs_g: a.carbs_g + b.carbs_g,
    protein_g: a.protein_g + b.protein_g,
    fat_g: a.fat_g + b.fat_g,
  };
}

export function scaleNutrition(n: Nutrition, factor: number): Nutrition {
  return { kcal: n.kcal * factor, carbs_g: n.carbs_g * factor, protein_g: n.protein_g * factor, fat_g: n.fat_g * factor };
}

export function sumNutrition(items: Nutrition[]): Nutrition {
  return items.reduce(addNutrition, ZERO_NUTRITION);
}

/** Nutrition of `quantity` of a food, where the food's values are given per `ref_amount`. */
export function foodNutrition(food: FoodNutrition, quantity: number): Nutrition {
  if (!(food.ref_amount > 0)) return ZERO_NUTRITION;
  return scaleNutrition(food, quantity / food.ref_amount);
}

/** Nutrition of a meal (recipe): the sum of its foods, times the number of servings. */
export function mealNutrition(items: { food: FoodNutrition; quantity: number }[], servings = 1): Nutrition {
  return scaleNutrition(sumNutrition(items.map((item) => foodNutrition(item.food, item.quantity))), servings);
}

/** Round for display and for snapshots stored on log entries: whole kcal, grams to one decimal. */
export function roundNutrition(n: Nutrition): Nutrition {
  const g = (x: number) => Math.round(x * 10) / 10;
  return { kcal: Math.round(n.kcal), carbs_g: g(n.carbs_g), protein_g: g(n.protein_g), fat_g: g(n.fat_g) };
}
