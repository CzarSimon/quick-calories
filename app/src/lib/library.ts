/**
 * Library data access: foods and meals (recipes made of foods × quantity).
 *
 * Foods and meals are never hard-deleted from the app. Schedules and logs may point at them,
 * so "delete" archives the record and hides it from lists and pickers.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { buildLibrary, type Library } from '@/lib/library-model';
import { currentUserId, pb } from '@/lib/pocketbase';
import { LOADER_STALE_MS, queryClient } from '@/lib/query-client';
import type { FoodRecord, FoodUnit, MealItemRecord, MealRecord } from '@/lib/types';

const KEYS = {
  foods: ['foods'] as const,
  meals: ['meals'] as const,
  mealItems: ['meal_items'] as const,
};

export { buildLibrary, matchesSearch, type Library, type Meal, type MealItem } from '@/lib/library-model';

const QUERIES = {
  foods: { queryKey: KEYS.foods, queryFn: () => pb.collection('foods').getFullList<FoodRecord>() },
  meals: { queryKey: KEYS.meals, queryFn: () => pb.collection('meals').getFullList<MealRecord>() },
  mealItems: { queryKey: KEYS.mealItems, queryFn: () => pb.collection('meal_items').getFullList<MealItemRecord>() },
};

/** The library for code outside React (reminders). Reuses fresh cached data. */
export async function loadLibrary() {
  const [foods, meals, mealItems] = await Promise.all([
    queryClient.fetchQuery({ ...QUERIES.foods, staleTime: LOADER_STALE_MS }),
    queryClient.fetchQuery({ ...QUERIES.meals, staleTime: LOADER_STALE_MS }),
    queryClient.fetchQuery({ ...QUERIES.mealItems, staleTime: LOADER_STALE_MS }),
  ]);
  return buildLibrary(foods, meals, mealItems);
}

export function useLibrary(): Library {
  const foods = useQuery(QUERIES.foods);
  const meals = useQuery(QUERIES.meals);
  const mealItems = useQuery(QUERIES.mealItems);

  const built = useMemo(
    () => buildLibrary(foods.data ?? [], meals.data ?? [], mealItems.data ?? []),
    [foods.data, meals.data, mealItems.data],
  );

  return {
    ...built,
    isLoading: foods.isLoading || meals.isLoading || mealItems.isLoading,
    error: foods.error ?? meals.error ?? mealItems.error ?? null,
    refetch: () => Promise.all([foods.refetch(), meals.refetch(), mealItems.refetch()]),
  };
}

export type FoodInput = {
  name: string;
  ref_amount: number;
  unit: FoodUnit;
  kcal: number;
  carbs_g: number;
  protein_g: number;
  fat_g: number;
};

export function useSaveFood() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: FoodInput }) =>
      id
        ? pb.collection('foods').update<FoodRecord>(id, input)
        : pb.collection('foods').create<FoodRecord>({ ...input, user: currentUserId(), source: 'manual' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEYS.foods }),
  });
}

export function useArchiveFood() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => pb.collection('foods').update<FoodRecord>(id, { archived: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEYS.foods }),
  });
}

export type MealInput = {
  name: string;
  notes: string;
  items: { food: string; quantity: number }[];
};

export function useSaveMeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: MealInput }) => {
      const user = currentUserId();
      const fields = { name: input.name, notes: input.notes };
      const meal = id
        ? await pb.collection('meals').update<MealRecord>(id, fields)
        : await pb.collection('meals').create<MealRecord>({ ...fields, user, source: 'manual' });

      // Reuse existing item rows in order, then create or delete the difference.
      const existing = id
        ? await pb.collection('meal_items').getFullList<MealItemRecord>({ filter: pb.filter('meal = {:id}', { id }), sort: 'sort' })
        : [];
      for (const [sort, item] of input.items.entries()) {
        const row = existing[sort];
        if (!row) {
          await pb.collection('meal_items').create({ user, meal: meal.id, sort, ...item });
        } else if (row.food !== item.food || row.quantity !== item.quantity || row.sort !== sort) {
          await pb.collection('meal_items').update(row.id, { sort, ...item });
        }
      }
      for (const row of existing.slice(input.items.length)) {
        await pb.collection('meal_items').delete(row.id);
      }
      return meal;
    },
    // Also after a failure: some item rows may already have been written.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: KEYS.meals }),
        queryClient.invalidateQueries({ queryKey: KEYS.mealItems }),
      ]),
  });
}

export function useArchiveMeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => pb.collection('meals').update<MealRecord>(id, { archived: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEYS.meals }),
  });
}

/** A short, human message for a failed request. */
export function errorMessage(err: unknown): string {
  const status = (err as { status?: number })?.status;
  if (status === 0 || status === undefined) return "Can't reach the server. Check your connection and try again.";
  if (status === 429) return 'The server is busy. Wait a moment and try again.';
  if (status === 401 || status === 403) return 'Your session has expired. Sign out and sign in again.';
  return 'Something went wrong while saving. Try again.';
}
