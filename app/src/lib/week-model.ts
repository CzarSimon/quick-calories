/**
 * Pure microcycle summary: what each day's target is after correcting for earlier days, how the
 * running balance stands, and what will not be recovered.
 *
 * Rules (DESIGN.md §3 and §4):
 * - The balance is the sum of (intake − base target) over earlier days of the microcycle.
 * - An earlier day counts only when it is complete; a day with no log, or with an open slot left
 *   empty, is unknown and is treated as on target.
 * - Today's target is fixed when the day is created. Days after today are corrected for the
 *   balance plus what today is expected to add to it.
 */

import { dayOutcome, microcycleDates, microcycleDayLabel, redistribute, type Microcycle, type RedistributionSettings } from '@/domain';
import type { LoggedSlot } from '@/lib/daylog-model';
import type { DayLogRecord, IsoDate, MacroTargets } from '@/lib/types';

export type WeekDayLog = { dayLog: DayLogRecord; slots: LoggedSlot[] };

export type WeekInput = {
  microcycle: Microcycle;
  today: IsoDate;
  logs: WeekDayLog[];
  /** Base targets per day index from the active schedule; null where unknown. */
  planBase: (MacroTargets | null)[];
  /** Body weight and settings for redistribution; without a weight, targets stay at base. */
  bwKg: number | null;
  settings: RedistributionSettings;
};

export type WeekDay = {
  date: IsoDate;
  dayIndex: number;
  label: string;
  when: 'past' | 'today' | 'future';
  logged: boolean;
  /** The planned target, before any correction. */
  base: MacroTargets | null;
  /** The target after correction for earlier days. */
  target: MacroTargets | null;
  /** Confirmed and hand-logged kcal; null when the day has no log. */
  eatenKcal: number | null;
  /** Eaten plus unconfirmed planned meals; null when the day has no log. */
  expectedKcal: number | null;
  complete: boolean;
  unconfirmed: number;
  /** Whether this day is part of the balance. */
  counted: boolean;
};

export type WeekSummary = {
  days: WeekDay[];
  /** Sum of base targets: what the microcycle should add up to. Null when a day's plan is unknown. */
  goalKcal: number | null;
  /** Balance of the earlier, counted days. Positive = eaten more than planned. */
  balanceKcal: number;
  /** What today is expected to add to the balance (0 when today is not in this microcycle or has no log). */
  todayDeltaKcal: number;
  /** Balance that the remaining days cannot absorb. For a finished microcycle, its final balance. */
  unrecoveredKcal: number;
  /** Earlier days left out of the balance because they are incomplete or were never logged. */
  uncountedDays: number;
};

export function summarizeMicrocycle({ microcycle, today, logs, planBase, bwKg, settings }: WeekInput): WeekSummary {
  const byDate = new Map(logs.map((l) => [l.dayLog.date, l]));
  const dates = microcycleDates(microcycle);

  const days: WeekDay[] = dates.map((date, dayIndex) => {
    const log = byDate.get(date);
    const when = date < today ? 'past' : date === today ? 'today' : 'future';
    const outcome = log ? dayOutcome(log.slots) : null;
    const base = log?.dayLog.base_targets ?? planBase[dayIndex] ?? null;
    return {
      date,
      dayIndex,
      label: microcycleDayLabel(microcycle, dayIndex),
      when,
      logged: !!log,
      base,
      target: log?.dayLog.targets ?? base,
      eatenKcal: outcome?.eatenKcal ?? null,
      expectedKcal: outcome?.expectedKcal ?? null,
      complete: !!outcome?.complete,
      unconfirmed: outcome?.unconfirmed ?? 0,
      counted: when === 'past' && !!outcome?.complete && !!base,
    };
  });

  const balanceKcal = days.reduce((sum, d) => (d.counted ? sum + d.expectedKcal! - d.base!.kcal : sum), 0);
  const uncountedDays = days.filter((d) => d.when === 'past' && !d.counted).length;
  const goalKcal = days.every((d) => d.base) ? days.reduce((sum, d) => sum + d.base!.kcal, 0) : null;

  const todayDay = days.find((d) => d.when === 'today');
  const future = days.filter((d) => d.when === 'future');
  let todayDeltaKcal = 0;
  let unrecoveredKcal = balanceKcal;

  // Days still to come can only be corrected when their plan and the body weight are known.
  const correctable = (list: WeekDay[]) => !!bwKg && list.every((d) => d.base);

  if (todayDay?.logged && todayDay.base && todayDay.target) {
    // An open slot that is still empty is assumed to end on target, not at zero.
    const assumed = todayDay.complete ? todayDay.expectedKcal! : Math.max(todayDay.expectedKcal!, todayDay.target.kcal);
    todayDeltaKcal = assumed - todayDay.base.kcal;
    unrecoveredKcal = balanceKcal + todayDeltaKcal;
    if (future.length > 0 && correctable(future)) {
      const r = redistribute(balanceKcal + todayDeltaKcal, future.map((d) => d.base!), bwKg!, settings);
      future.forEach((d, i) => (d.target = r.targets[i]));
      unrecoveredKcal = r.unrecoveredKcal;
    }
  } else {
    // Today has no log yet (or this microcycle is not the current one): today is corrected too.
    const remaining = todayDay ? [todayDay, ...future] : future;
    if (remaining.length > 0 && correctable(remaining)) {
      const r = redistribute(balanceKcal, remaining.map((d) => d.base!), bwKg!, settings);
      remaining.forEach((d, i) => (d.target = r.targets[i]));
      unrecoveredKcal = r.unrecoveredKcal;
    }
  }

  return { days, goalKcal, balanceKcal, todayDeltaKcal, unrecoveredKcal, uncountedDays };
}

/** The target a day gets when its log is created today: its base corrected for the balance so far. */
export function targetForNewDay(input: WeekInput): MacroTargets | null {
  const withoutToday = { ...input, logs: input.logs.filter((l) => l.dayLog.date !== input.today) };
  return summarizeMicrocycle(withoutToday).days.find((d) => d.date === input.today)?.target ?? null;
}
