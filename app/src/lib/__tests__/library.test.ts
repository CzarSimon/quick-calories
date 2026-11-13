import { describe, expect, it } from '@jest/globals';

import { buildLibrary, matchesSearch } from '@/lib/library-model';
import type { FoodRecord, MealItemRecord, MealRecord } from '@/lib/types';

const base = { user: 'u1', created: '', updated: '' };
const food = (id: string, name: string, extra: Partial<FoodRecord> = {}): FoodRecord => ({
  ...base,
  id,
  name,
  ref_amount: 100,
  unit: 'g',
  kcal: 370,
  carbs_g: 60,
  protein_g: 13,
  fat_g: 7,
  source: 'manual',
  archived: false,
  ...extra,
});
const meal = (id: string, name: string, archived = false): MealRecord => ({ ...base, id, name, notes: '', source: 'manual', archived });
const item = (id: string, mealId: string, foodId: string, quantity: number, sort: number): MealItemRecord => ({
  ...base,
  id,
  meal: mealId,
  food: foodId,
  quantity,
  sort,
});

describe('buildLibrary', () => {
  const foods = [
    food('f1', 'oats'),
    food('f2', 'Banana', { ref_amount: 1, unit: 'piece', kcal: 107, carbs_g: 27, protein_g: 1.3, fat_g: 0.4 }),
    food('f3', 'Old honey', { archived: true, ref_amount: 15, kcal: 46, carbs_g: 12, protein_g: 0, fat_g: 0 }),
  ];
  const meals = [meal('m1', 'Base breakfast'), meal('m2', 'Archived meal', true), meal('m3', 'apple bowl')];
  const items = [item('i2', 'm1', 'f2', 1, 1), item('i1', 'm1', 'f1', 120, 0), item('i3', 'm1', 'f3', 15, 2), item('i4', 'm1', 'gone', 1, 3)];

  const lib = buildLibrary(foods, meals, items);

  it('hides archived foods and meals and sorts by name ignoring case', () => {
    expect(lib.foods.map((f) => f.name)).toEqual(['Banana', 'oats']);
    expect(lib.meals.map((m) => m.name)).toEqual(['apple bowl', 'Base breakfast']);
  });

  it('joins items in order, keeps archived foods inside meals and skips missing ones', () => {
    const m = lib.mealById.get('m1')!;
    expect(m.items.map((i) => i.food.name)).toEqual(['oats', 'Banana', 'Old honey']);
    expect(m.nutrition).toEqual({ kcal: 597, carbs_g: 111, protein_g: 16.9, fat_g: 8.8 });
  });

  it('gives an empty meal zero nutrition', () => {
    expect(lib.mealById.get('m3')!.nutrition).toEqual({ kcal: 0, carbs_g: 0, protein_g: 0, fat_g: 0 });
  });

  it('can still look up archived records by id', () => {
    expect(lib.foodById.get('f3')?.name).toBe('Old honey');
    expect(lib.mealById.get('m2')?.name).toBe('Archived meal');
  });
});

describe('matchesSearch', () => {
  it('matches every typed word, ignoring case', () => {
    expect(matchesSearch('Chicken breast', '')).toBe(true);
    expect(matchesSearch('Chicken breast', 'chick')).toBe(true);
    expect(matchesSearch('Chicken breast', 'breast chi')).toBe(true);
    expect(matchesSearch('Chicken breast', 'rice')).toBe(false);
    expect(matchesSearch('Blåbär', 'BLÅ')).toBe(true);
  });
});
