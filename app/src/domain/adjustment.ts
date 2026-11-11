/**
 * Planned microcycle adjustment (deficit or surplus vs maintenance) and the resulting
 * base targets for every day of a schedule (DESIGN.md §4).
 */

import type { DayPlanRecord, MacroTargets, ScheduleRecord } from '@/lib/types';

import { applyKcalChange, deriveMacros, macroFloors, type MacroSettings } from './macros';

export type AdjustmentDay = Pick<DayPlanRecord, 'adjustment_included' | 'adjustment_custom_kcal'>;
export type AdjustmentMode = ScheduleRecord['adjustment_mode'];

export type AdjustmentSpread = {
  /** Signed kcal per day, in day order. */
  perDay: number[];
  /** Part of the total that no day carries (no included days, or custom amounts that don't add up). */
  unplacedKcal: number;
};

/**
 * Split the microcycle adjustment over the days.
 * - `even`: equal whole-kcal shares over the included days; leftover kcal go to the last included days.
 * - `custom`: each included day's own amount. `unplacedKcal` is non-zero when they don't sum to the total.
 */
export function spreadAdjustment(totalKcal: number, days: AdjustmentDay[], mode: AdjustmentMode): AdjustmentSpread {
  const perDay = days.map(() => 0);
  const included = days.map((d, i) => (d.adjustment_included ? i : -1)).filter((i) => i >= 0);
  if (totalKcal === 0 || included.length === 0) return { perDay, unplacedKcal: totalKcal };

  if (mode === 'custom') {
    for (const i of included) perDay[i] = days[i].adjustment_custom_kcal || 0;
    return { perDay, unplacedKcal: totalKcal - perDay.reduce((a, b) => a + b, 0) };
  }

  const sign = Math.sign(totalKcal);
  const abs = Math.abs(totalKcal);
  const share = Math.floor(abs / included.length);
  const extra = abs - share * included.length;
  included.forEach((dayIndex, n) => {
    const bonus = n >= included.length - extra ? 1 : 0;
    perDay[dayIndex] = sign * (share + bonus);
  });
  return { perDay, unplacedKcal: 0 };
}

export type DayPlanInput = Pick<
  DayPlanRecord,
  'kcal' | 'macro_overrides' | 'adjustment_included' | 'adjustment_custom_kcal'
>;

export type BaseTargetDay = {
  /** Targets before the adjustment (maintenance-level fuel, including any accepted imbalance). */
  maintenance: MacroTargets;
  /** Targets after this day's share of the adjustment. This is what a day log starts from. */
  base: MacroTargets;
  adjustmentKcal: number;
  /** Part of this day's share that fat and carb floors would not allow. */
  unappliedKcal: number;
};

export type BaseTargets = {
  days: BaseTargetDay[];
  maintenanceKcal: number;
  /** Sum of the base targets: what the microcycle should add up to. */
  goalKcal: number;
  /** Adjustment that could not be placed (floors, no included days, or bad custom amounts). */
  unappliedKcal: number;
};

/** Base targets for every day of a schedule at a given body weight. */
export function buildBaseTargets(
  plans: DayPlanInput[],
  schedule: Pick<ScheduleRecord, 'adjustment_kcal' | 'adjustment_mode'>,
  bwKg: number,
  settings: MacroSettings,
): BaseTargets {
  const floors = macroFloors(bwKg, settings);
  const spread = spreadAdjustment(schedule.adjustment_kcal || 0, plans, schedule.adjustment_mode);

  const days = plans.map((plan, i): BaseTargetDay => {
    const maintenance = deriveMacros(plan.kcal, bwKg, settings, plan.macro_overrides).targets;
    const { targets: base, appliedKcal } = applyKcalChange(maintenance, spread.perDay[i], floors);
    return { maintenance, base, adjustmentKcal: appliedKcal, unappliedKcal: spread.perDay[i] - appliedKcal };
  });

  return {
    days,
    maintenanceKcal: days.reduce((sum, d) => sum + d.maintenance.kcal, 0),
    goalKcal: days.reduce((sum, d) => sum + d.base.kcal, 0),
    unappliedKcal: spread.unplacedKcal + days.reduce((sum, d) => sum + d.unappliedKcal, 0),
  };
}
