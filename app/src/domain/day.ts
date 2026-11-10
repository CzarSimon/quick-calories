/** Totals for one logged day: eaten so far, projected, and what is left for open slots. */

import type { LogEntryRecord, LogSlotRecord, MacroTargets } from '@/lib/types';

import { addNutrition, ZERO_NUTRITION, type Nutrition } from './nutrition';

export type DaySlotInput = Pick<LogSlotRecord, 'kind' | 'status'> & {
  entries: Pick<LogEntryRecord, 'origin' | 'kcal' | 'carbs_g' | 'protein_g' | 'fat_g'>[];
};

export type DayProjection = {
  /** Confirmed or adjusted slots, plus anything logged ad hoc. */
  consumed: Nutrition;
  /** Consumed plus planned items in slots that are still pending. */
  projected: Nutrition;
  /** Targets minus projected. Negative values mean the day is projected over target. */
  remaining: Nutrition;
  /** Budget for the open slots that have nothing logged yet; null when there are none. */
  openBudget: Nutrition | null;
  pendingSlots: number;
};

export function projectDay(slots: DaySlotInput[], targets: MacroTargets): DayProjection {
  let consumed = ZERO_NUTRITION;
  let pending = ZERO_NUTRITION;
  let pendingSlots = 0;
  let unresolvedOpenSlots = 0;

  for (const slot of slots) {
    if (slot.status === 'skipped') continue;
    const resolved = slot.status === 'confirmed' || slot.status === 'adjusted';
    if (!resolved && slot.kind === 'planned') pendingSlots++;
    if (!resolved && slot.kind === 'open' && slot.entries.length === 0) unresolvedOpenSlots++;

    for (const entry of slot.entries) {
      // Something logged by hand was eaten; a planned item only counts once its slot is resolved.
      if (resolved || entry.origin === 'adhoc') consumed = addNutrition(consumed, entry);
      else pending = addNutrition(pending, entry);
    }
  }

  const projected = addNutrition(consumed, pending);
  const remaining: Nutrition = {
    kcal: targets.kcal - projected.kcal,
    carbs_g: targets.carbs_g - projected.carbs_g,
    protein_g: targets.protein_g - projected.protein_g,
    fat_g: targets.fat_g - projected.fat_g,
  };

  return { consumed, projected, remaining, openBudget: unresolvedOpenSlots > 0 ? remaining : null, pendingSlots };
}
