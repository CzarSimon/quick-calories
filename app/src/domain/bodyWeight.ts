/** Body weight used for a microcycle: the previous microcycle's average, with fallbacks (PRD §4). */

import type { IsoDate, MicrocycleRecord } from '@/lib/types';

import { addDays, type Microcycle } from './periodisation';

export type WeightSample = { date: IsoDate; kg: number };
export type ResolvedBodyWeight = { kg: number; source: Exclude<MicrocycleRecord['bw_source'], ''> };

/**
 * Average weight over a microcycle, or null when there are no samples in it.
 * Several weigh-ins on one day count as one (their mean), so a day with many readings does not dominate.
 */
export function averageWeight(samples: WeightSample[], microcycle: Microcycle): number | null {
  const end = addDays(microcycle.startDate, microcycle.length - 1);
  const byDay = new Map<IsoDate, number[]>();
  for (const s of samples) {
    if (s.date < microcycle.startDate || s.date > end || !(s.kg > 0)) continue;
    byDay.set(s.date, [...(byDay.get(s.date) ?? []), s.kg]);
  }
  if (byDay.size === 0) return null;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.round(mean([...byDay.values()].map(mean)) * 10) / 10;
}

/**
 * Pick the body weight for a new microcycle:
 * the previous microcycle's Apple Health average, else the last weight used, else the manual fallback.
 */
export function resolveBodyWeight(input: {
  previousMicrocycleAverageKg: number | null;
  lastUsedKg: number | null;
  fallbackKg: number | null;
}): ResolvedBodyWeight | null {
  if (input.previousMicrocycleAverageKg && input.previousMicrocycleAverageKg > 0) {
    return { kg: input.previousMicrocycleAverageKg, source: 'healthkit' };
  }
  if (input.lastUsedKg && input.lastUsedKg > 0) return { kg: input.lastUsedKg, source: 'previous' };
  if (input.fallbackKg && input.fallbackKg > 0) return { kg: input.fallbackKg, source: 'manual' };
  return null;
}
