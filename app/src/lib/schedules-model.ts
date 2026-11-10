/** Pure schedule model: joins schedules, day plans, slots and slot items into what the screens show. */

import { foodNutrition, roundNutrition, scaleNutrition, sumNutrition, type Nutrition } from '@/domain';
import type { Meal } from '@/lib/library-model';
import type {
  DayPlanRecord,
  FoodRecord,
  LabelRecord,
  PlanSlotItemRecord,
  PlanSlotRecord,
  ScheduleRecord,
} from '@/lib/types';

export type SlotItem = {
  id: string;
  quantity: number;
  /** Exactly one of food / meal is set. For a meal, quantity is the number of servings. */
  food?: FoodRecord;
  meal?: Meal;
  name: string;
  nutrition: Nutrition;
};

export type Slot = PlanSlotRecord & { items: SlotItem[]; nutrition: Nutrition };
export type Day = DayPlanRecord & { slots: Slot[] };
export type Schedule = ScheduleRecord & { days: Day[]; labelRecords: LabelRecord[] };

type LibraryLookup = { foodById: Map<string, FoodRecord>; mealById: Map<string, Meal> };

export function slotItemNutrition(item: { food?: FoodRecord; meal?: Meal; quantity: number }): Nutrition {
  if (item.food) return foodNutrition(item.food, item.quantity);
  if (item.meal) return scaleNutrition(item.meal.nutrition, item.quantity);
  return { kcal: 0, carbs_g: 0, protein_g: 0, fat_g: 0 };
}

export function buildSchedules(
  schedules: ScheduleRecord[],
  labels: LabelRecord[],
  dayPlans: DayPlanRecord[],
  slots: PlanSlotRecord[],
  items: PlanSlotItemRecord[],
  library: LibraryLookup,
): Schedule[] {
  const labelById = new Map(labels.map((l) => [l.id, l]));

  const itemsBySlot = new Map<string, SlotItem[]>();
  for (const item of [...items].sort((a, b) => a.sort - b.sort)) {
    const food = item.food ? library.foodById.get(item.food) : undefined;
    const meal = item.meal ? library.mealById.get(item.meal) : undefined;
    if (!food && !meal) continue;
    const resolved = { food, meal, quantity: item.quantity };
    itemsBySlot.set(item.slot, [
      ...(itemsBySlot.get(item.slot) ?? []),
      { id: item.id, ...resolved, name: (food ?? meal)!.name, nutrition: roundNutrition(slotItemNutrition(resolved)) },
    ]);
  }

  const slotsByDay = new Map<string, Slot[]>();
  for (const slot of [...slots].sort((a, b) => a.time.localeCompare(b.time) || a.sort - b.sort)) {
    const slotItems = itemsBySlot.get(slot.id) ?? [];
    slotsByDay.set(slot.day_plan, [
      ...(slotsByDay.get(slot.day_plan) ?? []),
      { ...slot, items: slotItems, nutrition: roundNutrition(sumNutrition(slotItems.map((i) => i.nutrition))) },
    ]);
  }

  const daysBySchedule = new Map<string, Day[]>();
  for (const plan of [...dayPlans].sort((a, b) => a.day_index - b.day_index)) {
    daysBySchedule.set(plan.schedule, [...(daysBySchedule.get(plan.schedule) ?? []), { ...plan, slots: slotsByDay.get(plan.id) ?? [] }]);
  }

  return schedules
    .map((schedule) => ({
      ...schedule,
      days: daysBySchedule.get(schedule.id) ?? [],
      labelRecords: schedule.labels.flatMap((id) => labelById.get(id) ?? []),
    }))
    .sort(
      (a, b) =>
        Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    );
}

/** What the planned (non-open) slots of a day add up to. */
export function plannedNutrition(day: Pick<Day, 'slots'>): Nutrition {
  return roundNutrition(sumNutrition(day.slots.filter((s) => s.kind === 'planned').map((s) => s.nutrition)));
}

/** A name for a copy that doesn't clash: "Q4 training (copy)", "Q4 training (copy 2)", … */
export function copyName(name: string, existing: string[]): string {
  const taken = new Set(existing.map((n) => n.toLocaleLowerCase()));
  for (let n = 1; ; n++) {
    const candidate = `${name} (copy${n === 1 ? '' : ` ${n}`})`;
    if (!taken.has(candidate.toLocaleLowerCase())) return candidate;
  }
}
