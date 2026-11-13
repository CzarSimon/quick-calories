/**
 * Redistribution of a microcycle's running balance over the days that are left (DESIGN.md §4).
 *
 * The balance is always measured against *base* targets (plan + adjustment), never against
 * already-redistributed targets, and the remaining days are recomputed from their base targets
 * every time. That keeps the calculation idempotent and avoids correcting the same kcal twice.
 */

import type { MacroTargets, SettingsRecord } from '@/lib/types';

import { applyKcalChange, cutCapacityKcal, macroFloors, type MacroSettings } from './macros';

export type RedistributionSettings = MacroSettings & Pick<SettingsRecord, 'max_daily_change_pct'>;

export type Redistribution = {
  /** New targets for the remaining days, in the same order as the input. */
  targets: MacroTargets[];
  /** Signed kcal change applied to each day. */
  changes: number[];
  /** Balance left after redistribution. Positive = surplus that will not be recovered. */
  unrecoveredKcal: number;
};

const STEP = 10;
const floorToStep = (x: number) => Math.floor(x / STEP) * STEP;
const roundToStep = (x: number) => Math.round(x / STEP) * STEP;

/** Running balance over closed days: eaten minus base target. Positive = surplus. */
export function cumulativeBalance(closedDays: { consumedKcal: number; baseKcal: number }[]): number {
  return closedDays.reduce((sum, d) => sum + d.consumedKcal - d.baseKcal, 0);
}

/**
 * Spread `-balanceKcal` over the remaining days.
 * - Proportional to each day's base kcal.
 * - No day changes by more than `max_daily_change_pct` of its base kcal.
 * - Cuts never take fat or carbs below their floors; protein is untouched. Additions go to carbs.
 * - Changes are multiples of 10 kcal.
 */
export function redistribute(
  balanceKcal: number,
  futureBase: MacroTargets[],
  bwKg: number,
  settings: RedistributionSettings,
): Redistribution {
  const floors = macroFloors(bwKg, settings);
  const cutting = balanceKcal > 0;
  const want = Math.abs(balanceKcal);

  const limits = futureBase.map((day) => {
    const cap = floorToStep((day.kcal * settings.max_daily_change_pct) / 100);
    return Math.max(0, cutting ? Math.min(cap, floorToStep(cutCapacityKcal(day, floors))) : cap);
  });
  const totalLimit = limits.reduce((a, b) => a + b, 0);
  const toPlace = Math.min(floorToStep(want), totalLimit);

  // Water-fill: proportional shares, clamping days that hit their limit and re-sharing the rest.
  const amounts = futureBase.map(() => 0);
  let active = futureBase.map((_, i) => i).filter((i) => limits[i] > 0);
  let remaining = toPlace;
  while (remaining > 0 && active.length > 0) {
    const weight = active.reduce((sum, i) => sum + futureBase[i].kcal, 0);
    const saturated = active.filter((i) => (remaining * futureBase[i].kcal) / weight >= limits[i]);
    if (saturated.length === 0) {
      for (const i of active) amounts[i] = (remaining * futureBase[i].kcal) / weight;
      break;
    }
    for (const i of saturated) {
      amounts[i] = limits[i];
      remaining -= limits[i];
    }
    active = active.filter((i) => !saturated.includes(i));
  }

  // Round to 10 kcal and push the rounding residue onto the last days that still have room.
  const rounded = amounts.map((a, i) => Math.min(limits[i], roundToStep(a)));
  let residue = toPlace - rounded.reduce((a, b) => a + b, 0);
  for (let i = rounded.length - 1; i >= 0 && residue !== 0; i--) {
    const next = Math.max(0, Math.min(limits[i], rounded[i] + residue));
    residue -= next - rounded[i];
    rounded[i] = next;
  }

  const sign = cutting ? -1 : 1;
  const results = futureBase.map((day, i) => applyKcalChange(day, sign * rounded[i], floors));
  const changes = results.map((r) => r.appliedKcal);
  const placed = changes.reduce((a, b) => a + b, 0);

  return {
    targets: results.map((r) => r.targets),
    changes,
    unrecoveredKcal: balanceKcal + placed,
  };
}

/**
 * What the remaining days would look like if today ended at `todayProjectedKcal`.
 * `closedBalanceKcal` is the balance of the already closed days.
 */
export function previewRedistribution(
  closedBalanceKcal: number,
  today: { projectedKcal: number; baseKcal: number },
  futureBase: MacroTargets[],
  bwKg: number,
  settings: RedistributionSettings,
): Redistribution {
  return redistribute(closedBalanceKcal + today.projectedKcal - today.baseKcal, futureBase, bwKg, settings);
}
